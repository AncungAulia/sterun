import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEventDocument } from "@/lib/event-document";
import { fetchEventMetadata, gunStartConflict, readEventDocument } from "@/lib/metadata";

const DOCUMENT = {
  poster_url: "https://cdn.example.test/poster.png",
  location: { name: "GBK, Jakarta", lat: -6.218, lng: 106.802 },
  schedule: [
    { phase: "registration", starts_at: "2026-09-01T00:00+07:00", ends_at: "2026-09-20T23:59+07:00" },
    { phase: "race_day", gun_start: "2026-09-28T05:30+07:00", cut_off: "2026-09-28T11:00+07:00" },
  ],
  description: "A road race.",
  waiver_url: "https://example.test/waiver.pdf",
};

const BODY = JSON.stringify(DOCUMENT, null, 2);
const HASH = createHash("sha256").update(BODY, "utf8").digest("hex");
const URI = "https://sterun.xyz/events/demo.json";

function respondWith(body: string, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: init.status ?? (ok ? 200 : 404),
      text: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEventMetadata", () => {
  describe("positive", () => {
    it("returns the document when its bytes hash to what the chain committed to", async () => {
      respondWith(BODY);

      const result = await fetchEventMetadata(URI, HASH);

      expect(result.status).toBe("verified");
      if (result.status !== "verified") throw new Error("unreachable");
      expect(result.document.description).toBe("A road race.");
      expect(result.document.location?.name).toBe("GBK, Jakarta");
    });

    it("reads the gun start out of the schedule", async () => {
      respondWith(BODY);

      const result = await fetchEventMetadata(URI, HASH);

      if (result.status !== "verified") throw new Error("unreachable");
      expect(result.document.gunStart).toBe("2026-09-28T05:30+07:00");
    });
  });

  describe("negative", () => {
    it("withholds a document whose bytes do not match the committed hash", async () => {
      // The whole point of metadata_hash is that the poster, the route and the
      // schedule cannot be swapped after people entered. Rendering a document
      // that fails its own commitment would defeat it.
      respondWith(BODY.replace("A road race.", "A different race."));

      const result = await fetchEventMetadata(URI, HASH);

      expect(result.status).toBe("modified");
      expect(result).not.toHaveProperty("document");
    });

    it("reports an unreachable document rather than throwing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network down");
        }),
      );

      const result = await fetchEventMetadata(URI, HASH);

      expect(result.status).toBe("unavailable");
    });

    it("reports a 404 as unavailable", async () => {
      respondWith("Not Found", { ok: false, status: 404 });

      const result = await fetchEventMetadata(URI, HASH);

      expect(result.status).toBe("unavailable");
    });

    it("reports a document that is not JSON as unavailable", async () => {
      const html = "<!doctype html><title>parked domain</title>";
      respondWith(html);

      const result = await fetchEventMetadata(URI, createHash("sha256").update(html).digest("hex"));

      expect(result.status).toBe("unavailable");
    });
  });

  describe("edge", () => {
    it("treats an empty uri as nothing to fetch, without calling the network", async () => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);

      const result = await fetchEventMetadata("", HASH);

      expect(result.status).toBe("unavailable");
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("compares the hash case-insensitively", async () => {
      respondWith(BODY);

      const result = await fetchEventMetadata(URI, HASH.toUpperCase());

      expect(result.status).toBe("verified");
    });

    it("keeps a document that carries none of the optional fields", async () => {
      const bare = "{}";
      respondWith(bare);

      const result = await fetchEventMetadata(URI, createHash("sha256").update(bare).digest("hex"));

      expect(result.status).toBe("verified");
      if (result.status !== "verified") throw new Error("unreachable");
      expect(result.document.description).toBeUndefined();
    });
  });
});

describe("gunStartConflict", () => {
  // 2026-09-28T05:30+07:00
  const STARTS_AT = 1_790_548_200n;

  describe("positive", () => {
    it("finds no conflict when the document agrees with the chain", () => {
      expect(gunStartConflict({ gunStart: "2026-09-28T05:30+07:00" }, STARTS_AT)).toBe(false);
    });

    it("finds no conflict when the same instant is written in another timezone", () => {
      expect(gunStartConflict({ gunStart: "2026-09-27T22:30:00Z" }, STARTS_AT)).toBe(false);
    });
  });

  describe("negative", () => {
    it("flags a document that claims a different start time", () => {
      // One of the two is wrong and the page cannot tell which, so it says so
      // rather than picking a winner.
      expect(gunStartConflict({ gunStart: "2026-09-28T06:30+07:00" }, STARTS_AT)).toBe(true);
    });
  });

  describe("edge", () => {
    it("finds no conflict when the document does not name a gun start", () => {
      expect(gunStartConflict({}, STARTS_AT)).toBe(false);
    });

    it("finds no conflict when the gun start is not a date at all", () => {
      expect(gunStartConflict({ gunStart: "tomorrow morning" }, STARTS_AT)).toBe(false);
    });
  });
});

