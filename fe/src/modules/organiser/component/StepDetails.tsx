"use client";

/**
 * Step 1: everything about the race, collected before anything is signed.
 *
 * Nothing here touches the chain. It is a form precisely because the next steps
 * are not: once the event is created, the name, the start time and the details
 * file are permanent, so this is the last place any of it can be corrected.
 *
 * ## The shape of the page
 *
 * Four sections, in the order somebody actually knows the answers: what the
 * race is, when people can enter, where the race pack is, and what it should
 * look like. Each is a heading with a rule under it, so a long form reads as
 * four short ones rather than a wall of inputs.
 */
import type { ReactNode } from "react";

import { DateTimeField } from "@/components/elements/DateTimeField";
import { Field, TextAreaField } from "@/components/elements/Field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseCoordinates } from "@/utils/geo";

/**
 * Says whether a pasted link actually yielded a pin, while it is being pasted.
 * The alternative is discovering it on the published event page, where the file
 * is already frozen.
 */
function PinHint({ link, missing }: { link: string; missing: string }) {
  if (!link.trim()) return <>Optional. Paste a link and the coordinates are read out of it.</>;
  const pin = parseCoordinates(link);
  if (!pin) return <span className="text-warning">{missing}</span>;
  return (
    <span className="numeric">
      Pin found: {pin.lat}, {pin.lng}
    </span>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="heading-strong text-lg text-foreground">{title}</h2>
        {note ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export interface EventDetails {
  name: string;
  /** `YYYY-MM-DDTHH:mm`, read in the organiser's own timezone. */
  startsAtLocal: string;
  description: string;
  locationName: string;
  locationLink: string;
  posterUrl: string;
  waiverUrl: string;
  instagram: string;
  website: string;
  registrationOpens: string;
  registrationCloses: string;
  racepackStarts: string;
  racepackEnds: string;
  racepackVenue: string;
  racepackVenueLink: string;
  /** `HH:mm`. The day comes from the start, so it is not asked for twice. */
  cutOff: string;
}

export const EMPTY_DETAILS: EventDetails = {
  name: "",
  startsAtLocal: "",
  description: "",
  locationName: "",
  locationLink: "",
  posterUrl: "",
  waiverUrl: "",
  instagram: "",
  website: "",
  registrationOpens: "",
  registrationCloses: "",
  racepackStarts: "",
  racepackEnds: "",
  racepackVenue: "",
  racepackVenueLink: "",
  cutOff: "",
};

interface StepDetailsProps {
  details: EventDetails;
  onChange: (details: EventDetails) => void;
}

export function StepDetails({ details, onChange }: StepDetailsProps) {
  const set = (patch: Partial<EventDetails>) => onChange({ ...details, ...patch });

  return (
    <div className="flex flex-col gap-8">
      <Section title="The race" note="The name and the start cannot be changed afterwards.">
        <Field
          id="name"
          label="Event name"
          required
          value={details.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Jakarta Sunrise 10K"
        />
        <DateTimeField
          id="starts-at"
          label="Start"
          required
          warnIfPast
          value={details.startsAtLocal}
          onChange={(startsAtLocal) => set({ startsAtLocal })}
          hint="In your own timezone."
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="cut-off">Cut off</Label>
          <Input
            id="cut-off"
            type="time"
            value={details.cutOff}
            onChange={(e) => set({ cutOff: e.target.value })}
            className="numeric w-32"
          />
          <p className="text-sm text-muted-foreground">
            The last moment a finish counts, on the race day.
          </p>
        </div>
        <Field
          id="location"
          label="Location"
          value={details.locationName}
          onChange={(e) => set({ locationName: e.target.value })}
          placeholder="Gelora Bung Karno, Jakarta"
        />
        <Field
          id="location-link"
          label="Google Maps link"
          value={details.locationLink}
          onChange={(e) => set({ locationLink: e.target.value })}
          placeholder="https://www.google.com/maps/@-6.2185,106.8026,17z"
          hint={
            <PinHint
              link={details.locationLink}
              missing="Paste the long link from the address bar. A shortened one (maps.app.goo.gl) carries no coordinates."
            />
          }
        />
        <TextAreaField
          id="description"
          label="Description"
          value={details.description}
          onChange={(description) => set({ description })}
          placeholder="Two laps of the park, flat, water at every 2 km."
        />
      </Section>

      <Section
        title="Registration"
        note="When people can enter. Opening and closing entries is still a switch you press yourself, so treat these as what you are promising runners."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <DateTimeField
            id="reg-opens"
            label="Registration opens"
            required
            value={details.registrationOpens}
            onChange={(registrationOpens) => set({ registrationOpens })}
          />
          <DateTimeField
            id="reg-closes"
            label="Registration closes"
            required
            value={details.registrationCloses}
            onChange={(registrationCloses) => set({ registrationCloses })}
          />
        </div>
      </Section>

      <Section
        title="Race pack collection"
        note="Leave empty if there is no collection day and packs are handed out at the start."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <DateTimeField
            id="pack-starts"
            label="Collection opens"
            value={details.racepackStarts}
            onChange={(racepackStarts) => set({ racepackStarts })}
          />
          <DateTimeField
            id="pack-ends"
            label="Collection closes"
            value={details.racepackEnds}
            onChange={(racepackEnds) => set({ racepackEnds })}
          />
          <Field
            id="pack-venue"
            label="Venue"
            value={details.racepackVenue}
            onChange={(e) => set({ racepackVenue: e.target.value })}
            placeholder="Hall A"
          />
          <Field
            id="pack-venue-link"
            label="Venue on Google Maps"
            value={details.racepackVenueLink}
            onChange={(e) => set({ racepackVenueLink: e.target.value })}
            placeholder="https://www.google.com/maps/@..."
            hint={
              <PinHint link={details.racepackVenueLink} missing="No pin found in that link yet." />
            }
          />
        </div>
      </Section>

      <Section
        title="Poster and links"
        note="Where runners go for updates. These are part of the details file, so the account you name here cannot be swapped for another one after people have entered."
      >
        <Field
          id="poster"
          label="Poster image URL"
          value={details.posterUrl}
          onChange={(e) => set({ posterUrl: e.target.value })}
          placeholder="https://..."
          hint="A link to an image you already host somewhere. There is no upload here yet."
        />
        <Field
          id="instagram"
          label="Instagram"
          value={details.instagram}
          onChange={(e) => set({ instagram: e.target.value })}
          placeholder="@jakartarun"
          hint="The handle, or paste the profile link and we will take the handle out of it."
        />
        <Field
          id="website"
          label="Website"
          value={details.website}
          onChange={(e) => set({ website: e.target.value })}
          placeholder="https://..."
        />
        <Field
          id="waiver"
          label="Waiver URL"
          value={details.waiverUrl}
          onChange={(e) => set({ waiverUrl: e.target.value })}
          placeholder="https://..."
        />
      </Section>
    </div>
  );
}
