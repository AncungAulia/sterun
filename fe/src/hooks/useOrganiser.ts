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
