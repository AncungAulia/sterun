"use client";

/**
 * Step 1: everything about the race, collected before anything is signed.
 *
 * Nothing here touches the chain. It is a form precisely because the next steps
 * are not: once `create_event` lands, the name, the start time and the document
 * hash are permanent, so this is the last place any of it can be corrected.
 */
import { DateTimeField } from "@/components/elements/DateTimeField";
import { Field, TextAreaField } from "@/components/elements/Field";
import { parseCoordinates } from "@/utils/geo";

/**
 * Says whether a pasted link actually yielded a pin, while it is being pasted.
 * The alternative is discovering it on the published event page, where the
 * document is already frozen.
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

export interface EventDetails {
  name: string;
  /** `datetime-local` value, read in the organiser's own timezone. */
  startsAtLocal: string;
  description: string;
  locationName: string;
  locationLink: string;
  posterUrl: string;
  waiverUrl: string;
  registrationOpens: string;
  registrationCloses: string;
  racepackStarts: string;
  racepackEnds: string;
  racepackVenue: string;
  racepackVenueLink: string;
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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="heading text-xl text-n-700">The race</h2>
        <Field
          id="name"
          label="Event name"
          value={details.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Jakarta Sunrise 10K"
          hint="This cannot be changed later."
        />
        <DateTimeField
          id="starts-at"
          label="Start"
          value={details.startsAtLocal}
          onChange={(startsAtLocal) => set({ startsAtLocal })}
          warnIfPast
          hint="In your own timezone."
        />
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
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading text-xl text-n-700">Links</h2>
        <Field
          id="poster"
          label="Poster image URL"
          value={details.posterUrl}
          onChange={(e) => set({ posterUrl: e.target.value })}
          placeholder="https://..."
          hint="A link to an image you already host somewhere. There is no upload here yet."
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
          Optional. These dates tell runners what to expect. What actually opens and closes
          entries is the switch at the end of this wizard, not anything written here.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField
            id="reg-opens"
            label="Registration opens"
            value={details.registrationOpens}
            onChange={(registrationOpens) => set({ registrationOpens })}
          />
          <DateTimeField
            id="reg-closes"
            label="Registration closes"
            value={details.registrationCloses}
            onChange={(registrationCloses) => set({ registrationCloses })}
          />
          <DateTimeField
            id="pack-starts"
            label="Race pack collection opens"
            value={details.racepackStarts}
            onChange={(racepackStarts) => set({ racepackStarts })}
          />
          <DateTimeField
            id="pack-ends"
            label="Race pack collection closes"
            value={details.racepackEnds}
            onChange={(racepackEnds) => set({ racepackEnds })}
          />
          <Field
            id="pack-venue"
            label="Race pack venue"
            value={details.racepackVenue}
            onChange={(e) => set({ racepackVenue: e.target.value })}
            placeholder="Hall A"
          />
          <Field
            id="pack-venue-link"
            label="Race pack venue on Google Maps"
            value={details.racepackVenueLink}
            onChange={(e) => set({ racepackVenueLink: e.target.value })}
            placeholder="https://www.google.com/maps/@..."
            hint={<PinHint link={details.racepackVenueLink} missing="No pin found in that link yet." />}
          />
          <DateTimeField
            id="cut-off"
            label="Cut off time"
            value={details.cutOff}
            onChange={(cutOff) => set({ cutOff })}
            hint="The last moment a finish still counts. This is for runners to read. It does not stop anyone finishing later, and it does not stop you publishing their result."
          />
        </div>
      </section>
    </div>
  );
}
