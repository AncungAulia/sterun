/**
 * Step 2 as data: what is missing, what is impossible, and what the vault is sent.
 *
 * ## Two kinds of wrong, shown at two moments
 *
 * The same split as the wizard (`modules/organiser/missing.ts`). An empty
 * field waits for Continue, because a form that goes red under the cursor is a
 * form people learn to ignore. An impossible value (a bib name that will not
 * fit, a phone with no country code) is said as soon as it exists, because
 * nothing later will make it right.
 *
 * ## Mirrors the vault, which still decides
 *
 * The rules follow `be/src/routes/participants.ts`, so a form that passes here
 * is not refused there and the runner is not sent back after signing. The
 * server's check is the one that counts.
 *
 * ## Never persisted
 *
 * Nothing in this module is written to browser storage. An identity number
 * left in localStorage on a shared laptop is the one failure this flow must not
 * have (spec, step 3).
 */
import type { Missing } from "@/utils/missing-field";

export type IdType = "national_id_card" | "passport" | "driving_licence" | "other";
export type Gender = "female" | "male";

export interface RunnerDetails {
  name: string;
  idType: IdType | "";
  idNumber: string;
  bibName: string;
  email: string;
  /** E.164, as `PhoneField` emits it, or empty. */
  phone: string;
  gender: Gender | "";
  /** `YYYY-MM-DD`, or empty. */
  dateOfBirth: string;
  emergencyName: string;
  /** E.164, or empty. Hashed, which is why it must carry its country code. */
  emergencyPhone: string;
}

export const EMPTY_DETAILS: RunnerDetails = {
  name: "",
  idType: "",
  idNumber: "",
  bibName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  emergencyName: "",
  emergencyPhone: "",
};

export const ID_TYPES: readonly { value: IdType; label: string }[] = [
  { value: "national_id_card", label: "National ID card" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "other", label: "Other" },
];

