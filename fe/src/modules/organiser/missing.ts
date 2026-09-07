/**
 * What step one is still missing, in the order it is asked for.
 *
 * Kept apart from the component because it decides two things at once and both
 * are worth testing without a browser: whether Continue may proceed, and which
 * field to send somebody to when it may not.
 *
 * The Continue button is deliberately not disabled. A greyed out button with no
 * reason is a dead end: the organiser sees it, cannot tell what is wrong, and
 * has nothing to click to find out. Pressing it and being taken to the empty
 * field answers the question in one action.
 */
import { parseCoordinates } from "@/utils/geo";

import type { EventDetails } from "./component/StepDetails";

export interface Missing {
  /** The key the form uses to mark the field. */
  field: string;
  /** The element to focus. Date fields focus their date button. */
  focusId: string;
  message: string;
}

export function missingDetails(details: EventDetails): Missing[] {
  const missing: Missing[] = [];

  if (!details.name.trim()) {
    missing.push({ field: "name", focusId: "name", message: "Give the race a name." });
  }
  if (!details.raceDate) {
    missing.push({
      field: "raceDate",
      focusId: "race-date-date",
      message: "Pick the day the race is held.",
    });
  }
  if (!details.place.country) {
    missing.push({ field: "country", focusId: "country", message: "Pick a country." });
  }
  if (!details.place.provinceId) {
    missing.push({ field: "province", focusId: "province", message: "Pick a province." });
  }
  if (!details.place.city) {
    missing.push({ field: "city", focusId: "city", message: "Pick a city." });
  }
  if (!parseCoordinates(details.locationLink)) {
    missing.push({
      field: "locationLink",
      focusId: "location-link",
      // The pin is what a "races near me" search uses, so a race without one
      // is a race nobody finds by being close to it.
      message: "Paste a Google Maps link with a pin in it, so runners can find the start.",
    });
  }
  if (!details.description.trim()) {
    missing.push({
      field: "description",
      focusId: "description",
      // The one field that tells a runner what the race actually is. An event
      // page without it is a name, a date and nothing to decide on.
      message: "Say what the race is like, so runners know what they are entering.",
    });
  }
  if (!details.registrationOpens) {
    missing.push({
      field: "registrationOpens",
      focusId: "reg-opens-date",
      message: "Say when entries open.",
    });
  }
  if (!details.registrationCloses) {
    missing.push({
      field: "registrationCloses",
      focusId: "reg-closes-date",
      message: "Say when entries close.",
    });
  }

  return missing;
}

/** Sends the organiser to a field rather than making them hunt for it. */
export function focusField(focusId: string): void {
  const element = document.getElementById(focusId);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus({ preventScroll: true });
}
