/**
 * STE-13 — the off-chain event document, and proof it has not been swapped.
 *
 * `EventData` on chain carries both `uri` and `metadata_hash`. That pairing is
 * what lets an event page show a poster, a location and a schedule without
 * asking anyone to trust the server that served them: the document is fetched,
 * its bytes are hashed, and the hash is compared against the one the organiser
 * committed to when the event was created. A document that fails that check is
 * not rendered at all. Showing it with a warning would still put unverifiable
 * claims on the page that exists to make claims verifiable.
 *
 * ## The hash covers the exact bytes served
 *
 * `metadata_hash = sha256(the bytes at uri)`. No canonicalisation, no
 * re-serialisation, no key ordering rule. Anyone can check it with `curl` and
 * `sha256sum`, and there is no second implementation of a canonical form to
 * disagree with. The cost is real and worth stating: re-uploading the same
 * document with different whitespace breaks the check, and since events are
 * frozen (WEB_APP_IA.md §2.2) that cannot be repaired. STE-17 writes documents
 * under exactly this rule, which is why the convention is settled here.
 *
 * `crypto.subtle` needs a secure context: HTTPS or localhost. Both deployments
 * qualify, and a page served over plain HTTP has larger problems than a poster.
 */

/** The parts of the document this app reads. Everything is optional. */
export interface EventMetadata {
  posterUrl?: string;
  location?: { name?: string; lat?: number; lng?: number };
  description?: string;
  waiverUrl?: string;
  /** ISO 8601 from the `race_day` schedule entry, if the document has one. */
  gunStart?: string;
  schedule?: MetadataPhase[];
}

export interface MetadataPhase {
  phase?: string;
  startsAt?: string;
  endsAt?: string;
  gunStart?: string;
  cutOff?: string;
  venue?: string;
}

export type MetadataResult =
  | { status: "verified"; document: EventMetadata }
  /** Fetched and hashed, but the bytes are not the ones committed to. */
  | { status: "modified"; expectedHash: string; actualHash: string }
  /** Never got a document to check: no uri, network failure, or not JSON. */
  | { status: "unavailable"; reason: string };

export async function fetchEventMetadata(
  uri: string,
  expectedHash: string,
): Promise<MetadataResult> {
  if (!uri) return { status: "unavailable", reason: "This event has no metadata document." };

  let body: string;
  try {
    const response = await fetch(uri);
    if (!response.ok) {
      return { status: "unavailable", reason: `The metadata document returned ${response.status}.` };
    }
    body = await response.text();
  } catch {
    // The message is deliberately not the browser's. A failed cross-origin
    // fetch reports "Failed to fetch" whether the host is down, the domain
    // never resolved, or CORS blocked it, and repeating that tells nobody
    // anything.
    return { status: "unavailable", reason: "The metadata document could not be reached." };
  }

  const actualHash = await sha256Hex(body);
  if (actualHash !== expectedHash.toLowerCase()) {
    return { status: "modified", expectedHash: expectedHash.toLowerCase(), actualHash };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { status: "unavailable", reason: "The metadata document is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { status: "unavailable", reason: "The metadata document is not an object." };
  }

  return { status: "verified", document: parseDocument(raw as Record<string, unknown>) };
}

/**
 * Does the document contradict the chain about when the race starts?
 *
 * `starts_at` on chain and `gun_start` in the document are two records of one
 * fact, written at the same moment by the same person, so a disagreement means
 * one of them is wrong. The page cannot tell which, so it says both and lets
 * the reader decide rather than silently preferring one.
 *
 * A missing or unparseable `gun_start` is not a conflict. There is nothing to
 * disagree with, and the chain value is the one being displayed anyway.
 */
export function gunStartConflict(document: Pick<EventMetadata, "gunStart">, startsAt: bigint): boolean {
  if (!document.gunStart) return false;
  const parsed = Date.parse(document.gunStart);
  if (Number.isNaN(parsed)) return false;
  return BigInt(Math.floor(parsed / 1000)) !== startsAt;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Read the fields this app uses, ignore everything else.
 *
 * Hand-written rather than a schema library: the document is already proven to
 * be the bytes the organiser committed to by the time this runs, so this is
 * shaping known-good data, not defending a trust boundary. Unknown keys are
 * kept out of the way on purpose, so a document carrying a field a later ticket
 * adds does not break this page.
 */
function parseDocument(raw: Record<string, unknown>): EventMetadata {
  const schedule = Array.isArray(raw.schedule)
    ? raw.schedule.filter(isRecord).map(parsePhase)
    : undefined;

  return {
    ...str(raw.poster_url, "posterUrl"),
    ...str(raw.description, "description"),
    ...str(raw.waiver_url, "waiverUrl"),
    ...(isRecord(raw.location) ? { location: parseLocation(raw.location) } : {}),
    ...(schedule ? { schedule } : {}),
    ...(schedule?.find((phase) => phase.gunStart)?.gunStart
      ? { gunStart: schedule.find((phase) => phase.gunStart)!.gunStart }
      : {}),
  };
}

function parsePhase(raw: Record<string, unknown>): MetadataPhase {
  return {
    ...str(raw.phase, "phase"),
    ...str(raw.starts_at, "startsAt"),
    ...str(raw.ends_at, "endsAt"),
    ...str(raw.gun_start, "gunStart"),
    ...str(raw.cut_off, "cutOff"),
    ...str(raw.venue, "venue"),
  };
}

function parseLocation(raw: Record<string, unknown>): NonNullable<EventMetadata["location"]> {
  return {
    ...str(raw.name, "name"),
    ...(typeof raw.lat === "number" ? { lat: raw.lat } : {}),
    ...(typeof raw.lng === "number" ? { lng: raw.lng } : {}),
  };
}

function str<K extends string>(value: unknown, key: K): Record<K, string> | Record<string, never> {
  return typeof value === "string" && value ? ({ [key]: value } as Record<K, string>) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
