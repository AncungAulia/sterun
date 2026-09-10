import { describe, expect, it } from "vitest";

import { EMPTY_RANGE } from "@/components/elements/DateRangeField";
import { EMPTY_PLACE } from "@/components/elements/PlaceFields";
import type { EventDetails } from "@/modules/organiser/component/StepDetails";
import { incoherentDates, missingDetails } from "@/modules/organiser/missing";

/** A complete, coherent form. Each test breaks exactly one thing. */
function details(overrides: Partial<EventDetails> = {}): EventDetails {
  return {
    name: "Jakarta Sunrise 10K",
    raceDate: "2026-10-04",
    description: "Two laps of the park.",
    place: { ...EMPTY_PLACE, country: "ID", provinceId: "1", city: "Jakarta Pusat" },
    locationLink: "https://www.google.com/maps/@-6.2185,106.8026,17z",
    posterUrl: "",
    waiverUrl: "",
    instagram: "",
    website: "",
    registrationOpens: "2026-09-01T09:00",
    registrationCloses: "2026-09-30T21:00",
    racepack: { ...EMPTY_RANGE },
    racepackVenue: "",
    racepackVenueLink: "",
    ...overrides,
  };
}

const fields = (input: EventDetails) => missingDetails(input).map((item) => item.field);

describe("missingDetails", () => {
  describe("positive", () => {
    it("finds nothing wrong with a complete form", () => {
      expect(missingDetails(details())).toEqual([]);
    });

    it("names every empty required field, in the order they are asked for", () => {
      const empty = details({
        name: "",
        raceDate: "",
        description: "",
        place: EMPTY_PLACE,
        locationLink: "",
        registrationOpens: "",
        registrationCloses: "",
      });

      expect(fields(empty)).toEqual([
        "name",
        "raceDate",
        "country",
        "province",
        "city",
        "locationLink",
        "description",
        "registrationOpens",
        "registrationCloses",
      ]);
    });

    it("rejects a maps link with no pin in it", () => {
      // A shortened link carries no coordinates until it is followed, and
      // following it from a browser is blocked.
      const shortened = details({ locationLink: "https://maps.app.goo.gl/abc" });

      expect(fields(shortened)).toEqual(["locationLink"]);
    });
  });

  describe("negative", () => {
    it("catches entries that close before they open", () => {
      const backwards = details({
        registrationOpens: "2026-09-30T09:00",
        registrationCloses: "2026-09-01T21:00",
      });

      expect(missingDetails(backwards)[0]?.message).toMatch(/cannot close before they open/i);
    });

    it("catches entries that close after the race has been run", () => {
      // Each date is plausible alone. Together they describe a race you can
      // enter after it finished, and the contract will store it happily.
      const late = details({ registrationCloses: "2026-10-20T21:00" });

      expect(missingDetails(late)[0]?.message).toMatch(/already been run/i);
    });

    it("catches race pack collection that ends after race day", () => {
      const afterwards = details({
        racepack: { from: "2026-10-05", to: "2026-10-06", opens: "09:00", closes: "17:00" },
      });

      expect(missingDetails(afterwards)[0]?.message).toMatch(/finish on race day at the latest/i);
    });
  });

  describe("edge", () => {
    it("allows collection on the race day itself", () => {
      // Plenty of small races hand packs out on the morning.
      const sameDay = details({
        racepack: { from: "2026-10-04", to: "2026-10-04", opens: "05:00", closes: "06:00" },
      });

      expect(missingDetails(sameDay)).toEqual([]);
    });

    it("allows entries closing on race day, since a race can take entries that morning", () => {
      const sameDay = details({ registrationCloses: "2026-10-04T05:00" });

      expect(missingDetails(sameDay)).toEqual([]);
    });

    it("says nothing about coherence while the dates are still empty", () => {
      // Half a form is not a wrong form, and marking it red as somebody types
      // is how a wizard becomes exhausting.
      const partial = details({ registrationCloses: "" });

      expect(fields(partial)).toEqual(["registrationCloses"]);
    });

    it("checks a single collection day against the race date too", () => {
      const afterwards = details({
        racepack: { from: "2026-10-05", to: "", opens: "09:00", closes: "17:00" },
      });

      expect(missingDetails(afterwards)[0]?.message).toMatch(/finish on race day/i);
    });
  });
});

/**
 * The subset that is knowable before anybody presses Continue.
 *
 * An empty field is not yet a mistake — the organiser may simply not have got
 * there. Two dates that contradict each other are a mistake the moment both
 * exist, and saying so straight away is the difference between fixing it now
 * and fixing it after the file is frozen.
 */
describe("incoherentDates", () => {
  describe("positive", () => {
    it("finds nothing wrong with a coherent schedule", () => {
      expect(incoherentDates(details())).toEqual([]);
    });
  });

  describe("negative", () => {
    it("reports entries that close before they open", () => {
      const backwards = details({
        registrationOpens: "2026-09-30T09:00",
        registrationCloses: "2026-09-01T21:00",
      });

      expect(incoherentDates(backwards).map((item) => item.field)).toEqual(["registrationCloses"]);
    });

    it("reports entries that close after the race has been run", () => {
      const late = details({ registrationCloses: "2026-10-20T21:00" });

      expect(incoherentDates(late)[0]?.message).toMatch(/already been run/i);
    });

    it("reports race pack collection that ends after race day", () => {
      const afterwards = details({
        racepack: { from: "2026-10-05", to: "2026-10-06", opens: "09:00", closes: "17:00" },
      });

      expect(incoherentDates(afterwards)[0]?.field).toBe("racepack");
    });
  });

  describe("edge", () => {
    it("stays silent while only one half of a pair is filled in", () => {
      // This is the whole reason the two checks are separate. These problems
      // are shown as somebody types, so a half-typed form must not go red.
      const half = details({ registrationCloses: "" });

      expect(incoherentDates(half)).toEqual([]);
    });

    it("stays silent on a form nobody has touched", () => {
      const untouched = details({
        raceDate: "",
        registrationOpens: "",
        registrationCloses: "",
      });

      expect(incoherentDates(untouched)).toEqual([]);
    });

    it("is a subset of what Continue refuses to pass", () => {
      // Continue must still be blocked by everything here. If these two ever
      // disagree, a form could show an error and continue anyway.
      const broken = details({
        registrationOpens: "2026-09-30T09:00",
        registrationCloses: "2026-09-01T21:00",
      });

      const all = missingDetails(broken).map((item) => item.field);
      for (const problem of incoherentDates(broken)) expect(all).toContain(problem.field);
    });
  });
});
