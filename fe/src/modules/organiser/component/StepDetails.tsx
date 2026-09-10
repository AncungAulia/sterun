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

import { DateRangeField, EMPTY_RANGE, type DayRange } from "@/components/elements/DateRangeField";
import { DateTimeField } from "@/components/elements/DateTimeField";
import { Field, TextAreaField } from "@/components/elements/Field";
import { Section } from "@/components/elements/Section";
import { FileField } from "@/components/elements/FileField";
import { EMPTY_PLACE, PlaceFields, type Place } from "@/components/elements/PlaceFields";
import { parseCoordinates } from "@/utils/geo";

/**
 * Says whether a pasted link actually yielded a pin, while it is being pasted.
 * The alternative is discovering it on the published event page, where the file
 * is already frozen.
 */
function PinHint({ link, missing }: { link: string; missing: string }) {
  // Nothing while the field is empty, and no coordinates when it works. Nobody
  // reads a latitude to check their own address, and a line that always says
  // something trains people to stop reading the one that matters.
  if (!link.trim()) return null;
  if (!parseCoordinates(link)) return <span className="text-warning">{missing}</span>;
  return <>Pin found.</>;
}

export interface EventDetails {
  name: string;
  /** `YYYY-MM-DD`. The hours belong to the distances, which start in waves. */
  raceDate: string;
  description: string;
  place: Place;
  locationLink: string;
  /** Both hold a url from `POST /events/files`, not one anybody typed. */
  posterUrl: string;
  waiverUrl: string;
  instagram: string;
  website: string;
  registrationOpens: string;
  registrationCloses: string;
  racepack: DayRange;
  racepackVenue: string;
  racepackVenueLink: string;
}

export const EMPTY_DETAILS: EventDetails = {
  name: "",
  raceDate: "",
  description: "",
  place: EMPTY_PLACE,
  locationLink: "",
  posterUrl: "",
  waiverUrl: "",
  instagram: "",
  website: "",
  registrationOpens: "",
  registrationCloses: "",
  racepack: EMPTY_RANGE,
  racepackVenue: "",
  racepackVenueLink: "",
};

interface StepDetailsProps {
  details: EventDetails;
  onChange: (details: EventDetails) => void;
  /** Field keys to mark, shown only after somebody has pressed Continue. */
  errors?: Record<string, string>;
  /**
   * An existing race with the same name, if the index knows one.
   *
   * Separate from `errors` because it must not behave like one: it does not
   * gate Continue, it appears while typing rather than after a press, and the
   * organiser is allowed to be right about it.
   */
  nameClash?: string | null;
}

