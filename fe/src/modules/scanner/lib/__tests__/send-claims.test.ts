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
import {
  enqueueClaim,
  listClaims,
  markClaim,
  type QueuedClaim,
  type RecordState,
} from "@/modules/scanner/lib/scanner-store";

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

type ChainRecord = { state: RecordState; claimedAt: bigint | null };

function deps(send: (tokenId: number) => Promise<{ txHash: string; ledger: number | null }>) {
  return {
    send: vi.fn(send),
    // By default the chain still holds every record as Entered, which is what a
    // failure that did not reach the ledger leaves behind.
    recordOf: vi.fn<(tokenId: number) => Promise<ChainRecord>>(async () => ({ state: "Entered", claimedAt: null })),
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

    d.recordOf.mockResolvedValue({ state: "RacepackClaimed", claimedAt: 1_790_000_000n });

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
    d.recordOf.mockRejectedValue(new Error("rpc down"));

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

  it("tells a lost two-desk race from the ledger when the error does not say so (STE-62)", async () => {
    // The rehearsal, exactly: this desk's claim for 7901 lost to another desk
    // in the same ledger, and the SDK threw an unrelated message instead of
    // AlreadyClaimed (STE-61). Before, the run stopped here with "Something went
    // wrong", 7901 never reached Refused, and 7902 and 7903 were never sent.
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7901, 7902, 7903]);
    const d = deps(async (tokenId) => {
      if (tokenId === 7901) {
        throw new Error("could not be simulated: Cannot read properties of undefined (reading 'type')");
      }
      return landed(tokenId);
    });
    d.recordOf.mockImplementation(
      async (tokenId: number): Promise<ChainRecord> =>
        tokenId === 7901
          ? { state: "RacepackClaimed", claimedAt: 1_790_000_123n }
          : { state: "Entered", claimedAt: null },
    );

    expect(await sendClaims(claims, d)).toBeNull();
    expect(await listClaims(eventId)).toEqual([
      expect.objectContaining({ tokenId: 7901, status: "refused", reason: "already-claimed", claimedAt: "1790000123" }),
      expect.objectContaining({ tokenId: 7902, status: "sent" }),
      expect.objectContaining({ tokenId: 7903, status: "sent" }),
    ]);
    expect(d.recordOf).toHaveBeenCalledWith(7901);
  });

  it("stops on an unclear failure only when the chain still holds the record as Entered", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7951, 7952]);
    const d = deps(async () => {
      throw new Error("could not be simulated: something else");
    });

    expect((await sendClaims(claims, d))?.kind).toBe("failed");
    expect(d.send).toHaveBeenCalledTimes(1);
    expect((await listClaims(eventId)).map((row) => row.status)).toEqual(["waiting", "waiting"]);
  });

  it("stops rather than guessing when the record cannot be read either", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7961]);
    const d = deps(async () => {
      throw new Error("could not be simulated: something else");
    });
    d.recordOf.mockRejectedValue(new Error("rpc down"));

    expect((await sendClaims(claims, d))?.kind).toBe("failed");
    expect((await listClaims(eventId))[0]).toMatchObject({ status: "waiting" });
  });

  it("does not re-read the chain for a declined prompt or no answer", async () => {
    const eventId = nextEvent++;
    const claims = await queue(eventId, [7971]);
    const d = deps(async () => {
      throw new Error("User declined access");
    });

    expect(await sendClaims(claims, d)).toEqual({ kind: "declined" });
    expect(d.recordOf).not.toHaveBeenCalled();
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
