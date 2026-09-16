"use client";

/**
 * Runs `modules/entry/lib/attempt.ts` against the vault, the wallet and the chain (STE-21).
 *
 * ## One effect, one step per state
 *
 * The reducer names the outside call a state waits on (`nextStep`), and one
 * effect runs it. The effect remembers the state object it started from, so
 * Strict Mode's second run in development does not ask the wallet twice.
 *
 * ## What happens when `enter` lands
 *
 * The receipt is written to this device first, because the bib name and the
 * receipt code are nowhere else. Nothing else is asked of the wallet: the
 * backend links the vault row to the new record from the chain within a poll
 * (STE-59). The confirm call this used to make needed a third signed message,
 * which surfaced as wallet popups over the success page (Ancung, 2026-09-15).
 *
 * ## Injected, so every failure row is testable
 *
 * Each outside call can be replaced, which is how the tests drive a decline, a
 * refusal, no answer and a failed check without a wallet or a network.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { eventKeys } from "@/hooks/useEvents";
import { runnerRecordsKey } from "@/hooks/useRunnerRecords";
import { susdKey } from "@/hooks/useSusdBalance";
import { saveEntry } from "@/lib/entry-store";
import { friendlyError, isDeclined, isNoAnswer } from "@/lib/api/errors";
import type { EventSummary } from "@/lib/event/events";
import { submitParticipant, type Submitted } from "@/modules/entry/lib/participants";
import { readClient } from "@/lib/chain/sterun";
import { readSusdBalance } from "@/lib/wallet/susd";
import { signMessage, signTransaction } from "@/lib/wallet/kit";
import {
  INITIAL_ATTEMPT,
  attemptReducer,
  nextStep,
  type AttemptState,
} from "@/modules/entry/lib/attempt";
import { addonIdsFor, type Basket, type Selection } from "@/modules/entry/lib/basket";
import type { ParticipantBody } from "@/modules/entry/lib/details";
import { classifyEnterFailure, type ChainAfter } from "@/modules/entry/lib/enter-failure";
import type { SterunClient, SterunRecord } from "@sterunxyz/sdk";

/** Everything one attempt needs, built by the pay step from the three steps. */
export interface EntryPlan {
  runner: string;
  summary: EventSummary;
  categoryId: number;
  basket: Basket;
  selection: Selection;
  body: ParticipantBody;
  total: bigint;
}

export interface EntryAttemptDeps {
  submit: typeof submitParticipant;
  enter: SterunClient["enter"];
  recordsOf: (runner: string) => Promise<SterunRecord[]>;
  chainAfter: (plan: EntryPlan) => Promise<ChainAfter | null>;
  save: typeof saveEntry;
  /** How long to look for a record after no answer. */
  checkWindowMs: number;
  checkIntervalMs: number;
}

/** The chain after a refusal, read in parallel. */
async function readChainAfter(plan: EntryPlan): Promise<ChainAfter> {
  const eventId = plan.summary.event.eventId;
  const [event, categories, addOns, balance] = await Promise.all([
    readClient.getEvent(eventId),
    readClient.listCategories(eventId),
    readClient.listAddOns(eventId),
    readSusdBalance(plan.runner),
  ]);

  const reserved = new Set(addonIdsFor(plan.basket, plan.selection));
  const names = new Map<number, string>();
  for (const item of plan.basket.pack) {
    for (const option of item.options) names.set(option.addonId, item.name);
  }
  for (const extra of plan.basket.extras) names.set(extra.addonId, extra.name);

  return {
    status: event.status,
    slotsLeft: categories.find((c) => c.categoryId === plan.categoryId)?.slotsLeft ?? 0,
    soldOutAddOns: [
      ...new Set(
        addOns
          .filter((addOn) => reserved.has(addOn.addonId) && addOn.unitsLeft === 0)
          .map((addOn) => names.get(addOn.addonId) ?? addOn.code),
      ),
    ],
    balance,
    total: plan.total,
  };
}

