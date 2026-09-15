/**
 * Step 2 as data: what is missing, what is impossible, and what the vault is
 * sent. The rules mirror be/src/routes/participants.ts so a form that passes
 * here is not refused there.
 */
import { describe, expect, it } from "vitest";

import {
  BIB_NAME_MAX,
  EMPTY_DETAILS,
  impossibleRunnerDetails,
  missingRunnerDetails,
  participantBody,
  type RunnerDetails,
} from "@/modules/entry/details";

const TODAY = "2026-09-15";

const filled: RunnerDetails = {
  name: "Sari Wulandari",
  idType: "national_id_card",
  idNumber: "3471014501900001",
  bibName: "SARI",
  email: "sari@example.com",
  phone: "+6281234567890",
  gender: "female",
  dateOfBirth: "1990-01-05",
  emergencyName: "Budi",
  emergencyPhone: "+6281298765432",
};

const fields = (list: { field: string }[]) => list.map((m) => m.field);

describe("missingRunnerDetails", () => {
  it("lists every empty field in the order the form asks for them", () => {
    expect(fields(missingRunnerDetails(EMPTY_DETAILS, TODAY))).toEqual([
      "name",
      "idType",
      "idNumber",
      "bibName",
      "email",
      "phone",
      "gender",
      "dateOfBirth",
      "emergencyName",
      "emergencyPhone",
    ]);
  });

  it("treats a field of spaces as empty", () => {
    expect(fields(missingRunnerDetails({ ...filled, name: "   " }, TODAY))).toEqual(["name"]);
  });

  it("passes a complete form", () => {
    expect(missingRunnerDetails(filled, TODAY)).toEqual([]);
  });

  it("includes impossible values, so Continue is judged on both", () => {
    expect(fields(missingRunnerDetails({ ...filled, email: "sari" }, TODAY))).toEqual(["email"]);
  });

  it("gives each problem a field to focus", () => {
    for (const problem of missingRunnerDetails(EMPTY_DETAILS, TODAY)) {
      expect(problem.focusId).toMatch(/^runner-/);
      expect(problem.message.length).toBeGreaterThan(0);
    }
  });
});

describe("impossibleRunnerDetails", () => {
  it("says nothing about empty fields, so a half-filled form is not red", () => {
    expect(impossibleRunnerDetails(EMPTY_DETAILS, TODAY)).toEqual([]);
  });

  it.each([
    ["bibName", { bibName: "A".repeat(BIB_NAME_MAX + 1) }],
    ["email", { email: "sari@" }],
    ["email", { email: "sari example.com" }],
    ["phone", { phone: "081234567890" }],
    ["emergencyPhone", { emergencyPhone: "+62" }],
    ["dateOfBirth", { dateOfBirth: "2026-09-16" }],
    ["dateOfBirth", { dateOfBirth: "1899-12-31" }],
  ])("refuses a bad %s", (field, patch) => {
    expect(fields(impossibleRunnerDetails({ ...filled, ...patch }, TODAY))).toEqual([field]);
  });

  it("accepts the boundaries: a 16 character bib name, 1900-01-01 and today", () => {
    expect(
      impossibleRunnerDetails({ ...filled, bibName: "A".repeat(BIB_NAME_MAX), dateOfBirth: "1900-01-01" }, TODAY),
    ).toEqual([]);
    expect(impossibleRunnerDetails({ ...filled, dateOfBirth: TODAY }, TODAY)).toEqual([]);
  });

  it("counts the bib name after trimming, like the vault stores it", () => {
    expect(impossibleRunnerDetails({ ...filled, bibName: `  ${"A".repeat(BIB_NAME_MAX)}  ` }, TODAY)).toEqual([]);
  });

  it("refuses the runner's own number as their emergency contact", () => {
    expect(fields(impossibleRunnerDetails({ ...filled, emergencyPhone: filled.phone }, TODAY))).toEqual([
      "emergencyPhone",
    ]);
  });
});

describe("participantBody", () => {
  const context = { eventId: 3, categoryId: 1, runner: "GABC" };

  it("trims and maps onto the vault's field names", () => {
    const body = participantBody(
      { ...filled, name: "  Sari Wulandari ", bibName: " SARI ", email: " sari@example.com " },
      { ...context, addOns: [{ item: "Event jersey", choice: "L" }] },
    );
    expect(body).toEqual({
      name: "Sari Wulandari",
      national_id: "3471014501900001",
      emergency_contact: "+6281298765432",
      event_id: 3,
      category_id: 1,
      runner_address: "GABC",
      add_ons: [{ item: "Event jersey", choice: "L" }],
      id_type: "national_id_card",
      bib_name: "SARI",
      email: "sari@example.com",
      phone: "+6281234567890",
      gender: "female",
      date_of_birth: "1990-01-05",
      emergency_contact_name: "Budi",
    });
  });

  it("leaves add_ons out entirely when there are none, rather than sending an empty list", () => {
    expect("add_ons" in participantBody(filled, { ...context, addOns: [] })).toBe(false);
  });

  it("sends the emergency phone as the hashed contact, never the runner's phone", () => {
    expect(participantBody(filled, { ...context, addOns: [] }).emergency_contact).toBe(filled.emergencyPhone);
  });
});
