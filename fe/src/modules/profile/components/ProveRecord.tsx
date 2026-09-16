"use client";

/**
 * P4 to P8: proving one race record belongs to a person.
 *
 * A public page asking for a name, a national id and an emergency contact looks
 * like a phishing page, which is the constraint this block is designed under
 * (docs/design/profile/README.md §5). So:
 *
 * - **Closed by default**, on the card it belongs to. The check is
 *   `verify(token_id, fingerprint)`, one record at a time.
 * - **The promise sits above the first field**, where somebody decides whether
 *   to type their id, not under the button.
 * - **What is checked can be seen.** The fingerprint forms as the fields are
 *   filled, behind "See what is checked": a value anyone can watch change is a
 *   claim they can check, where a sentence promising privacy is not. It is
 *   folded away because 64 characters mean nothing to most readers (Ancung does
 *   not want technical detail on screen, 2026-09-16).
 * - **Nothing typed is kept.** The fields live in this component's state only,
 *   never in the URL, storage or a query cache, and they are cleared after every
 *   check, match or not.
 *
 * The handoff's words are filtered for the same reader: "hash" is "fingerprint"
 * (the event page's Verification tab already uses it), "salt" is "receipt code"
 * (what the receipt calls it), and no contract address is shown.
 *
 * **A refusal is not an accusation.** `verify` answers false for a wrong
 * fingerprint and for a token with no owner alike, so the copy says the details
 * do not match and names the two likely causes, the name's capitals first. It
 * never says the record is fake.
 */
import { Check, ChevronDown, Lock, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readClient } from "@/lib/chain/sterun";
import { readEntry } from "@/lib/entry-store";
import { cn } from "@/utils/cn";

import {
  NormalizationError,
  participantHash,
  type HashField,
  type ParticipantDetails,
} from "../lib/participant-hash";

const EMPTY: ParticipantDetails = { name: "", nationalId: "", emergencyContact: "", receiptCode: "" };

type Outcome = "match" | "no-match" | "unreachable";

/** What to say about a field the spec refuses to hash. */
const FIELD_PROBLEM: Record<HashField, string> = {
  name: "Fill in the full name.",
  national_id: "Fill in the national ID number.",
  emergency_contact: "Fill in the emergency contact number.",
  salt: "The receipt code is 64 characters. Check it was copied whole.",
};

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  hint: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "text" | "numeric" | "tel";
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal tracking-[0.08em] text-n-600">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={hintId}
        className="h-11"
      />
      <p id={hintId} className="text-sm text-n-600">
        {hint}
      </p>
    </div>
  );
}