const DEFAULTS: EntryAttemptDeps = {
  submit: submitParticipant,
  enter: (args, options) => readClient.enter(args, options),
  recordsOf: (runner) => readClient.recordsOfDetailed(runner),
  chainAfter: readChainAfter,
  save: saveEntry,
  checkWindowMs: 30_000,
  checkIntervalMs: 3_000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useEntryAttempt(plan: EntryPlan | null, overrides: Partial<EntryAttemptDeps> = {}) {
  const deps = useRef<EntryAttemptDeps>({ ...DEFAULTS, ...overrides });
  // Kept current without re-running the effect: a new `overrides` object each
  // render must not count as a reason to sign again.
  useEffect(() => {
    deps.current = { ...DEFAULTS, ...overrides };
  });

  const [state, dispatch] = useReducer(attemptReducer, INITIAL_ATTEMPT);
  const started = useRef<AttemptState | null>(null);
  const queryClient = useQueryClient();

  const finish = useCallback(
    async (
      p: EntryPlan,
      submitted: Submitted,
      tokenId: number,
      txHash: string | null,
      via: "entered" | "found",
    ) => {
      const d = deps.current;
      const record = (await d.recordsOf(p.runner).catch(() => [] as SterunRecord[])).find(
        (r) => r.tokenId === tokenId,
      );
      const category = p.summary.categories.find((c) => c.categoryId === p.categoryId);
      // The receipt's "Race pack" line. The chain keeps add-on ids only, so the
      // names and sizes the runner picked exist nowhere else after this.
      const racePack = [
        ...p.basket.pack.map((item) => {
          const size = item.sized
            ? item.options.find((option) => option.addonId === p.selection.sizes[item.name])?.label
            : undefined;
          return size ? `${item.name} ${size}` : item.name;
        }),
        ...p.basket.extras
          .filter((extra) => p.selection.extras.includes(extra.addonId))
          .map((extra) => extra.name),
      ];

      await d
        .save({
          eventId: p.summary.event.eventId,
          categoryId: p.categoryId,
          tokenId,
          // Read back from chain; -1 only if that read failed, and the success
          // page reads the bib from chain again anyway.
          bibNo: record?.bibNo ?? -1,
          bibName: p.body.bib_name,
          raceName: p.summary.event.name,
          startsAt: p.summary.event.startsAt.toString(),
          distanceCode: category?.code ?? "",
          participantHash: submitted.participantHash,
          salt: submitted.salt,
          totpSecret: submitted.totpSecret,
          txHash: txHash ?? "",
          runner: p.runner,
          enteredAt: new Date().toISOString(),
          participantId: submitted.participantId,
          racePack,
          paidStroops: p.total.toString(),
        })
        // A device that will not store is a missing receipt, not a failed
        // entry. The entry exists; the success page says the receipt is elsewhere.
        .catch(() => {});

      // `entered` from paying, `found` from checking: the reducer accepts each
      // only in its own phase.
      dispatch({ type: via, tokenId });

      void queryClient.invalidateQueries({ queryKey: runnerRecordsKey(p.runner) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.one(p.summary.event.eventId) });
      void queryClient.invalidateQueries({ queryKey: susdKey(p.runner) });
    },
    [queryClient],
  );

  useEffect(() => {
    const step = nextStep(state);
    if (!plan || !step || started.current === state) return;
    started.current = state;
    const d = deps.current;

    if (step === "submit") {
      d.submit(plan.body, signMessage)
        .then((submitted) => dispatch({ type: "submitted", submitted }))
        .catch((error: unknown) =>
          dispatch({
            type: "submit-failed",
            message: friendlyError(error),
            declined: isDeclined(error),
          }),
        );
      return;
    }

    if (step === "enter" && state.phase === "paying") {
      const { submitted } = state;
      d.enter(
        {
          runner: plan.runner,
          eventId: plan.summary.event.eventId,
          categoryId: plan.categoryId,
          addOnIds: addonIdsFor(plan.basket, plan.selection),
          participantHash: submitted.participantHash,
        },
        { publicKey: plan.runner, signTransaction },
      )
        .then((sent) => finish(plan, submitted, sent.value, sent.txHash, "entered"))
        .catch(async (error: unknown) => {
          // A decline or no answer is read from the error alone. Only a real
          // refusal is worth a round of chain reads to explain.
          const refusal = !isDeclined(error) && !isNoAnswer(error);
          const after = refusal
            ? await Promise.resolve()
                .then(() => d.chainAfter(plan))
                .catch(() => null)
            : null;
          dispatch({ type: "enter-failed", failure: classifyEnterFailure(error, after) });
        });
      return;
    }

    if (step === "check" && state.phase === "checking") {
      const { submitted } = state;
      void (async () => {
        const until = Date.now() + d.checkWindowMs;
        try {
          for (;;) {
            const found = (await d.recordsOf(plan.runner)).find(
              (r) => r.eventId === plan.summary.event.eventId,
            );
            if (found) {
              await finish(plan, submitted, found.tokenId, null, "found");
              return;
            }
            if (Date.now() >= until) {
              dispatch({ type: "not-found" });
              return;
            }
            await sleep(d.checkIntervalMs);
          }
        } catch {
          dispatch({ type: "check-error" });
        }
      })();
    }
  }, [state, plan, finish]);

  return {
    state,
    start: () => dispatch({ type: "start" }),
    checkAgain: () => dispatch({ type: "check-again" }),
    detailsChanged: () => dispatch({ type: "details-changed" }),
    /** True while waiting on the wallet, the vault or the chain. */
    running: nextStep(state) !== null,
  };
}