export const GENDERS: readonly { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

/** Printed on the bib, so bounded by what fits on one. Same as the vault. */
export const BIB_NAME_MAX = 16;

/** The vault's pattern, exactly (be/src/routes/participants.ts). */
const E164 = /^\+[1-9][0-9]{6,14}$/;

/**
 * Deliberately loose. The server's `format: "email"` is the real check, and a
 * stricter pattern here would only refuse addresses the server accepts.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A date of birth earlier than this is a typo, not a runner. Same as the vault. */
const EARLIEST_DATE_OF_BIRTH = "1900-01-01";

/**
 * Every empty field, then every impossible value: what Continue is judged on.
 *
 * `today` is passed in, as `YYYY-MM-DD`, so the future-date rule is testable
 * and a render never reads the clock.
 */
export function missingRunnerDetails(d: RunnerDetails, today: string): Missing[] {
  const missing: Missing[] = [];
  const ask = (empty: boolean, field: keyof RunnerDetails, focusId: string, message: string) => {
    if (empty) missing.push({ field, focusId, message });
  };

  ask(!d.name.trim(), "name", "runner-name", "Enter your full name.");
  ask(!d.idType, "idType", "runner-id-type", "Pick the type of ID you will bring.");
  ask(!d.idNumber.trim(), "idNumber", "runner-id-number", "Enter the number on your ID.");
  ask(!d.bibName.trim(), "bibName", "runner-bib-name", "Choose the name printed on your bib.");
  ask(!d.email.trim(), "email", "runner-email", "Enter your email.");
  ask(!d.phone, "phone", "runner-phone", "Enter your phone number.");
  ask(!d.gender, "gender", "runner-gender", "Pick one.");
  ask(!d.dateOfBirth, "dateOfBirth", "runner-dob-date", "Pick your date of birth.");
  ask(!d.emergencyName.trim(), "emergencyName", "runner-emergency-name", "Enter who we call in an emergency.");
  ask(!d.emergencyPhone, "emergencyPhone", "runner-emergency-phone", "Add a phone number.");

  return [...missing, ...impossibleRunnerDetails(d, today)];
}

/**
 * Values that are wrong the moment they exist. Each rule reads only a field
 * that has something in it, which is what makes it safe to run on every
 * keystroke: a form being filled in cannot trip it.
 */
export function impossibleRunnerDetails(d: RunnerDetails, today: string): Missing[] {
  const problems: Missing[] = [];

  if (d.bibName.trim().length > BIB_NAME_MAX) {
    problems.push({
      field: "bibName",
      focusId: "runner-bib-name",
      message: `A bib fits ${BIB_NAME_MAX} characters at most.`,
    });
  }

  if (d.email.trim() && !EMAIL.test(d.email.trim())) {
    problems.push({
      field: "email",
      focusId: "runner-email",
      message: "This email looks incomplete.",
    });
  }

  if (d.phone && !E164.test(d.phone)) {
    problems.push({
      field: "phone",
      focusId: "runner-phone",
      message: "This phone number looks incomplete.",
    });
  }

  if (d.emergencyPhone && !E164.test(d.emergencyPhone)) {
    problems.push({
      field: "emergencyPhone",
      focusId: "runner-emergency-phone",
      message: "This phone number looks incomplete.",
    });
  } else if (d.emergencyPhone && d.emergencyPhone === d.phone) {
    // Not a vault rule. An emergency contact who is the runner reaches nobody,
    // which is only discovered on the day it matters.
    problems.push({
      field: "emergencyPhone",
      focusId: "runner-emergency-phone",
      message: "Use someone else's number, so we can reach them if something happens to you.",
    });
  }

  // Compared as strings: YYYY-MM-DD sorts in date order, as the vault does.
  if (d.dateOfBirth && (d.dateOfBirth > today || d.dateOfBirth < EARLIEST_DATE_OF_BIRTH)) {
    problems.push({
      field: "dateOfBirth",
      focusId: "runner-dob-date",
      message: "Check your date of birth.",
    });
  }

  return problems;
}

/**
 * An identity number as the review step shows it: only the last four
 * characters, the rest as dots in groups of four.
 *
 * Enough for the runner to recognise their own number, not enough for
 * somebody looking over a shoulder to copy it. A number of four characters or
 * fewer is hidden entirely, since its last four would be all of it.
 */
export function maskIdNumber(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  const groups = Math.ceil((compact.length - 4) / 4);
  return [...Array.from({ length: groups }, () => "••••"), compact.slice(-4)].join(" ");
}

/**
 * `YYYY-MM-DD` spelled for a person, in UTC on purpose.
 *
 * A date of birth is a calendar date, not an instant. Read in local time, the
 * midnight of the fifth of January is the fourth somewhere west of Greenwich.
 */
export function formatDateOfBirth(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** `POST /participants`'s body, field for field. */
export interface ParticipantBody {
  name: string;
  national_id: string;
  emergency_contact: string;
  event_id: number;
  category_id: number;
  runner_address: string;
  add_ons?: { item: string; choice: string }[];
  id_type: IdType;
  bib_name: string;
  email: string;
  phone: string;
  gender: Gender;
  date_of_birth: string;
  emergency_contact_name: string;
}

/**
 * The vault body. Only call on details that passed `missingRunnerDetails`:
 * the casts below rely on the id type and gender having been chosen.
 *
 * `add_ons` is left out rather than sent empty, matching the vault's optional
 * field, since a race that hands out only a bib asks for nothing.
 */
export function participantBody(
  d: RunnerDetails,
  context: {
    eventId: number;
    categoryId: number;
    runner: string;
    addOns: { item: string; choice: string }[];
  },
): ParticipantBody {
  return {
    name: d.name.trim(),
    national_id: d.idNumber.trim(),
    emergency_contact: d.emergencyPhone,
    event_id: context.eventId,
    category_id: context.categoryId,
    runner_address: context.runner,
    ...(context.addOns.length > 0 ? { add_ons: context.addOns } : {}),
    id_type: d.idType as IdType,
    bib_name: d.bibName.trim(),
    email: d.email.trim(),
    phone: d.phone,
    gender: d.gender as Gender,
    date_of_birth: d.dateOfBirth,
    emergency_contact_name: d.emergencyName.trim(),
  };
}
