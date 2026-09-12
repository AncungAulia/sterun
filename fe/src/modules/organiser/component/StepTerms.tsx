"use client";

/**
 * Step 3: the rules of the race, in the organiser's own words.
 *
 * ## Why this is worth a step of its own
 *
 * Every real race publishes one, and it is the document a dispute is settled
 * against: who may enter, what happens to a race pack nobody collects, what
 * the organiser may do if the weather turns. Leaving it to a link on an
 * Instagram post means the rules can change after people have paid, which is
 * the whole class of problem this product exists to close.
 *
 * ## What makes it different here
 *
 * It goes into the event document, so its fingerprint is the `metadata_hash`
 * already on chain. That makes the terms **frozen and checkable**: a runner
 * can prove the rules they agreed to are the rules still being served. No
 * other race platform can offer that, and it is worth saying out loud on this
 * screen rather than hiding in a tooltip.
 *
 * The cost is the same coin: there is no editing afterwards. An organiser who
 * needs to correct a typo cannot, so the warning is on the screen and not
 * behind an icon.
 *
 * ## Why one field and not a form per section
 *
 * Races structure these differently, and the sections a fun run needs are not
 * the sections a marathon needs. A form with fixed headings would either force
 * empty ones or leave out the one that mattered. The placeholder shows the
 * shape without imposing it.
 */
import { TextAreaField } from "@/components/elements/Field";
import { Section } from "@/components/elements/Section";

const PLACEHOLDER = `General

- Tickets are sold only through this page.
- One ticket admits one runner, and it cannot be transferred or resold.
- Runners must register under the identity they will show at collection.

Who may enter

- ...

Race pack

- ...

On the day

- ...

Photography

- ...

If the race cannot go ahead

- ...`;

export interface StepTermsProps {
  terms: string;
  onChange: (terms: string) => void;
}

export function StepTerms({ terms, onChange }: StepTermsProps) {
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Terms and conditions"
        note="Published with the event, so nobody can change the rules after people have entered."
      >
        <div className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
          <p className="text-base text-warning">
            Read this back before you continue. Like the name and the date, the terms cannot be
            edited or removed once the event is created, not even to fix a typo.
          </p>
        </div>

        <TextAreaField
          id="terms"
          label="The rules of your race"
          rows={18}
          value={terms}
          onChange={onChange}
          placeholder={PLACEHOLDER}
          help="Whatever a runner has to agree to: who may enter, how the race pack is collected, what happens on the day, and what you may do if the weather or the authorities take the decision out of your hands. Plain text, in the language your runners read."
        />

        <p className="text-sm text-n-500">
          Optional. Most races publish terms, and without them a runner has nothing to hold you
          to.
        </p>
      </Section>
    </div>
  );
}
