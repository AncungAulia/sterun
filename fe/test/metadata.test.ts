import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchEventMetadata, gunStartConflict } from "@/lib/metadata";

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
