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
import { fetchEventMetadata } from "@/lib/metadata";
import { uploadEventFile } from "@/lib/upload";
import { signMessage, walletErrorMessage } from "@/lib/wallet";
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

  const [done, setDone] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ stepId: string; message: string } | null>(null);
  const [isRunning, setRunning] = useState(false);
  const [eventId, setEventId] = useState<number | null>(null);
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
        if (!address) throw new Error("Connect a wallet before publishing the details.");
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
          throw new Error(
            served.status === "modified"
              ? "The file came back different from the one built here, so its fingerprint would not match."
              : `The file was stored but could not be read back: ${served.reason}`,
          );
        }
        state.document = { uri: stored.url, hash };
        setDocument(state.document);
        return null;
      }
      case "event": {
        if (startsAt === null) throw new Error("The race needs a date and a start time first.");
        // The document is always present by the time this runs: it is the step
        // before, and the run stops on a step that fails.
        if (!state.document) throw new Error("The event details have not been published yet.");
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
        if (!category || state.eventId === null) throw new Error("That distance is no longer here.");
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
        if (state.eventId === null) throw new Error("The event does not exist yet.");
        const unit = addOnUnits(addOns).find((entry) => entry.code === step.code);
        if (!unit) throw new Error("That item is no longer here.");
        const sent = await addAddon.write({
          eventId: state.eventId,
          code: unit.code,
          priceStroops: parseStroops(unit.price),
          quota: Number(unit.stock),
        });
        return sent.txHash;
      }
      case "open": {
        if (state.eventId === null) throw new Error("The event does not exist yet.");
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
          setFailure({ stepId: step.id, message: walletErrorMessage(error) });
          return;
        }
        landed.push(step.id);
        setDone([...landed]);
      }
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
