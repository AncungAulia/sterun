"use client";

/**
 * Step 1: everything about the race, collected before anything is signed.
 *
 * Nothing here touches the chain. It is a form precisely because the next steps
 * are not: once `create_event` lands, the name, the start time and the document
 * hash are permanent, so this is the last place any of it can be corrected.
 */
import { Field, TextAreaField } from "@/components/elements/Field";

export interface EventDetails {
  name: string;
  /** `datetime-local` value, read in the organiser's own timezone. */
  startsAtLocal: string;
  description: string;
  locationName: string;
  posterUrl: string;
  waiverUrl: string;
  registrationOpens: string;
  registrationCloses: string;
  racepackStarts: string;
  racepackEnds: string;
  racepackVenue: string;
  cutOff: string;
}

export const EMPTY_DETAILS: EventDetails = {
  name: "",
  startsAtLocal: "",
  description: "",
  locationName: "",
  posterUrl: "",
  waiverUrl: "",
  registrationOpens: "",
  registrationCloses: "",
  racepackStarts: "",
  racepackEnds: "",
  racepackVenue: "",
  cutOff: "",
};

interface StepDetailsProps {
  details: EventDetails;
  onChange: (details: EventDetails) => void;
}

export function StepDetails({ details, onChange }: StepDetailsProps) {
  const set = (patch: Partial<EventDetails>) => onChange({ ...details, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="heading text-xl text-n-700">The race</h2>
        <Field
          id="name"
          label="Event name"
          value={details.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Jakarta Sunrise 10K"
          hint="Stored on chain, and permanent. There is no way to rename an event."
        />
        <Field
          id="starts-at"
          label="Gun start"
          type="datetime-local"
          value={details.startsAtLocal}
          onChange={(e) => set({ startsAtLocal: e.target.value })}
          hint="Read in your own timezone, stored on chain as a Unix timestamp."
        />
        <Field
          id="location"
          label="Location"
          value={details.locationName}
          onChange={(e) => set({ locationName: e.target.value })}
          placeholder="Gelora Bung Karno, Jakarta"
        />
        <TextAreaField
          id="description"
          label="Description"
          value={details.description}
          onChange={(description) => set({ description })}
          placeholder="Two laps of the park, flat, water at every 2 km."
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading text-xl text-n-700">Links</h2>
        <Field
          id="poster"
          label="Poster image URL"
          value={details.posterUrl}
          onChange={(e) => set({ posterUrl: e.target.value })}
          placeholder="https://..."
          hint="Hosted by you. There is no upload here, and the image itself is not covered by the hash."
        />
        <Field
          id="waiver"
          label="Waiver URL"
          value={details.waiverUrl}
          onChange={(e) => set({ waiverUrl: e.target.value })}
          placeholder="https://..."
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading text-xl text-n-700">Schedule</h2>
        <p className="text-sm text-n-500">
          Optional, and none of it is enforced by the contract. What actually opens and closes
          entries is the event status, which you set by hand. These dates are information.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="reg-opens"
            label="Registration opens"
            type="datetime-local"
            value={details.registrationOpens}
            onChange={(e) => set({ registrationOpens: e.target.value })}
          />
          <Field
            id="reg-closes"
            label="Registration closes"
            type="datetime-local"
            value={details.registrationCloses}
            onChange={(e) => set({ registrationCloses: e.target.value })}
          />
          <Field
            id="pack-starts"
            label="Race pack collection opens"
            type="datetime-local"
            value={details.racepackStarts}
            onChange={(e) => set({ racepackStarts: e.target.value })}
          />
          <Field
            id="pack-ends"
            label="Race pack collection closes"
            type="datetime-local"
            value={details.racepackEnds}
            onChange={(e) => set({ racepackEnds: e.target.value })}
          />
          <Field
            id="pack-venue"
            label="Race pack venue"
            value={details.racepackVenue}
            onChange={(e) => set({ racepackVenue: e.target.value })}
            placeholder="Hall A"
          />
          <Field
            id="cut-off"
            label="Cut off"
            type="datetime-local"
            value={details.cutOff}
            onChange={(e) => set({ cutOff: e.target.value })}
          />
        </div>
      </section>
    </div>
  );
}
