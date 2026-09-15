"use client";

/**
 * STE-17 — the four things an organiser can do to an event, as hooks.
 *
 * Thin on purpose. Every one is `useChainWrite` over one SDK call, and the
 * interesting behaviour (which wallet acts, waiting-for-you versus
 * waiting-for-chain, refusing without a wallet) lives there once instead of
 * four times.
 *
 * They are separate hooks rather than one with a switch because each is a
 * separate transaction with its own signature, its own failure and its own
 * button. The wizard's whole shape follows from that.
 */
import { useQuery } from "@tanstack/react-query";

import { readClient } from "@/lib/sterun";

import { useChainWrite, type Actor } from "./useChainWrite";

export interface CreateEventInput {
  name: string;
  /** sha256 of the published document, 64 hex characters. */
  metadataHash: string;
  uri: string;
  startsAt: bigint;
}

/** Returns the new `event_id`. Events are born `Draft`: nobody can enter yet. */
export function useCreateEvent() {
  return useChainWrite<CreateEventInput, number>((input, actor: Actor) =>
    readClient.createEvent({ organiser: actor.publicKey, ...input }, actor),
  );
}

export interface AddCategoryInput {
  eventId: number;
  /** Soroban Symbol: letters, digits and underscore, e.g. `10K`. */
  code: string;
  distanceM: number;
  quota: number;
  /** Entry fee in stroops, 7 decimals. `0n` is a free category. */
  priceStroops: bigint;
}

export function useAddCategory() {
  return useChainWrite<AddCategoryInput, number>((input, actor) =>
    readClient.addCategory(input, actor),
  );
}

export interface AddAddonInput {
  eventId: number;
  /** Soroban `Symbol`, derived from the item and its size (`EVENT_JERSEY_M`). */
  code: string;
  /** Price in stroops. `0n` for something the entry fee already covers. */
  priceStroops: bigint;
  /** Units. The contract refuses zero (`InvalidQuota`). */
  quota: number;
}

export function useAddAddon() {
  return useChainWrite<AddAddonInput, number>((input, actor) =>
    readClient.addAddon(input, actor),
  );
}

export interface SetEventStatusInput {
  eventId: number;
  status: "Draft" | "Open" | "Closed" | "Completed";
}

/**
 * Legal transitions are enforced on chain (INTERFACE.md §1.2), including the
 * one that surprises people: setting the status it already has reverts
 * `InvalidStatus(11)`.
 */
export function useSetEventStatus() {
  return useChainWrite<SetEventStatusInput, void>(({ eventId, status }, actor) =>
    readClient.setEventStatus(eventId, status, actor),
  );
}

export interface ScannerInput {
  eventId: number;
  scanner: string;
}

export function useAddScanner() {
  return useChainWrite<ScannerInput, void>(({ eventId, scanner }, actor) =>
    readClient.addScanner(eventId, scanner, actor),
  );
}

export function useRemoveScanner() {
  return useChainWrite<ScannerInput, void>(({ eventId, scanner }, actor) =>
    readClient.removeScanner(eventId, scanner, actor),
  );
}

/**
 * Whether this wallet is on the registry's organiser allowlist (STE-36).
 *
 * Asked here rather than discovered from a failed `create_event`, because the
 * refusal lands at the end of the wizard and the run's first step has already
 * uploaded the details file by then: a wallet that was never allowed to
 * publish would still have spent storage and six forms to find out.
 *
 * Three states, and the third is the one worth being careful about:
 * `true` allowed, `false` refused, `undefined` not answered yet or not
 * answerable. Being unable to reach a node is not the same as being turned
 * away, so a failure here must not read as one; the contract still refuses on
 * its own, and simulation refuses before anything is signed or paid.
 */
export function useCanCreateEvents(address: string | null) {
  const query = useQuery({
    queryKey: ["organiser-allowlist", address],
    enabled: address !== null,
    queryFn: () => readClient.isOrganiser(address!),
    staleTime: 60_000,
    // No retry at all, which is not laziness. The answer gates a screen, so
    // the wait is in front of somebody's eyes, and the fallback when it does
    // not arrive is to let them through anyway. Retrying only delays a form
    // that is going to be shown either way.
    retry: false,
  });

  return { allowed: query.data, isChecking: query.isPending && address !== null };
}
