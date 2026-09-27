/**
 * Signed event announcements (STE-40): build the exact message an organiser
 * signs, and verify one without trusting any server.
 *
 * An event document is frozen by its hash, so a change after publishing
 * (a moved venue, an extended registration, a raised quota) is announced beside
 * it. The backend stores and serves announcements, but it is a convenience, not
 * the source of truth: the signature plus the organiser address on chain are
 * enough to check one.
 *
 * ```ts
 * import { announcementMessage, verifyAnnouncement, TESTNET } from "@sterunxyz/sdk";
 *
 * const message = announcementMessage({
 *   networkPassphrase: TESTNET.networkPassphrase,
 *   eventRegistry,
 *   eventId: 17,
 *   publishedAt: new Date().toISOString(),
 *   body: "Start moved to Lapangan Banteng. Schedule unchanged.",
 * });
 * // a wallet signs `message` with signMessage (SEP-53) ...
 *
 * // ... and anyone checks it, using the organiser the chain names:
 * const { organiser } = await sterun.getEvent(17);
 * const result = verifyAnnouncement({ ...fields, signer: organiser, signature });
 * ```
 *
 * Browser-safe: the hash comes from `@stellar/stellar-sdk`, not `node:crypto`.
 * The format is pinned by `schema/announcement-v1.vectors.json`, which the
 * backend is tested against too.
 */
import { Keypair, hash } from "@stellar/stellar-sdk";

export const ANNOUNCEMENT_HEADER = "Sterun announcement v1";

export type AnnouncementSignatureScheme = "ed25519" | "sep53";

export interface AnnouncementFields {
  networkPassphrase: string;
  /** The EventRegistry contract id (`C…`) the event lives in. */
  eventRegistry: string;
  eventId: number;
  /** UTC, exactly `YYYY-MM-DDTHH:MM:SS.sssZ` — what `Date.prototype.toISOString` produces. */
  publishedAt: string;
  body: string;
}

const PUBLISHED_AT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

/** sha256 of the UTF-8 body, lowercase hex. */
export function announcementBodySha256(body: string): string {
  // Wrapped in Buffer.from: `hash` is typed as a Uint8Array, and
  // Uint8Array.toString IGNORES its "hex" argument, producing "12,34,..." and
  // so a message no wallet signature would ever match. The vectors caught it.
  return Buffer.from(hash(Buffer.from(body, "utf8"))).toString("hex");
}

/** The exact text an organiser signs. Throws on a `publishedAt` in any other spelling. */
export function announcementMessage(fields: AnnouncementFields): string {
  if (!PUBLISHED_AT.test(fields.publishedAt)) {
    throw new TypeError(
      `publishedAt must be UTC in the form YYYY-MM-DDTHH:MM:SS.sssZ (new Date().toISOString()), got ${JSON.stringify(fields.publishedAt)}`,
    );
  }
  if (!Number.isInteger(fields.eventId) || fields.eventId < 0) {
    throw new TypeError(`eventId must be a non-negative integer, got ${fields.eventId}`);
  }
  return [
    ANNOUNCEMENT_HEADER,
    `network: ${fields.networkPassphrase}`,
    `event_registry: ${fields.eventRegistry}`,
    `event_id: ${fields.eventId}`,
    `published_at: ${fields.publishedAt}`,
    `body_sha256: ${announcementBodySha256(fields.body)}`,
  ].join("\n");
}

/**
 * Check an announcement's signature against a signer address.
 *
 * This proves the signer wrote it. Whether the signer **is the organiser** is a
 * separate question the chain answers (`getEvent(eventId).organiser`); a valid
 * signature from anyone else means nothing.
 */
export function verifyAnnouncement(
  announcement: AnnouncementFields & { signer: string; signature: string },
): { valid: true; scheme: AnnouncementSignatureScheme } | { valid: false } {
  let message: string;
  try {
    message = announcementMessage(announcement);
  } catch {
    return { valid: false };
  }
  const signature = Buffer.from(announcement.signature, "base64");
  if (signature.length !== 64) return { valid: false };
  try {
    const key = Keypair.fromPublicKey(announcement.signer);
    if (key.verify(Buffer.from(message, "utf8"), signature)) return { valid: true, scheme: "ed25519" };
    if (key.verifyMessage(message, signature)) return { valid: true, scheme: "sep53" };
  } catch {
    return { valid: false };
  }
  return { valid: false };
}
