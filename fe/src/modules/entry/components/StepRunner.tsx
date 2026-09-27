"use client";

/**
 * Step 2: the runner's details (mockup block 2).
 *
 * Every field STE-47 stores, in three cards: who the runner is, how the
 * organiser reaches them, and who is called on race day. All of them are
 * required, and each carries the red star (Ancung, 2026-09-15).
 *
 * ## When errors show
 *
 * The wizard's split (`modules/organiser/create/lib/missing.ts`). An impossible value is
 * shown as soon as it exists; an empty field only after Continue.
 *
 * ## What is never kept
 *
 * These details live in memory only. `EntryFlow` does not write them to any
 * storage, so a refresh on a shared laptop leaves no identity number behind.
 */
import { DateTimeField } from "@/components/form/DateTimeField";
import { Field, FieldMessage, LabelRow } from "@/components/form/Field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  BIB_NAME_MAX,
  GENDERS,
  ID_TYPES,
  impossibleRunnerDetails,
  missingRunnerDetails,
  type Gender,
  type IdType,
  type RunnerDetails,
} from "../lib/details";

import { PhoneField, type Country } from "./PhoneField";
import { StepCard } from "./StepCard";

/** The oldest month the date of birth calendar reaches. Matches the vault's floor. */
const EARLIEST_MONTH = new Date(1900, 0, 1);

export function StepRunner({
  details,
  onChange,
  today,
  showMissing,
  defaultCountry,
}: {
  details: RunnerDetails;
  onChange: (details: RunnerDetails) => void;
  /** `YYYY-MM-DD`, the runner's own day. */
  today: string;
  /** True once Continue was pressed: empty fields are then errors too. */
  showMissing: boolean;
  /** For both phones: the place chosen in the directory, else Indonesia. */
  defaultCountry: Country;
}) {
  const problems = showMissing
    ? missingRunnerDetails(details, today)
    : impossibleRunnerDetails(details, today);
  const errorOf = (field: keyof RunnerDetails) => problems.find((p) => p.field === field)?.message;
  const set = <K extends keyof RunnerDetails>(key: K, value: RunnerDetails[K]) =>
    onChange({ ...details, [key]: value });

  const bibLength = details.bibName.trim().length;

  return (
    <div className="flex flex-col gap-4">
      <StepCard
        id="entry-about-you"
        title="About you"
        hint="Use the name and document you will show when you collect your race pack."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="runner-name"
              label="Full name"
              required
              autoComplete="name"
              value={details.name}
              onChange={(e) => set("name", e.target.value)}
              error={errorOf("name")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <LabelRow htmlFor="runner-id-type" label="Identity document" required />
            <Select value={details.idType} onValueChange={(value) => set("idType", value as IdType)}>
              <SelectTrigger
                id="runner-id-type"
                aria-invalid={errorOf("idType") ? true : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Choose a document" />
              </SelectTrigger>
              {/* `popper`: the default item-aligned position covers its own trigger. */}
              <SelectContent position="popper">
                {ID_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage error={errorOf("idType")} />
          </div>

          <Field
            id="runner-id-number"
            label="Document number"
            required
            autoComplete="off"
            value={details.idNumber}
            onChange={(e) => set("idNumber", e.target.value)}
            error={errorOf("idNumber")}
          />

          <div className="flex flex-col gap-2">
            <LabelRow htmlFor="runner-gender" label="Gender" required />
            <ToggleGroup
              id="runner-gender"
              type="single"
              variant="outline"
              aria-label="Gender"
              aria-invalid={errorOf("gender") ? true : undefined}
              value={details.gender}
              onValueChange={(value) => {
                // A second press on the chosen one would clear it; a gender stays chosen.
                if (value) set("gender", value as Gender);
              }}
              className="w-full"
            >
              {GENDERS.map((gender) => (
                <ToggleGroupItem
                  key={gender.value}
                  value={gender.value}
                  className="flex-1 data-[state=on]:border-teal-500 data-[state=on]:bg-teal-50 data-[state=on]:text-teal-700"
                >
                  {gender.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldMessage error={errorOf("gender")} />
          </div>

          <DateTimeField
            id="runner-dob"
            label="Date of birth"
            required
            dateOnly
            value={details.dateOfBirth}
            onChange={(value) => set("dateOfBirth", value)}
            error={errorOf("dateOfBirth")}
            startMonth={EARLIEST_MONTH}
            endMonth={new Date(`${today}T00:00`)}
          />

          <div className="sm:col-span-2">
            <Field
              id="runner-bib-name"
              label="Name on your bib"
              required
              autoComplete="nickname"
              value={details.bibName}
              onChange={(e) => set("bibName", e.target.value)}
              error={errorOf("bibName")}
              hint={
                <span className="flex justify-between gap-3">
                  <span>Up to {BIB_NAME_MAX} characters.</span>
                  <span className="numeric">
                    {bibLength}/{BIB_NAME_MAX}
                  </span>
                </span>
              }
            />
          </div>
        </div>
      </StepCard>

      <StepCard id="entry-contact" title="Contact" hint="Where the organiser reaches you if the race changes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="runner-email"
            label="Email"
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            value={details.email}
            onChange={(e) => set("email", e.target.value)}
            error={errorOf("email")}
          />
          <PhoneField
            id="runner-phone"
            label="Phone"
            required
            value={details.phone}
            onChange={(value) => set("phone", value)}
            defaultCountry={defaultCountry}
            error={errorOf("phone")}
          />
        </div>
      </StepCard>

      <StepCard
        id="entry-emergency"
        title="Emergency contact"
        hint="Somebody we can call on race day who is not running with you."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="runner-emergency-name"
            label="Their name"
            required
            autoComplete="off"
            value={details.emergencyName}
            onChange={(e) => set("emergencyName", e.target.value)}
            error={errorOf("emergencyName")}
          />
          <PhoneField
            id="runner-emergency-phone"
            label="Their phone"
            required
            value={details.emergencyPhone}
            onChange={(value) => set("emergencyPhone", value)}
            defaultCountry={defaultCountry}
            error={errorOf("emergencyPhone")}
          />
        </div>
      </StepCard>
    </div>
  );
}
