/**
 * The sender, against a stubbed chain and the real store (fake-indexeddb), so
 * what is asserted is what a volunteer would find in the queue afterwards.
 *
 * The case the ticket names is here: a queue of three where the middle one
 * lost to another desk, sent in order, one at a time, with the loser kept.
 */
import { SterunContractError, classifyContractError } from "@sterunxyz/sdk";
import { describe, expect, it, vi } from "vitest";

import { sendClaims } from "@/modules/scanner/lib/send-claims";
import { enqueueClaim, listClaims, markClaim, type QueuedClaim } from "@/modules/scanner/lib/scanner-store";

let nextEvent = 700;

function revert(code: number, method = "claimRacepack"): SterunContractError {
  return new SterunContractError(classifyContractError(code), method, `HostError: Error(Contract, #${code})`);
}

async function queue(eventId: number, tokenIds: number[]): Promise<QueuedClaim[]> {
  for (const [index, tokenId] of tokenIds.entries()) {
    await enqueueClaim({
      tokenId,
      bibNo: tokenId,
      eventId,
      scannedAt: `2026-09-27T01:00:0${index}.000Z`,
      status: "waiting",
    });
  }
  return listClaims(eventId);
}

function deps(send: (tokenId: number) => Promise<{ txHash: string; ledger: number | null }>) {
  return {
    send: vi.fn(send),
    claimedAtOf: vi.fn(async () => 1_790_000_000n),
    mark: markClaim,
    onSending: vi.fn(),
  };
}

const landed = async (tokenId: number) => ({ txHash: `hash-${tokenId}`, ledger: 4_469_902 });

describe("sending the queue", () => {
  it("sends in the order the packs were handed over, one at a time, and keeps the one another desk won", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7003, 7001, 7002]);

    let inFlight = 0;
    let most = 0;
    const d = deps(async (tokenId) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (tokenId === 7001) throw revert(102);
      return landed(tokenId);
    });

    expect(await sendClaims(claims, d)).toBeNull();

    expect(d.send.mock.calls.map(([tokenId]) => tokenId)).toEqual([7003, 7001, 7002]);
    expect(most).toBe(1);
    expect(await listClaims(eventId)).toEqual([
      expect.objectContaining({ tokenId: 7003, status: "sent", txHash: "hash-7003", ledger: 4_469_902 }),
      expect.objectContaining({ tokenId: 7001, status: "refused", reason: "already-claimed", claimedAt: "1790000000" }),
      expect.objectContaining({ tokenId: 7002, status: "sent", txHash: "hash-7002" }),
    ]);
    expect(d.onSending).toHaveBeenLastCalledWith(null);
  });

  it("sends only what is still waiting", async () => {
    const eventId = nextEvent++;
    await queue(eventId, [7101, 7102]);
    await markClaim(7101, { status: "sent", txHash: "earlier", ledger: 1 });

    const d = deps(landed);
    await sendClaims(await listClaims(eventId), d);

    expect(d.send.mock.calls.map(([tokenId]) => tokenId)).toEqual([7102]);
  });

  it("keeps a refused row even when the collection time cannot be read", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7201]);
    const d = deps(async () => {
      throw revert(102);
    });
    d.claimedAtOf.mockRejectedValue(new Error("rpc down"));

    expect(await sendClaims(claims, d)).toBeNull();
    const [row] = await listClaims(eventId);
    expect(row).toMatchObject({ status: "refused", reason: "already-claimed" });
    expect(row?.claimedAt).toBeUndefined();
  });

  it("refuses a token the chain does not have, and carries on", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7301, 7302]);
    const d = deps(async (tokenId) => {
      if (tokenId === 7301) throw revert(101);
      return landed(tokenId);
    });

    expect(await sendClaims(claims, d)).toBeNull();
    expect((await listClaims(eventId)).map((row) => row.status)).toEqual(["refused", "sent"]);
  });
});

describe("stopping", () => {
  it("stops for a wallet that is not a scanner, and leaves every row waiting for one that is", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7401, 7402]);
    const d = deps(async () => {
      throw revert(104);
    });

    expect(await sendClaims(claims, d)).toEqual({ kind: "not-scanner" });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect((await listClaims(eventId)).map((row) => row.status)).toEqual(["waiting", "waiting"]);
  });

  it("stops when the volunteer declines, and sends nothing after", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7501, 7502]);
    const d = deps(async () => {
      throw new Error("User declined access");
    });

    expect(await sendClaims(claims, d)).toEqual({ kind: "declined" });
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("does not read no answer as success: the row keeps waiting", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7601]);
    const d = deps(async () => {
      throw new Error("Waited for transaction to complete, but it did not");
    });

    expect(await sendClaims(claims, d)).toEqual({ kind: "no-answer" });
    expect((await listClaims(eventId))[0]).toMatchObject({ status: "waiting" });
  });

  it("stops on anything else with a sentence for the screen, after keeping what already landed", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7701, 7702]);
    const d = deps(async (tokenId) => {
      if (tokenId === 7702) throw new TypeError("Failed to fetch");
      return landed(tokenId);
    });

    expect(await sendClaims(claims, d)).toEqual({ kind: "failed", message: "Something went wrong. Please try again." });
    expect((await listClaims(eventId)).map((row) => row.status)).toEqual(["sent", "waiting"]);
  });

  it("does not trust a revert from some other call as a claim's answer", async () => {
    // Error codes carry no contract identity. A 102 from anything but
    // claimRacepack cannot be read as "another desk won".
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7801]);
    const d = deps(async () => {
      throw revert(102, "enter");
    });

    expect((await sendClaims(claims, d))?.kind).toBe("failed");
    expect((await listClaims(eventId))[0]).toMatchObject({ status: "waiting" });
  });
});
