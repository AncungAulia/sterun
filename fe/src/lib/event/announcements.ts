/**
 * STE-57 - a race's signed announcements (STE-40's `/events/:eventId/announcements`).
 *
 * An event document is frozen by its hash, so a change after publishing is
 * announced beside it. Two features use this: the console publishes one when an
 * organiser adds places, and the event page lists them under Updates. Hence
 * `lib/event`, not either module (guides/ARCHITECTURE.md §4.2).
 *
 * ## The server is not trusted about who wrote one
 *
 * It checks the signature before storing, but this page checks again, against
 * the organiser the chain names and against this app's own network and
 * registry. A row that fails is still shown, marked as unconfirmed: hiding it
 * would let a broken index silently remove what an organiser said, and showing
 * it as signed would let a broken index put words in their mouth.
 */
import { announcementMessage, verifyAnnouncement } from "@sterunxyz/sdk";

import { apiFetch } from "@/lib/api/client";
import { CONTRACTS, NETWORK } from "@/lib/chain/env";

/** The backend's limit on a body (`MAX_ANNOUNCEMENT_CHARS`). */
export const MAX_ANNOUNCEMENT_CHARS = 2000;

export interface Announcement {
  id: string;
  eventId: number;
  /** Signed. The date a runner is shown. */
  publishedAt: string;
  body: string;
  signer: string;
  /** base64, 64 bytes. */
  signature: string;
  networkPassphrase: string;
  eventRegistry: string;
}

interface AnnouncementJson {
  id: string;
  event_id: number;
  published_at: string;
  body: string;
  signer: string;
  signature: string;
  network_passphrase: string;
  event_registry: string;
}

function fromJson(row: AnnouncementJson): Announcement {
  return {
    id: row.id,
    eventId: row.event_id,
    publishedAt: row.published_at,
    body: row.body,
    signer: row.signer,
    signature: row.signature,
    networkPassphrase: row.network_passphrase,
    eventRegistry: row.event_registry,
  };
}

/**
 * The exact text the organiser's wallet signs, for this app's network and
 * registry. `publishedAt` is `new Date().toISOString()`, and the server refuses
 * one more than ten minutes from its own clock.
 */
export function announcementToSign(fields: { eventId: number; publishedAt: string; body: string }): string {
  return announcementMessage({
    networkPassphrase: NETWORK.networkPassphrase,
    eventRegistry: CONTRACTS.eventRegistry,
    ...fields,
  });
}

export async function publishAnnouncement(fields: {
  eventId: number;
  publishedAt: string;
  body: string;
  signer: string;
  signature: string;
}): Promise<Announcement> {
  const row = await apiFetch<AnnouncementJson>(`/events/${fields.eventId}/announcements`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      published_at: fields.publishedAt,
      body: fields.body,
      signer: fields.signer,
      signature: fields.signature,
    }),
  });
  return fromJson(row);
}

/** Newest first, as the server orders them. */
export async function listAnnouncements(eventId: number): Promise<Announcement[]> {
  const response = await apiFetch<{ announcements: AnnouncementJson[] }>(`/events/${eventId}/announcements`);
  return response.announcements.map(fromJson);
}

/**
 * Whether this organiser really signed this announcement, for this race on
 * this network. False on anything that cannot be checked, never a throw.
 */
export function isSignedByOrganiser(announcement: Announcement, organiser: string, eventId: number): boolean {
  if (announcement.signer !== organiser) return false;
  if (announcement.eventId !== eventId) return false;
  if (announcement.networkPassphrase !== NETWORK.networkPassphrase) return false;
  if (announcement.eventRegistry !== CONTRACTS.eventRegistry) return false;
  try {
    return verifyAnnouncement({
      networkPassphrase: announcement.networkPassphrase,
      eventRegistry: announcement.eventRegistry,
      eventId: announcement.eventId,
      publishedAt: announcement.publishedAt,
      body: announcement.body,
      signer: announcement.signer,
      signature: announcement.signature,
    }).valid;
  } catch {
    return false;
  }
}