describe("reading add-ons back", () => {
  /** Serve a document carrying these add_ons, and hand back what was parsed. */
  async function readAddOns(addOns: unknown) {
    const body = JSON.stringify({ ...DOCUMENT, add_ons: addOns }, null, 2);
    respondWith(body);
    const hash = createHash("sha256").update(body, "utf8").digest("hex");
    const result = await fetchEventMetadata(URI, hash);
    if (result.status !== "verified") throw new Error("unreachable");
    return result.document.addOns;
  }

  describe("positive", () => {
    it("reads an item and its chart", async () => {
      const addOns = await readAddOns([
        {
          name: "Event jersey",
          photo_url: "https://cdn.example.test/j.png",
          included_in: ["10K", "HALF"],
          sizes: [{ label: "M", chest_cm: 52, length_cm: 70 }],
        },
      ]);

      expect(addOns).toEqual([
        {
          name: "Event jersey",
          photoUrl: "https://cdn.example.test/j.png",
          includedIn: ["10K", "HALF"],
          sizes: [{ label: "M", chestCm: 52, lengthCm: 70 }],
        },
      ]);
    });
  });

  describe("negative", () => {
    it("ignores an item with no distances, because nobody would receive it", async () => {
      expect(await readAddOns([{ name: "Event jersey", included_in: [] }])).toBeUndefined();
    });

    it("ignores an item with no name", async () => {
      expect(await readAddOns([{ included_in: ["10K"] }])).toBeUndefined();
    });

    it("ignores a size with no label", async () => {
      const addOns = await readAddOns([
        { name: "Jersey", included_in: ["10K"], sizes: [{ chest_cm: 52 }] },
      ]);

      expect(addOns?.[0]).not.toHaveProperty("sizes");
    });
  });

  describe("edge", () => {
    it("survives a document where add_ons is not a list", async () => {
      // The bytes are already proven to be the organiser's, so this is shaping
      // known-good data. It still must not throw on a document written by some
      // other client that guessed the shape.
      expect(await readAddOns("jersey")).toBeUndefined();
    });
  });
});

describe("reading the timeline's details back", () => {
  /**
   * Written by the wizard's own writer rather than typed here, so a key the
   * writer spells one way and the reader another fails this test instead of
   * quietly leaving a hole in the timeline.
   */
  function written() {
    return buildEventDocument({
      startsAt: 1_795_824_000n,
      raceDate: "2026-11-21",
      categories: [
        { code: "10K", startTime: "05:00", cutOff: "07:00" },
        { code: "5K", startTime: "05:15", cutOff: "" },
      ],
      description: "",
      locationName: "Lapangan GSP",
      city: "",
      province: "",
      country: "",
      countryCode: "",
      locationLink: "https://www.google.com/maps/@-7.771,110.377,17z",
      posterUrl: "",
      waiverUrl: "",
      instagram: "",
      website: "",
      registrationOpens: "",
      registrationCloses: "",
      racepackFrom: "2026-11-18",
      racepackTo: "2026-11-20",
      racepackOpens: "09:00",
      racepackCloses: "21:00",
      racepackVenue: "GOR UGM, Hall A",
      racepackVenueLink: "https://www.google.com/maps/@-7.77,110.37,17z",
      addOns: [],
      terms: "",
    });
  }

  describe("positive", () => {
    it("reads when each distance starts, in the order they were planned", () => {
      const document = readEventDocument(written());
      if (typeof document === "string") throw new Error(document);

      expect(document.categories?.map((category) => category.code)).toEqual(["10K", "5K"]);
      expect(document.categories?.[1]?.startTime).toMatch(/^2026-11-2\dT\d{2}:15:00\.000Z$/);
      expect(document.categories?.[0]?.cutOff).toBeDefined();
    });

    it("reads where the race pack desk is, pin and hours included", () => {
      const document = readEventDocument(written());
      if (typeof document === "string") throw new Error(document);

      expect(document.schedule?.find((phase) => phase.phase === "racepack")).toMatchObject({
        venue: "GOR UGM, Hall A",
        venueLat: -7.77,
        venueLng: 110.37,
        dailyOpens: "09:00",
        dailyCloses: "21:00",
      });
    });
  });

  describe("negative", () => {
    it("drops a distance with no code, since nothing on chain could be joined to it", () => {
      const document = readEventDocument(
        JSON.stringify({ categories: [{ start_time: "2026-11-21T05:00:00Z" }, { code: "5K" }] }),
      );

      expect(document).toEqual({ categories: [{ code: "5K" }] });
    });

    it("keeps a venue whose link had no pin, without inventing coordinates", () => {
      const document = readEventDocument(
        JSON.stringify({ schedule: [{ phase: "racepack", venue: "Hall A", venue_lat: "-7" }] }),
      );

      expect(document).toEqual({ schedule: [{ phase: "racepack", venue: "Hall A" }] });
    });
  });

  describe("edge", () => {
    it("tells text that is not JSON apart from JSON that is not a document", () => {
      expect(readEventDocument("{nope")).toBe("not-json");
      expect(readEventDocument("[]")).toBe("not-object");
    });
  });
});
