/**
 * A change to a published race, paired with the announcement that tells
 * runners about it. Sign, apply, publish, in that order.
 *
 * Two things in this console work exactly this way and a third is unlikely to
 * be far off: raising a sold-out distance's quota (STE-57) and moving the
 * registration close date (STE-69). Both change a number a runner has already
 * read and paid against, and **the chain records the change but cannot record
 * that anybody was told**. Pairing the two is an application rule, so this file
 * is where it is kept rather than written twice.
 *
 * Why this order, every time:
 *
 * - **Sign first.** A decline then costs nothing: no transaction, no row on the
 *   server, nothing to explain to anybody.
 * - **Apply second**, and a failure that is not a decline is checked against
 *   the ledger before it is believed (`landed`). A transaction can go out with
 *   no answer coming back, and a run that retried it would change the same
 *   thing twice.
 * - **Publish last.** If only this fails, the change is real and unannounced,
 *   which is the one state the screen must not let somebody walk away from: the
 *   caller keeps the dialog open with Publish as its only button.
 * - **A signature older than nine minutes is signed again.** The server refuses
 *   a `published_at` more than ten minutes from its clock, so a publish retried
 *   after a coffee would fail forever on the old one.
 *
 * Extracted from `add-places-run.ts` on 2026-09-24, when the close date became
 * the second caller. That file still exports its own names and is what STE-57's
 * tests drive; only the body moved.
 */
import { ApiError } from "@/lib/api/client";
import { friendlyError, isDeclined } from "@/lib/api/errors";
import { announcementToSign } from "@/lib/event/announcements";

export type AnnouncedStep = "sign" | "apply" | "publish";

/** Nine minutes: one under the server's ten, for clocks that disagree a little. */
export const SIGNATURE_FRESH_MS = 9 * 60 * 1000;

export interface SignedAnnouncement {
  publishedAt: string;
  body: string;
  signature: string;
}

export interface AnnouncedState {
  signed: SignedAnnouncement | null;
  applied: boolean;
  published: boolean;
  /** The step in flight, or null between presses. */
  running: AnnouncedStep | null;
  failed: { step: AnnouncedStep; message: string } | null;
}

export const INITIAL_ANNOUNCED_STATE: AnnouncedState = {
  signed: null,
  applied: false,
  published: false,
  running: null,
  failed: null,
};

export interface AnnouncedPlan {
  eventId: number;
  organiser: string;
  /** The sentence runners will read. Written by the page, never typed. */
  body: string;
}

export interface AnnouncedDeps {
  now: () => number;
  signMessage: (message: string) => Promise<string>;
  /** The change itself: one transaction. */
  apply: () => Promise<void>;
  /**
   * Whether the change is on the ledger, asked only after `apply` failed
   * without a decline. `true` means it landed despite the error.
   */
  landed: () => Promise<boolean>;
  publish: (fields: SignedAnnouncement & { eventId: number; signer: string }) => Promise<void>;
  onChange: (state: AnnouncedState) => void;
}

export function isAnnouncedDone(state: AnnouncedState): boolean {
  return state.signed !== null && state.applied && state.published;
}

/**
 * Runs whatever has not happened yet and returns where it stopped. Calling it
 * again with the returned state resumes: a landed step is never repeated.
 */
export async function runAnnouncedChange(
  plan: AnnouncedPlan,
  from: AnnouncedState,
  deps: AnnouncedDeps,
): Promise<AnnouncedState> {
  let state: AnnouncedState = { ...from, failed: null };
  const set = (patch: Partial<AnnouncedState>) => {
    state = { ...state, ...patch };
    deps.onChange(state);
  };
  const fail = (step: AnnouncedStep, error: unknown) => {
    set({ running: null, failed: { step, message: friendlyError(error) } });
    return state;
  };

  const stale =
    state.signed !== null &&
    !state.published &&
    deps.now() - Date.parse(state.signed.publishedAt) > SIGNATURE_FRESH_MS;
  if (state.signed === null || stale) {
    set({ signed: null, running: "sign" });
    try {
      const publishedAt = new Date(deps.now()).toISOString();
      const signature = await deps.signMessage(
        announcementToSign({ eventId: plan.eventId, publishedAt, body: plan.body }),
      );
      set({ signed: { publishedAt, body: plan.body, signature } });
    } catch (error) {
      return fail("sign", error);
    }
  }

  if (!state.applied) {
    set({ running: "apply" });
    try {
      await deps.apply();
      set({ applied: true });
    } catch (error) {
      if (isDeclined(error)) return fail("apply", error);
      const landed = await deps.landed().catch(() => false);
      if (!landed) return fail("apply", error);
      set({ applied: true });
    }
  }

  if (!state.published) {
    const signed = state.signed as SignedAnnouncement;
    set({ running: "publish" });
    try {
      await deps.publish({ ...signed, eventId: plan.eventId, signer: plan.organiser });
      set({ published: true, running: null });
    } catch (error) {
      // Dated too far from the server's clock: the next press signs again.
      if (error instanceof ApiError && error.code === "stale-announcement") set({ signed: null });
      return fail("publish", error);
    }
  }

  set({ running: null });
  return state;
}
