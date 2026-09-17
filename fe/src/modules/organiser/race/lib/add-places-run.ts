/**
 * STE-57 - the three steps of adding places, in order, with no React in them.
 *
 * 1. **Approve the announcement.** The wallet signs the announcement text
 *    (SEP-53). First, so a declined prompt costs nothing: no places have moved.
 * 2. **Approve the new places.** `increase_quota`, one transaction.
 * 3. **Publish the announcement.** `POST /events/:id/announcements`.
 *
 * The raise and its announcement are approved back to back, so they cannot
 * drift apart in what they say. What can still happen is step 3 failing after
 * step 2 landed: the places are real and the reason is not public yet. That
 * state keeps its signature and offers exactly one way out, publishing again.
 *
 * Two rules follow from the chain, not from taste:
 *
 * - **A failed raise is asked of the ledger before it is called a failure.**
 *   A transaction that went out with no answer may have landed, and a retry of
 *   one that did reverts `QuotaNotIncreased(19)`, which would otherwise strand
 *   the organiser on an error for a change that worked. A decline is the one
 *   failure that needs no read: nothing was sent.
 * - **A signature older than nine minutes is signed again.** The server refuses
 *   a `published_at` more than ten minutes from its clock, so a publish retried
 *   after a coffee would fail forever on the old one.
 */
import { ApiError } from "@/lib/api/client";
import { friendlyError, isDeclined } from "@/lib/api/errors";
import { announcementToSign } from "@/lib/event/announcements";

export type AddPlacesStep = "sign" | "raise" | "publish";

export const STEP_ORDER: readonly AddPlacesStep[] = ["sign", "raise", "publish"];

/** Nine minutes: one under the server's ten, for clocks that disagree a little. */
export const SIGNATURE_FRESH_MS = 9 * 60 * 1000;

export interface SignedAnnouncement {
  publishedAt: string;
  body: string;
  signature: string;
}

export interface AddPlacesState {
  signed: SignedAnnouncement | null;
  raised: boolean;
  published: boolean;
  /** The step in flight, or null between presses. */
  running: AddPlacesStep | null;
  failed: { step: AddPlacesStep; message: string } | null;
}

export const INITIAL_STATE: AddPlacesState = {
  signed: null,
  raised: false,
  published: false,
  running: null,
  failed: null,
};

export interface AddPlacesPlan {
  eventId: number;
  categoryId: number;
  organiser: string;
  newQuota: number;
  body: string;
}

export interface AddPlacesDeps {
  now: () => number;
  signMessage: (message: string) => Promise<string>;
  increaseQuota: (plan: AddPlacesPlan) => Promise<void>;
  /** This distance's quota as the ledger holds it now. */
  quotaOnChain: (plan: AddPlacesPlan) => Promise<number>;
  publish: (fields: SignedAnnouncement & { eventId: number; signer: string }) => Promise<void>;
  /** Called on every change, so a screen can follow the run. */
  onChange: (state: AddPlacesState) => void;
}

export function isDone(state: AddPlacesState): boolean {
  return state.signed !== null && state.raised && state.published;
}

/**
 * Runs whatever has not happened yet and returns where it stopped. Calling it
 * again with the returned state resumes: a landed step is never repeated.
 */
export async function runAddPlaces(
  plan: AddPlacesPlan,
  from: AddPlacesState,
  deps: AddPlacesDeps,
): Promise<AddPlacesState> {
  let state: AddPlacesState = { ...from, failed: null };
  const set = (patch: Partial<AddPlacesState>) => {
    state = { ...state, ...patch };
    deps.onChange(state);
  };
  const fail = (step: AddPlacesStep, error: unknown) => {
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

  if (!state.raised) {
    set({ running: "raise" });
    try {
      await deps.increaseQuota(plan);
      set({ raised: true });
    } catch (error) {
      if (isDeclined(error)) return fail("raise", error);
      const onChain = await deps.quotaOnChain(plan).catch(() => null);
      // Exactly the new number, not "at least": a quota already higher than
      // this plan means some other change, and announcing this one over it
      // would publish the wrong figures.
      if (onChain !== plan.newQuota) return fail("raise", error);
      set({ raised: true });
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
