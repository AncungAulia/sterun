import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { buildEventDocument, documentHash, type EventDocumentDraft } from "@/lib/event-document";
import { fetchEventMetadata, gunStartConflict } from "@/lib/metadata";

/** 2026-10-04T06:00+07:00 */
const STARTS_AT = 1_791_068_400n;

function draft(overrides: Partial<EventDocumentDraft> = {}): EventDocumentDraft {
  return {
    startsAt: STARTS_AT,
    description: "A road race around the stadium.",
    locationName: "Gelora Bung Karno, Jakarta",
    locationLink: "https://www.google.com/maps/@-6.2185,106.8026,17z",
    posterUrl: "https://cdn.example.test/poster.png",
    waiverUrl: "",
    registrationOpens: "",
    registrationCloses: "",
    racepackStarts: "",
    racepackEnds: "",
    racepackVenue: "",
    racepackVenueLink: "",
    cutOff: "",
    ...overrides,
  };
}

describe("buildEventDocument", () => {
  describe("positive", () => {
    it("writes the gun start from the same instant the chain gets", () => {
      // The document and `starts_at` are two records of one fact. Deriving both
      // from one input is the only way they cannot disagree, and there is a
      // whole warning banner on the event page for when they do.
      const document = JSON.parse(buildEventDocument(draft()));
      const raceDay = document.schedule.find((p: { phase: string }) => p.phase === "race_day");

      expect(Date.parse(raceDay.gun_start) / 1000).toBe(Number(STARTS_AT));
    });

    it("carries the fields the event page reads", () => {
      const document = JSON.parse(buildEventDocument(draft()));

      expect(document.description).toBe("A road race around the stadium.");
      expect(document.location.name).toBe("Gelora Bung Karno, Jakarta");
      expect(document.poster_url).toBe("https://cdn.example.test/poster.png");
    });

    it("puts the pin from a pasted maps link into the document", () => {
      const document = JSON.parse(buildEventDocument(draft()));

      expect(document.location).toEqual({
        name: "Gelora Bung Karno, Jakarta",
        lat: -6.2185,
        lng: 106.8026,
      });
    });

    it("keeps the location name when the link has no pin in it", () => {
      // A shortened maps link carries no coordinates, and losing the name over
      // that would be a worse trade than showing a place with no map.
      const document = JSON.parse(
        buildEventDocument(draft({ locationLink: "https://maps.app.goo.gl/abc" })),
      );

      expect(document.location).toEqual({ name: "Gelora Bung Karno, Jakarta" });
    });

    it("pins the race pack venue the same way", () => {
      const document = JSON.parse(
        buildEventDocument(
          draft({
            racepackStarts: "2026-10-03T02:00:00Z",
            racepackEnds: "2026-10-03T10:00:00Z",
            racepackVenue: "Hall A",
            racepackVenueLink: "https://www.google.com/maps/@-6.2000,106.8000,17z",
          }),
        ),
      );
      const racepack = document.schedule.find((p: { phase: string }) => p.phase === "racepack");

      expect(racepack).toMatchObject({ venue: "Hall A", venue_lat: -6.2, venue_lng: 106.8 });
    });

    it("is byte-stable, so the same draft hashes to the same value twice", () => {
      // metadata_hash commits to exact bytes. A document that serialises
      // differently on a second render would break its own event.
      expect(buildEventDocument(draft())).toBe(buildEventDocument(draft()));
    });

    it("ends with a newline, like every other file a person will save", () => {
      expect(buildEventDocument(draft()).endsWith("\n")).toBe(true);
    });
  });

  describe("edge", () => {
    it("leaves out fields the organiser did not fill in", () => {
      // Not empty strings. The document is public and permanent, and a
      // `"waiver_url": ""` is a broken link that looks like an oversight
      // forever.
      const document = JSON.parse(buildEventDocument(draft({ posterUrl: "", description: "" })));

      expect(document).not.toHaveProperty("poster_url");
      expect(document).not.toHaveProperty("description");
    });

    it("still writes the race day phase when nothing optional was filled in", () => {
      // gun_start is the one thing the document must always carry, because it
      // is the claim the chain can be checked against.
      const document = JSON.parse(
        buildEventDocument({
          startsAt: STARTS_AT,
          description: "",
          locationName: "",
          locationLink: "",
          posterUrl: "",
          waiverUrl: "",
          registrationOpens: "",
          registrationCloses: "",
          racepackStarts: "",
          racepackEnds: "",
          racepackVenue: "",
          racepackVenueLink: "",
          cutOff: "",
        }),
      );

      expect(document.schedule).toHaveLength(1);
      expect(document.schedule[0].phase).toBe("race_day");
    });

    it("includes the registration window only when both ends are given", () => {
      const partial = JSON.parse(
        buildEventDocument(draft({ registrationOpens: "2026-09-08T00:00:00Z" })),
      );
      const full = JSON.parse(
        buildEventDocument(
          draft({
            registrationOpens: "2026-09-08T00:00:00Z",
            registrationCloses: "2026-10-01T23:59:00Z",
          }),
        ),
      );

      expect(partial.schedule.map((p: { phase: string }) => p.phase)).toEqual(["race_day"]);
      expect(full.schedule.map((p: { phase: string }) => p.phase)).toEqual([
        "registration",
        "race_day",
      ]);
    });
  });
});

describe("documentHash", () => {
  it("is the sha256 of the exact bytes, which is what the chain commits to", async () => {
    const text = buildEventDocument(draft());

    expect(await documentHash(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });
});

describe("what STE-17 writes, STE-13 reads", () => {
  /**
   * The two halves of the same convention, checked against each other rather
   * than each against its own idea of the format. The console writes documents
   * and the event page verifies them, and a disagreement between them produces
   * an event that can never be fixed, because events are frozen.
   */
  it("round-trips: a generated document verifies and agrees with the chain", async () => {
    const text = buildEventDocument(draft());
    const hash = await documentHash(text);
    const fetcher = () =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) });
    vi.stubGlobal("fetch", fetcher);

    const result = await fetchEventMetadata("https://example.test/e.json", hash);

    expect(result.status).toBe("verified");
    if (result.status !== "verified") throw new Error("unreachable");
    expect(result.document.description).toBe("A road race around the stadium.");
    expect(gunStartConflict(result.document, STARTS_AT)).toBe(false);

    vi.unstubAllGlobals();
  });
});
