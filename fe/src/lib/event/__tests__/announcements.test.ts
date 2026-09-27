// @vitest-environment node
// Node, not jsdom: jsdom swaps in its own realm's Uint8Array, and stellar-sdk's
// ed25519 then refuses the Buffer it made itself (fe/CLAUDE.md, Tests).
import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  announcementToSign,
  isSignedByOrganiser,
  listAnnouncements,
  publishAnnouncement,
  type Announcement,
} from "../announcements";

const PASSPHRASE = "Test SDF Network ; September 2015";
const REGISTRY = "CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU";

const organiser = Keypair.random();
const stranger = Keypair.random();

/** Signed the way a browser wallet signs it: SEP-53 over the announcement text. */
function signed(
  key: Keypair,
  overrides: Partial<Omit<Announcement, "signature" | "signer">> = {},
): Announcement {
  const fields = {
    id: "1",
    eventId: 7,
    publishedAt: "2026-09-18T01:12:00.000Z",
    body: "Entries for 10K raised from 500 to 800.",
    networkPassphrase: PASSPHRASE,
    eventRegistry: REGISTRY,
    ...overrides,
  };
  const message = announcementToSign(fields);
  return {
    ...fields,
    signer: key.publicKey(),
    signature: Buffer.from(key.signMessage(message)).toString("base64"),
  };
}

function respond(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("isSignedByOrganiser", () => {
  it("accepts the organiser's own signature for this race", () => {
    expect(isSignedByOrganiser(signed(organiser), organiser.publicKey(), 7)).toBe(true);
  });

  it("refuses a valid signature from anyone but the organiser the chain names", () => {
    expect(isSignedByOrganiser(signed(stranger), organiser.publicKey(), 7)).toBe(false);
  });

  it("refuses a body changed after signing", () => {
    const changed = { ...signed(organiser), body: "Entries for 10K raised from 500 to 9000." };
    expect(isSignedByOrganiser(changed, organiser.publicKey(), 7)).toBe(false);
  });

  it("refuses an announcement signed for another race, network or registry", () => {
    expect(isSignedByOrganiser(signed(organiser, { eventId: 8 }), organiser.publicKey(), 7)).toBe(false);
    expect(
      isSignedByOrganiser(
        signed(organiser, { networkPassphrase: "Public Global Stellar Network ; September 2015" }),
        organiser.publicKey(),
        7,
      ),
    ).toBe(false);
    expect(
      isSignedByOrganiser(
        signed(organiser, { eventRegistry: "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64" }),
        organiser.publicKey(),
        7,
      ),
    ).toBe(false);
  });

  it("says false rather than throwing on a signature that is not one", () => {
    const junk = { ...signed(organiser), signature: "bm90IGEgc2lnbmF0dXJl" };
    expect(isSignedByOrganiser(junk, organiser.publicKey(), 7)).toBe(false);
    const badDate = { ...signed(organiser), publishedAt: "18 Sep 2026" };
    expect(isSignedByOrganiser(badDate, organiser.publicKey(), 7)).toBe(false);
  });
});

describe("the announcements route", () => {
  it("posts the signed fields in the server's names and reads the row back", async () => {
    const announcement = signed(organiser);
    const fetchMock = respond(
      {
        id: "12",
        event_id: 7,
        published_at: announcement.publishedAt,
        received_at: announcement.publishedAt,
        body: announcement.body,
        signer: announcement.signer,
        signature: announcement.signature,
        scheme: "sep53",
        network_passphrase: PASSPHRASE,
        event_registry: REGISTRY,
        message: "",
      },
      201,
    );

    const stored = await publishAnnouncement({
      eventId: 7,
      publishedAt: announcement.publishedAt,
      body: announcement.body,
      signer: announcement.signer,
      signature: announcement.signature,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/events\/7\/announcements$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      published_at: announcement.publishedAt,
      body: announcement.body,
      signer: announcement.signer,
      signature: announcement.signature,
    });
    expect(stored).toMatchObject({ id: "12", eventId: 7, body: announcement.body });
  });

  it("lists announcements in the order the server sends them", async () => {
    respond({
      event_id: 7,
      count: 2,
      announcements: [
        { id: "2", event_id: 7, published_at: "2026-09-18T01:12:00.000Z", body: "b", signer: "G", signature: "s", network_passphrase: PASSPHRASE, event_registry: REGISTRY },
        { id: "1", event_id: 7, published_at: "2026-09-10T12:40:00.000Z", body: "a", signer: "G", signature: "s", network_passphrase: PASSPHRASE, event_registry: REGISTRY },
      ],
    });
    const rows = await listAnnouncements(7);
    expect(rows.map((row) => row.id)).toEqual(["2", "1"]);
  });

  it("throws the app's own error when the server refuses", async () => {
    respond({ error: "stale-announcement", message: "sign it again" }, 400);
    await expect(
      publishAnnouncement({ eventId: 7, publishedAt: "x", body: "b", signer: "G", signature: "s" }),
    ).rejects.toMatchObject({ code: "stale-announcement" });
  });
});
