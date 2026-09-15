"use client";

/**
 * Walking the run of signatures that creates an event.
 *
 * The list itself is planned in `modules/organiser/run.ts`; this is the part
 * that performs it. Kept out of the component because it is a loop with state
 * that outlives a render (the event id appears in the middle of the run and
 * every later step needs it) and because the thing worth testing is the
 * behaviour on failure, not the markup.
 *
 * ## What happens when one fails
 *
 * It stops, and everything before it stays done. That is not a nicety: those
 * transactions have landed and cannot be undone, so a screen that reset would
 * be lying about what exists. Pressing the button again resumes at the first
 * step that has not landed, never repeating one that has.
 *
 * A declined prompt arrives here as an ordinary failure, because that is what
 * it is from the run's point of view: nothing after it happened. It is worth
 * saying plainly on screen, though, since the organiser did that on purpose and
 * should not be told to fix anything.
 *
 * ## Why the loop tracks its own copy of what is done
 *
 * `setState` does not take effect until the next render, and the loop runs to
 * completion inside one. Reading the state variable would see the value from
 * before the run started and repeat every step. So the loop keeps a local array
 * and mirrors it into state for the screen.
 */
import { useMemo, useState } from "react";

import {
  useAddAddon,
  useAddCategory,
  useCreateEvent,
  useSetEventStatus,
} from "@/hooks/useOrganiser";
import { useWallet } from "@/hooks/useWallet";
import { friendlyError } from "@/lib/errors";
import { fetchEventMetadata } from "@/lib/metadata";
import { PlainError } from "@/lib/plain-error";
import { clearRunProgress, loadRunProgress, saveRunProgress } from "@/lib/run-progress";
import { uploadEventFile } from "@/lib/upload";
import { signMessage } from "@/lib/wallet";
import type { PlannedCategory } from "@/modules/organiser/component/StepCategoryPlan";
import type { PublishedDocument } from "@/modules/organiser/component/DocumentFallback";
import { addOnUnits, type PlannedAddOn } from "@/modules/organiser/addons";
import { nextStep, planRun, type RunStep } from "@/modules/organiser/run";
import { parseStroops } from "@/utils/format";

export interface EventRunInput {
  name: string;
  plan: PlannedCategory[];
  addOns: PlannedAddOn[];
  startsAt: bigint | null;
  /** The exact text to publish. Its bytes are what the hash covers. */
  documentText: string;
  hash: string;
}

/** What the screen is waiting for right now, which are different feelings. */
export type WaitingFor = "wallet" | "network" | null;

