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
import {
  runAnnouncedChange,
  SIGNATURE_FRESH_MS,
  type AnnouncedState,
  type SignedAnnouncement,
} from "./announced-change";

export type AddPlacesStep = "sign" | "raise" | "publish";

export const STEP_ORDER: readonly AddPlacesStep[] = ["sign", "raise", "publish"];

export { SIGNATURE_FRESH_MS };
export type { SignedAnnouncement };

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

/** This run's words for the shared runner's, and back. */
function toShared(state: AddPlacesState): AnnouncedState {
  return {
    signed: state.signed,
    applied: state.raised,
    published: state.published,
    running: state.running === "raise" ? "apply" : state.running,
    failed: state.failed
      ? { step: state.failed.step === "raise" ? "apply" : state.failed.step, message: state.failed.message }
      : null,
  };
}

function fromShared(state: AnnouncedState): AddPlacesState {
  return {
    signed: state.signed,
    raised: state.applied,
    published: state.published,
    running: state.running === "apply" ? "raise" : state.running,
    failed: state.failed
      ? { step: state.failed.step === "apply" ? "raise" : state.failed.step, message: state.failed.message }
      : null,
  };
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
  const state = await runAnnouncedChange(
    { eventId: plan.eventId, organiser: plan.organiser, body: plan.body },
    toShared(from),
    {
      now: deps.now,
      signMessage: deps.signMessage,
      apply: () => deps.increaseQuota(plan),
      // Exactly the new number, not "at least": a quota already higher than
      // this plan means some other change, and announcing this one over it
      // would publish the wrong figures.
      landed: async () => (await deps.quotaOnChain(plan)) === plan.newQuota,
      publish: deps.publish,
      onChange: (next) => deps.onChange(fromShared(next)),
    },
  );
  return fromShared(state);
}