export function ProveRecord({ tokenId }: { tokenId: number }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<ParticipantDetails>(EMPTY);
  /** The last fingerprint computed, with the exact input it came from. */
  const [computed, setComputed] = useState<{ key: string; hash: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  // Whether this device holds the receipt for this record (Ancung, 2026-09-16).
  // Read once the block opens; the code itself is only used on a press.
  useEffect(() => {
    if (!open) return;
    let current = true;
    void readEntry(tokenId)
      .then((entry) => {
        if (current) setSavedCode(entry?.salt ? entry.salt : null);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [open, tokenId]);

  const allFilled = Object.values(details).every((value) => value.trim().length > 0);
  const detailsKey = JSON.stringify(details);

  // The fingerprint forms as the fields fill in, and only when all four can be
  // hashed. It is shown only while it still belongs to what is in the fields:
  // held with its input, so a slow digest can never show the previous
  // keystroke's fingerprint beside the current text.
  useEffect(() => {
    if (!allFilled) return;
    let current = true;
    participantHash(details)
      .then((hash) => {
        if (current) setComputed({ key: detailsKey, hash });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [allFilled, details, detailsKey]);

  const fingerprint = allFilled && computed?.key === detailsKey ? computed.hash : null;

  const set = (key: keyof ParticipantDetails) => (value: string) => {
    setProblem(null);
    setDetails((previous) => ({ ...previous, [key]: value }));
  };

  async function check(event: FormEvent) {
    event.preventDefault();
    setProblem(null);

    let hash: string;
    try {
      hash = await participantHash(details);
    } catch (error) {
      setProblem(error instanceof NormalizationError ? FIELD_PROBLEM[error.field] : FIELD_PROBLEM.name);
      return;
    }

    setChecking(true);
    try {
      const matches = await readClient.verify(tokenId, hash);
      setOutcome(matches ? "match" : "no-match");
      // Cleared after every answer, match or not: nothing typed outlives a check.
      setDetails(EMPTY);
    } catch {
      // Could not ask. What was typed stays, so trying again needs no retyping.
      setOutcome("unreachable");
    } finally {
      setChecking(false);
    }
  }

  function startAgain() {
    setOutcome(null);
    setDetails(EMPTY);
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 underline-offset-4 hover:underline"
      >
        Prove this record is yours
        <ChevronDown aria-hidden className="size-4" />
      </button>
    );
  }

  return (
    <section aria-label="Prove this record is yours" className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-medium text-ink">Prove this record is yours</h3>
        <button
          type="button"
          aria-expanded
          onClick={() => {
            startAgain();
            setOpen(false);
          }}
          className="text-sm text-n-600 underline-offset-4 hover:underline"
        >
          Close
        </button>
      </div>

      {outcome === "match" || outcome === "no-match" ? (
        <div className="flex flex-col gap-4">
          <div
            role="status"
            className={cn(
              "flex gap-3 rounded-md border p-4",
              outcome === "match"
                ? "border-success-border bg-success-surface"
                : "border-danger-border bg-danger-surface",
            )}
          >
            {outcome === "match" ? (
              <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={3} />
            ) : (
              <X aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={3} />
            )}
            <div className="flex flex-col gap-1">
              <p className={cn("heading-strong text-lg", outcome === "match" ? "text-success" : "text-danger")}>
                {outcome === "match" ? "This record belongs to that person" : "No match"}
              </p>
              <p className="text-base text-n-700">
                {outcome === "match"
                  ? "The details typed match this record. Nobody without the receipt code could have made them match."
                  : "The details typed do not match this record."}
              </p>
            </div>
          </div>

          {outcome === "no-match" ? (
            <div className="flex flex-col gap-2 text-sm text-n-600">
              <p>
                <span className="font-medium text-n-800">Most likely the name.</span> Capitals count, so budi
                santoso and Budi Santoso are different.
              </p>
              <p>
                <span className="font-medium text-n-800">Then the receipt code.</span> All 64 characters, exactly
                as on the receipt.
              </p>
              <p>This only says the details differ. It does not say the record is fake.</p>
            </div>
          ) : null}

          <p className="text-sm text-n-600">What was typed has been cleared.</p>
          <Button variant="outline" onClick={startAgain}>
            {outcome === "match" ? "Check another" : "Try again"}
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void check(event)} className="flex flex-col gap-4">
          <p className="flex gap-3 rounded-md bg-teal-50 p-4 text-sm text-teal-800">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            What you type stays on this device. It is turned into a fingerprint here, and only the fingerprint
            is checked. Nothing is saved.
          </p>

          <Field
            label="Full name"
            placeholder="As written when entering"
            hint={
              <>
                <span className="font-medium text-n-800">Capitals matter.</span> Spacing does not.
              </>
            }
            value={details.name}
            onChange={set("name")}
          />
          <Field
            label="National ID number"
            placeholder="Numbers"
            hint="Spaces and dashes are ignored."
            inputMode="numeric"
            value={details.nationalId}
            onChange={set("nationalId")}
          />
          <Field
            label="Emergency contact number"
            placeholder="Phone number"
            hint="Spaces, dashes and brackets are ignored."
            inputMode="tel"
            value={details.emergencyContact}
            onChange={set("emergencyContact")}
          />
          <Field
            label="Receipt code"
            placeholder="64 characters, from the receipt"
            hint={
              savedCode ? (
                <button
                  type="button"
                  onClick={() => set("receiptCode")(savedCode)}
                  className="text-teal-700 underline underline-offset-4"
                >
                  Use the receipt code saved on this device
                </button>
              ) : (
                "Shown once when the entry was made, and on the receipt."
              )
            }
            value={details.receiptCode}
            onChange={set("receiptCode")}
          />

          <Accordion type="single" collapsible className="rounded-md border border-n-200 px-4">
            <AccordionItem value="fingerprint" className="border-b-0">
              <AccordionTrigger className="py-3 text-sm font-normal text-n-700">See what is checked</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                <p className="text-sm text-n-600">
                  This is all that leaves this page. It cannot be turned back into the details above.
                </p>
                <p className="numeric text-sm break-all text-n-700" aria-label="Fingerprint">
                  {fingerprint ?? "Appears once all four fields are filled in."}
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {problem ? (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          ) : null}
          {outcome === "unreachable" ? (
            <p role="alert" className="text-sm text-danger">
              Could not check just now. What you typed is still here, so try again in a moment.
            </p>
          ) : null}

          <Button type="submit" disabled={!allFilled || checking}>
            {checking ? "Checking" : "Check this record"}
          </Button>
        </form>
      )}
    </section>
  );
}
