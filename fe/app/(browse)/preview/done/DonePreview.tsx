"use client";

import { useState } from "react";

import { Stepper } from "@/components/elements/Stepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepDone } from "@/modules/organiser/component/StepDone";

/*
 * Copied from CreateEvent rather than exported from it. The wizard's step list
 * is its own business, and a preview that imported it would be able to fail
 * the day someone renames a step, which is noise: what is under test here by
 * eye is the last card, not the sequence.
 */
const STEPS = [
  { id: "details", label: "Details" },
  { id: "distances", label: "Distances" },
  { id: "add-ons", label: "Add-ons" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
] as const;

const LONG_NAME = "Borobudur Marathon Presented by Bank Jateng and Friends 2026";

export function DonePreview() {
  const [name, setName] = useState("LARI TEKNIK (TESTING)");
  const [eventId, setEventId] = useState("3");
  /* Remounting is the only way to see the confetti again: it fires on mount. */
  const [run, setRun] = useState(0);

  const parsed = Number.parseInt(eventId, 10);

  return (
    <div className="mx-auto grid max-w-3xl gap-6 py-8">
      <div className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
        <p className="text-base text-warning">
          Preview only. This page is not part of the product and does not exist in production. No
          race here is real.
        </p>
      </div>

      <Card className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="preview-name">Race name</Label>
            <Input
              id="preview-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preview-id">Event number</Label>
            <Input
              id="preview-id"
              inputMode="numeric"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setRun((count) => count + 1)}>Replay confetti</Button>
          <Button variant="secondary" onClick={() => setName(LONG_NAME)}>
            Try a long name
          </Button>
          <Button variant="secondary" onClick={() => setEventId("128")}>
            Try a wider number
          </Button>
        </div>

        <p className="text-sm text-n-500">
          Confetti is skipped entirely when the system asks for reduced motion, so turning that on
          is the way to check this screen still reads without it.
        </p>
      </Card>

      <Stepper steps={STEPS} current="done" />

      <Card className="p-6">
        <StepDone
          key={run}
          eventId={Number.isNaN(parsed) ? 0 : parsed}
          eventName={name.trim() === "" ? "Untitled race" : name}
        />
      </Card>
    </div>
  );
}