export function useEventRun({
  name,
  plan,
  addOns,
  startsAt,
  documentText,
  hash,
}: EventRunInput) {
  const address = useWallet((state) => state.address);
  const createEvent = useCreateEvent();
  const addCategory = useAddCategory();
  const addAddon = useAddAddon();
  const setStatus = useSetEventStatus();

  /*
   * Picks a half-finished run back up instead of starting a second one, but
   * only when doing so is safe. `document` produces `state.document`, an
   * in-memory payload this file never persists; every step from `event`
   * onward acts on the chain against `eventId`, which is persisted. So a run
   * that stopped after `document` landed but before `event` did has nothing
   * safe to restore: replaying `done: ["document"]` with no `eventId` would
   * resume straight at `event`, which throws on `state.document` being empty
   * without ever calling `createEvent.write` — and since nothing landed,
   * `clearRunProgress` never runs, so every future visit would hit the same
   * wall. Once `eventId` is set, `event` must already have landed (it is the
   * only step that produces it), which in this list means `document` did
   * too, so the rest of `done` is sound to restore whole.
   *
   * Read with a lazy initializer, once into a plain object rather than once
   * per state variable, so the two pieces of state agree on a single read of
   * `localStorage` instead of two: `Wizard` never mounts this hook until
   * `CreateGate` has already confirmed a connected, allowlisted address
   * (`CreateEvent.tsx`), so `address` is already the final value on this
   * component instance's very first render, and there is no later moment an
   * effect would be needed to catch.
   */
  const [restored] = useState(() => {
    const saved = address ? loadRunProgress(address) : null;
    return saved && saved.eventId !== null
      ? { eventId: saved.eventId, done: saved.done }
      : { eventId: null as number | null, done: [] as string[] };
  });

  const [done, setDone] = useState<string[]>(restored.done);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ stepId: string; message: string } | null>(null);
  const [isRunning, setRunning] = useState(false);
  const [eventId, setEventId] = useState<number | null>(restored.eventId);
  const [document, setDocument] = useState<PublishedDocument | null>(null);

  const steps = useMemo(
    () => planRun({ name, categories: plan, addOns }),
    [name, plan, addOns],
  );

  const upload = useUploadPhase();
  const waitingFor: WaitingFor =
    current === "document"
      ? upload.phase
      : createEvent.phase === "signing" ||
          addCategory.phase === "signing" ||
          setStatus.phase === "signing"
        ? "wallet"
        : createEvent.phase === "confirming" ||
            addCategory.phase === "confirming" ||
            setStatus.phase === "confirming"
          ? "network"
          : null;

  async function perform(step: RunStep, state: { eventId: number | null; document: PublishedDocument | null }) {
    switch (step.kind) {
      case "document": {
        if (!address) throw new PlainError("Connect your wallet first.");
        const stored = await uploadEventFile({
          bytes: new TextEncoder().encode(documentText),
          contentType: "application/json",
          address,
          expectedSha256: hash,
          sign: upload.sign,
        });
        // Stored is not the same as served. Reading it back through the helper
        // the public event page uses is what makes this step mean anything.
        const served = await fetchEventMetadata(stored.url, hash);
        if (served.status !== "verified") {
          throw new PlainError(
            served.status === "modified"
              ? "Your race details did not upload correctly. Nothing has been created. Please try again."
              : "Your race details were uploaded but could not be checked. Please try again.",
          );
        }
        state.document = { uri: stored.url, hash };
        setDocument(state.document);
        return null;
      }
      case "event": {
        if (startsAt === null) throw new PlainError("The race needs a date and a start time first.");
        // The document is always present by the time this runs: it is the step
        // before, and the run stops on a step that fails.
        if (!state.document) throw new PlainError("The race details have not been published yet.");
        const sent = await createEvent.write({
          name: name.trim(),
          metadataHash: state.document.hash,
          uri: state.document.uri,
          startsAt,
        });
        state.eventId = sent.value;
        setEventId(sent.value);
        return sent.txHash;
      }
      case "category": {
        const category = plan.find((entry) => entry.code.trim() === step.code);
        if (!category || state.eventId === null) {
          throw new PlainError("That distance is no longer here.");
        }
        const sent = await addCategory.write({
          eventId: state.eventId,
          code: category.code.trim(),
          distanceM: Math.round(Number(category.km) * 1000),
          quota: Number(category.quota),
          priceStroops: parseStroops(category.price),
        });
        return sent.txHash;
      }
      case "addon": {
        if (state.eventId === null) throw new PlainError("The event does not exist yet.");
        const unit = addOnUnits(addOns).find((entry) => entry.code === step.code);
        if (!unit) throw new PlainError("That item is no longer here.");
        const sent = await addAddon.write({
          eventId: state.eventId,
          code: unit.code,
          priceStroops: parseStroops(unit.price),
          quota: Number(unit.stock),
        });
        return sent.txHash;
      }
      case "open": {
        if (state.eventId === null) throw new PlainError("The event does not exist yet.");
        const sent = await setStatus.write({ eventId: state.eventId, status: "Open" });
        return sent.txHash;
      }
    }
  }

  async function start() {
    if (isRunning) return;
    setRunning(true);
    setFailure(null);

    const landed = [...done];
    const state = { eventId, document };

    try {
      for (;;) {
        const step = nextStep(steps, landed);
        if (!step) break;
        setCurrent(step.id);
        try {
          const txHash = await perform(step, state);
          if (txHash) setReceipts((all) => ({ ...all, [step.id]: txHash }));
        } catch (error) {
          // Mapped here rather than in the dialog: this is the one place the
          // run learns what went wrong, and what reaches the screen must be a
          // sentence somebody wrote for a reader (`lib/errors.ts`).
          //
          // The original is logged first, and only in development. Mapping
          // destroys it otherwise, and then an organiser who is stuck has
          // nothing to report but the same sentence everybody else sees. It is
          // kept out of production because the raw text is the wallet's and the
          // SDK's, written for us rather than for whoever opens a console.
          if (process.env.NODE_ENV === "development") {
            console.error(`Event run step "${step.id}" failed`, error);
          }
          setFailure({ stepId: step.id, message: friendlyError(error) });
          return;
        }
        landed.push(step.id);
        setDone([...landed]);
        if (address) saveRunProgress(address, { eventId: state.eventId, done: [...landed] });
      }
      if (address) clearRunProgress(address);
    } finally {
      setCurrent(null);
      setRunning(false);
    }
  }

  return {
    steps,
    done,
    receipts,
    current,
    failure,
    isRunning,
    waitingFor,
    eventId,
    document,
    /** True once every step in the plan has landed. */
    isComplete: steps.length > 0 && steps.every((step) => done.includes(step.id)),
    start,
    /** Adopt a document the organiser hosted and checked themselves. */
    useHostedDocument(hosted: PublishedDocument) {
      setDocument(hosted);
      setDone((all) => (all.includes("document") ? all : [...all, "document"]));
      setFailure(null);
    },
  };
}

/**
 * The two halves of an upload, told apart the same way `useChainWrite` tells
 * apart the two halves of a transaction: by wrapping the signer, because the
 * moment it is called we are waiting for a person and the moment it returns we
 * are waiting for the network.
 */
function useUploadPhase() {
  const [phase, setPhase] = useState<WaitingFor>("wallet");

  const sign = async (message: string, opts?: { address?: string }) => {
    setPhase("wallet");
    try {
      return await signMessage(message, opts);
    } finally {
      setPhase("network");
    }
  };

  return { phase, sign };
}
