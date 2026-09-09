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
    locationName: "Gelora Bung Karno",
    city: "Jakarta Pusat",
    province: "DKI Jakarta",
    country: "Indonesia",
    countryCode: "ID",
    locationLink: "https://www.google.com/maps/@-6.2185,106.8026,17z",
    posterUrl: "https://cdn.example.test/poster.png",
    waiverUrl: "",
    instagram: "",
    website: "",
    registrationOpens: "",
    registrationCloses: "",
    racepackFrom: "",
    racepackTo: "",
    racepackOpens: "",
    racepackCloses: "",
    racepackVenue: "",
    racepackVenueLink: "",
    raceDate: "2026-10-04",
    categories: [{ code: "10K", startTime: "06:00", cutOff: "" }],
    addOns: [],
    terms: "",
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
      expect(document.location.name).toBe("Gelora Bung Karno");
      expect(document.poster_url).toBe("https://cdn.example.test/poster.png");
    });

    it("puts the pin from a pasted maps link into the document", () => {
      const document = JSON.parse(buildEventDocument(draft()));

      expect(document.location).toMatchObject({ lat: -6.2185, lng: 106.8026 });
    });

    it("keeps the place names when the link has no pin in it", () => {
      // A shortened maps link carries no coordinates, and losing the address
      // over that would be a worse trade than showing a place with no map.
      const document = JSON.parse(
        buildEventDocument(draft({ locationLink: "https://maps.app.goo.gl/abc" })),
      );

      expect(document.location).toEqual({
        name: "Gelora Bung Karno",
        city: "Jakarta Pusat",
        province: "DKI Jakarta",
        country: "Indonesia",
        country_code: "ID",
      });
    });

    it("carries the administrative names a directory can group by", () => {
      // Free text cannot be grouped: Jakarta, DKI Jakarta and jakarta are one
      // place typed three ways. These come from a list, so they compare.
      const document = JSON.parse(buildEventDocument(draft()));

      expect(document.location).toMatchObject({
        city: "Jakarta Pusat",
        province: "DKI Jakarta",
        country: "Indonesia",
        country_code: "ID",
      });
    });

    it("leaves location out entirely when nothing about it was given", () => {
      const document = JSON.parse(
        buildEventDocument(
          draft({
            locationName: "",
            city: "",
            province: "",
            country: "",
            countryCode: "",
            locationLink: "",
          }),
        ),
      );

      expect(document).not.toHaveProperty("location");
    });

    it("pins the race pack venue the same way", () => {
      const document = JSON.parse(
        buildEventDocument(
          draft({
            racepackFrom: "2026-10-03",
            racepackTo: "2026-10-03",
            racepackOpens: "09:00",
            racepackCloses: "17:00",
            racepackVenue: "Hall A",
            racepackVenueLink: "https://www.google.com/maps/@-6.2000,106.8000,17z",
          }),
        ),
      );
      const racepack = document.schedule.find((p: { phase: string }) => p.phase === "racepack");

      expect(racepack).toMatchObject({ venue: "Hall A", venue_lat: -6.2, venue_lng: 106.8 });
    });

    it("writes collection as a run of days with the same hours on each", () => {
      // Two datetimes claimed the desk was staffed overnight between them.
      // Volunteers go home, so the days and the hours are separate facts.
      const document = JSON.parse(
        buildEventDocument(
          draft({
            racepackFrom: "2026-08-01",
            racepackTo: "2026-08-09",
            racepackOpens: "09:00",
            racepackCloses: "21:00",
          }),
        ),
      );
      const racepack = document.schedule.find((p: { phase: string }) => p.phase === "racepack");

      expect(racepack).toMatchObject({
        starts_at: new Date("2026-08-01T09:00").toISOString(),
        ends_at: new Date("2026-08-09T21:00").toISOString(),
        daily_opens: "09:00",
        daily_closes: "21:00",
      });
    });

    it("handles a single collection day", () => {
      const document = JSON.parse(
        buildEventDocument(
          draft({ racepackFrom: "2026-08-01", racepackOpens: "09:00", racepackCloses: "17:00" }),
        ),
      );
      const racepack = document.schedule.find((p: { phase: string }) => p.phase === "racepack");

      expect(racepack).toMatchObject({
        starts_at: new Date("2026-08-01T09:00").toISOString(),
        ends_at: new Date("2026-08-01T17:00").toISOString(),
      });
    });

    it("leaves collection out when the hours are missing", () => {
      // Days without hours would have to invent a time, and an invented one is
      // permanent once the file is published.
      const document = JSON.parse(
        buildEventDocument(draft({ racepackFrom: "2026-08-01", racepackTo: "2026-08-09" })),
      );

      expect(
        document.schedule.find((p: { phase: string }) => p.phase === "racepack"),
      ).toBeUndefined();
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

    it("carries the terms, so the hash on chain covers the rules too", () => {
      const terms = "General\n\n- One ticket admits one runner.";
      const document = JSON.parse(buildEventDocument({ ...draft(), terms }));

      expect(document.terms).toBe(terms);
    });

    it("keeps the line breaks inside the terms, because the shape is the reading", () => {
      const document = JSON.parse(
        buildEventDocument({ ...draft(), terms: "One\n\nTwo\n- three" }),
      );

      expect(document.terms).toBe("One\n\nTwo\n- three");
    });

    it("writes no terms key at all when the organiser skipped it", () => {
      // Same rule as every other optional field here: a published document is
      // permanent, and `"terms": ""` reads as an oversight forever.
      expect(JSON.parse(buildEventDocument({ ...draft(), terms: "" }))).not.toHaveProperty("terms");
      expect(JSON.parse(buildEventDocument({ ...draft(), terms: "   \n\n  " }))).not.toHaveProperty(
        "terms",
      );
    });

    it("trims the ends but not the middle, so the same rules hash the same way", () => {
      const padded = buildEventDocument({ ...draft(), terms: "\n  Rules\n\n- a\n  " });
      const clean = buildEventDocument({ ...draft(), terms: "Rules\n\n- a" });

      expect(JSON.parse(padded).terms).toBe(JSON.parse(clean).terms);
    });

    it("still writes the race day phase when nothing optional was filled in", () => {
      // gun_start is the one thing the document must always carry, because it
      // is the claim the chain can be checked against.
      const document = JSON.parse(
        buildEventDocument({
          startsAt: STARTS_AT,
          description: "",
          locationName: "",
          city: "",
          province: "",
          country: "",
          countryCode: "",
          locationLink: "",
          posterUrl: "",
          waiverUrl: "",
          addOns: [],
          terms: "",
          instagram: "",
          website: "",
          registrationOpens: "",
          registrationCloses: "",
          racepackFrom: "",
          racepackTo: "",
          racepackOpens: "",
          racepackCloses: "",
          racepackVenue: "",
          racepackVenueLink: "",
          raceDate: "2026-10-04",
          categories: [],
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

describe("links", () => {
  describe("positive", () => {
    it("stores an Instagram handle, not a url", () => {
      // A handle is the durable thing. Instagram has changed its url shape
      // before, and this document can never be edited once the event exists.
      const document = JSON.parse(buildEventDocument(draft({ instagram: "jakartarun" })));

      expect(document.links).toEqual({ instagram: "jakartarun" });
    });

    it("keeps a website as given", () => {
      const document = JSON.parse(buildEventDocument(draft({ website: "https://race.example" })));

      expect(document.links).toEqual({ website: "https://race.example" });
    });
  });

  describe("edge", () => {
    it("takes the handle out of a pasted profile url", () => {
      // Pasting the address bar is what people do, and the alternative is an
      // event page linking to instagram.com/https://instagram.com/jakartarun.
      const document = JSON.parse(
        buildEventDocument(draft({ instagram: "https://www.instagram.com/jakartarun/" })),
      );

      expect(document.links.instagram).toBe("jakartarun");
    });

    it("takes the at sign off a handle", () => {
      const document = JSON.parse(buildEventDocument(draft({ instagram: "@jakartarun" })));

      expect(document.links.instagram).toBe("jakartarun");
    });

    it("leaves links out entirely when there are none", () => {
      const document = JSON.parse(buildEventDocument(draft()));

      expect(document).not.toHaveProperty("links");
    });

    it("ignores a handle that could not be a handle", () => {
      const document = JSON.parse(buildEventDocument(draft({ instagram: "not a handle!" })));

      expect(document).not.toHaveProperty("links");
    });
  });
});

describe("categories", () => {
  const withCategories = (categories: { code: string; startTime: string; cutOff: string }[]) =>
    JSON.parse(buildEventDocument(draft({ categories })));

  describe("positive", () => {
    it("records a start time per distance, because waves do not start together", () => {
      // The contract has no field for this. A 5K and a half marathon on one
      // morning go off separately, and the file is the only place that fits.
      const document = withCategories([
        { code: "FUN5K", startTime: "06:00", cutOff: "" },
        { code: "R21K", startTime: "05:00", cutOff: "" },
      ]);

      expect(document.categories).toEqual([
        { code: "FUN5K", start_time: new Date("2026-10-04T06:00").toISOString() },
        { code: "R21K", start_time: new Date("2026-10-04T05:00").toISOString() },
      ]);
    });

    it("places a cut off on the same day as its own distance", () => {
      const document = withCategories([{ code: "R10K", startTime: "06:00", cutOff: "11:00" }]);

      expect(document.categories[0].cut_off).toBe(new Date("2026-10-04T11:00").toISOString());
    });

    it("takes the race day cut off from the slowest distance", () => {
      // The day is over for the event when it is over for its last finisher.
      const document = withCategories([
        { code: "FUN5K", startTime: "06:00", cutOff: "08:00" },
        { code: "R21K", startTime: "05:00", cutOff: "12:00" },
      ]);
      const raceDay = document.schedule.find((p: { phase: string }) => p.phase === "race_day");

      expect(raceDay.cut_off).toBe(new Date("2026-10-04T12:00").toISOString());
    });
  });

  describe("edge", () => {
    it("rolls a cut off earlier than its start to the next day", () => {
      // A distance starting at 22:00 and cutting off at 06:00 runs overnight;
      // it did not end sixteen hours before it began.
      const document = withCategories([{ code: "ULTRA", startTime: "22:00", cutOff: "06:00" }]);

      expect(document.categories[0].cut_off).toBe(new Date("2026-10-05T06:00").toISOString());
    });

    it("keeps a distance that has no cut off", () => {
      const document = withCategories([{ code: "R10K", startTime: "06:00", cutOff: "" }]);

      expect(document.categories[0]).not.toHaveProperty("cut_off");
      const raceDay = document.schedule.find((p: { phase: string }) => p.phase === "race_day");
      expect(raceDay).not.toHaveProperty("cut_off");
    });

    it("leaves categories out entirely when there are none", () => {
      const document = withCategories([]);

      expect(document).not.toHaveProperty("categories");
    });

    it("ignores a distance with no code", () => {
      const document = withCategories([{ code: "", startTime: "06:00", cutOff: "" }]);

      expect(document).not.toHaveProperty("categories");
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

describe("add-ons in the document", () => {
  const jersey = {
    name: "Event jersey",
    photoUrl: "https://cdn.example.test/jersey.png",
    includedIn: ["10K"],
    sizes: [
      { label: "S", chest: "48", length: "68" },
      { label: "M", chest: "52", length: "70" },
    ],
  };

  describe("positive", () => {
    it("records what a distance includes, with the chart as numbers", () => {
      // Numbers rather than "52 cm": a chart is data a client can lay out or
      // convert, and a unit inside the value makes both a parsing job.
      const document = JSON.parse(buildEventDocument(draft({ addOns: [jersey] })));

      expect(document.add_ons).toEqual([
        {
          name: "Event jersey",
          photo_url: "https://cdn.example.test/jersey.png",
          included_in: ["10K"],
          sizes: [
            { label: "S", chest_cm: 48, length_cm: 68 },
            { label: "M", chest_cm: 52, length_cm: 70 },
          ],
        },
      ]);
    });

    it("keeps a size that has a label and no measurements", () => {
      // Plenty of races publish S/M/L and no chart at all, and knowing an XXL
      // exists is worth something on its own.
      const document = JSON.parse(
        buildEventDocument(
          draft({ addOns: [{ ...jersey, sizes: [{ label: "XXL", chest: "", length: "" }] }] }),
        ),
      );

      expect(document.add_ons[0].sizes).toEqual([{ label: "XXL" }]);
    });
  });

  describe("negative", () => {
    it("leaves out an item nobody receives", () => {
      // An add-on ticked against no distance is invisible to every runner, and
      // this file cannot be corrected afterwards.
      const document = JSON.parse(
        buildEventDocument(draft({ addOns: [{ ...jersey, includedIn: [] }] })),
      );

      expect(document).not.toHaveProperty("add_ons");
    });

    it("leaves out an item with no name", () => {
      const document = JSON.parse(
        buildEventDocument(draft({ addOns: [{ ...jersey, name: "  " }] })),
      );

      expect(document).not.toHaveProperty("add_ons");
    });
  });

  describe("edge", () => {
    it("writes nothing at all when the race pack is empty", () => {
      // A race that hands out nothing but a bib is still a race, and an empty
      // array would be a permanent record of a section nobody filled in.
      const document = JSON.parse(buildEventDocument(draft()));

      expect(document).not.toHaveProperty("add_ons");
    });

    it("drops a measurement that is not a number", () => {
      const document = JSON.parse(
        buildEventDocument(
          draft({ addOns: [{ ...jersey, sizes: [{ label: "M", chest: "wide", length: "70" }] }] }),
        ),
      );

      expect(document.add_ons[0].sizes).toEqual([{ label: "M", length_cm: 70 }]);
    });
  });
});