export function StepDetails({
  details,
  onChange,
  errors = {},
  nameClash = null,
}: StepDetailsProps) {
  const set = (patch: Partial<EventDetails>) => onChange({ ...details, ...patch });

  return (
    <div className="flex flex-col gap-8">
      <Section title="The race" note="The name and the start cannot be changed afterwards.">
        <Field
          id="name"
          label="Event name"
          required
          error={errors.name}
          value={details.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Your race name"
          help="This is the name on the public list of races and on every runner's pass. It is stored with the event, and there is no way to rename it afterwards."
        />
        {/*
         * Below the field rather than inside it: `Field` shows an error or a
         * hint, and this is neither. It is also not hidden behind the help
         * tooltip, because a duplicate event costs a signature and cannot be
         * undone, and warnings that cost something are not allowed to hide.
         */}
        {nameClash === null ? null : (
          <div className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
            <p className="text-base text-warning">
              A race called <span className="font-medium">{nameClash}</span> is already on the
              public list. Carry on if this is a different race, but check first: an event cannot
              be renamed or removed once it is created.
            </p>
          </div>
        )}
        <DateTimeField
          id="race-date"
          label="Race date"
          dateOnly
          required
          error={errors.raceDate}
          warnIfPast
          value={details.raceDate}
          onChange={(raceDate) => set({ raceDate })}
        />
        <PlaceFields
          required
          place={details.place}
          errors={errors}
          onChange={(place) => set({ place })}
        />
        <Field
          id="location-link"
          label="Google Maps link"
          required
          error={errors.locationLink}
          value={details.locationLink}
          onChange={(e) => set({ locationLink: e.target.value })}
          placeholder="https://www.google.com/maps/@-6.2185,106.8026,17z"
          hint={
            <PinHint
              link={details.locationLink}
              missing="Paste the long link from the address bar. A short link (maps.app.goo.gl) has no coordinates in it."
            />
          }
          help="We read the two coordinates out of the link and keep those, not the link itself. That is what puts the start on a map, and what lets somebody find your race by looking near themselves."
        />
        <TextAreaField
          id="description"
          label="Description"
          required
          /*
            Tall, because four rows was sized for a sentence and races do not
            write one. A real fun run description runs to a page: a story, the
            schedule, what is in the pack, sometimes a price list. Scrolling
            inside a four line box to reread what you wrote is how a typo
            survives into a document that can never be edited.
          */
          rows={16}
          error={errors.description}
          value={details.description}
          onChange={(description) => set({ description })}
          /*
            The shape of a description, not somebody's race. A real event's
            name in here reads as an endorsement, or as a race this organiser
            is being nudged to copy.
          */
          placeholder={
            "What the race is, who it is for, and why it is worth running.\n\n" +
            "Schedule\n05:00 Gates open\n05:30 Flag off\n09:00 Finish line closes\n\n" +
            "Race pack\n1. Jersey\n2. Bib number\n3. Refreshment\n4. Medal"
          }
          help="The only part of the page that says what the race is actually like. Without it a runner has a name, a date, and nothing to decide on."
        />
      </Section>

      <Section
        title="Registration"
        note="When people can enter."
        help="These go on your event page as what you are promising runners. Opening and closing entries is still a switch you press yourself, so nothing shuts on its own at the time you put here."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <DateTimeField
            id="reg-opens"
            label="Registration opens"
            required
            error={errors.registrationOpens}
            value={details.registrationOpens}
            onChange={(registrationOpens) => set({ registrationOpens })}
          />
          <DateTimeField
            id="reg-closes"
            label="Registration closes"
            required
            error={errors.registrationCloses}
            value={details.registrationCloses}
            onChange={(registrationCloses) => set({ registrationCloses })}
          />
        </div>
      </Section>

      <Section
        title="Race pack collection"
        note="Leave empty if packs are handed out at the start instead."
        help="Collection is a desk somebody sits at, so this is a run of days plus the hours it is open on each of them, rather than one long window that stays open overnight."
      >
        <DateRangeField
          id="racepack"
          label="Collection days and hours"
          error={errors.racepack}
          value={details.racepack}
          onChange={(racepack) => set({ racepack })}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="pack-venue"
            label="Collection venue"
            value={details.racepackVenue}
            onChange={(e) => set({ racepackVenue: e.target.value })}
            placeholder="Hall A"
          />
          <Field
            id="pack-venue-link"
            label="Collection venue on Google Maps"
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
        note="Where runners go for updates. None of these can be swapped for something else once the event exists."
        help="They are part of what gets frozen with your event, so the account you name here cannot quietly become a different account after people have entered."
      >
        <FileField
          id="poster"
          label="Poster"
          kind="image"
          value={details.posterUrl}
          onChange={(posterUrl) => set({ posterUrl })}
          hint="PNG or JPEG, 1200 px wide or more, up to 5 MB."
          help="It sits at the top of your event page, as wide as the page and up to about 400 px tall, so a wide picture fills that space and a tall one is shown smaller. Any shape works. Under 1200 px wide it starts to look soft on a good screen."
        />
        <FileField
          id="waiver"
          label="Waiver"
          kind="document"
          value={details.waiverUrl}
          onChange={(waiverUrl) => set({ waiverUrl })}
          hint="PDF, up to 5 MB."
          help="This becomes the exact copy runners agreed to. Nobody can put a different document in its place later, including you, which is the whole reason it is worth uploading rather than linking to one."
        />
        <Field
          id="instagram"
          label="Instagram"
          value={details.instagram}
          onChange={(e) => set({ instagram: e.target.value })}
          placeholder="@yourrace"
          hint="A handle, or paste the profile link."
          help="The handle is stored rather than the address, because Instagram has changed the shape of its URLs before and this cannot be edited afterwards."
        />
        <Field
          id="website"
          label="Website"
          value={details.website}
          onChange={(e) => set({ website: e.target.value })}
          placeholder="https://..."
        />
      </Section>
    </div>
  );
}
