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
  location?: {
    name?: string;
    city?: string;
    province?: string;
    country?: string;
    countryCode?: string;
    lat?: number;
    lng?: number;
  };
  description?: string;
  waiverUrl?: string;
  /** Where the race talks to people. Covered by the hash like everything else. */
  links?: { instagram?: string; website?: string };
  /** ISO 8601 from the `race_day` schedule entry, if the document has one. */
  gunStart?: string;
  schedule?: MetadataPhase[];
  /** What each distance includes: jersey, medal, whatever is in the pack. */
  addOns?: MetadataAddOn[];
  /**
   * The rules a runner agreed to, as plain text with its line breaks intact.
   *
   * Inside the document rather than on a page the organiser hosts, which is
   * the point: the hash on chain covers it, so these are provably the rules
   * that were published, not the ones being served today.
   */
  terms?: string;
  /**
   * When each distance goes, which the contract has no field for. A 5K and a
   * half marathon on one morning do not start together, and `starts_at` on
   * chain is only the first of them.
   */
  categories?: MetadataCategory[];
}

export interface MetadataCategory {
  code: string;
  /** ISO 8601. */
  startTime?: string;
  cutOff?: string;
}

export interface MetadataAddOn {
  name: string;
  photoUrl?: string;
  /** Distance codes that receive this one. */
  includedIn: string[];
  /**
   * The `AddOnData` row this is, when the item has no sizes.
   *
   * The join to the chain, where the price and the stock live. Absent on an
   * older document, and on anything sized: a size carries its own.
   */
  code?: string;
  /** Flat measurements, absent on anything without sizes. */
  sizes?: { label: string; chestCm?: number; lengthCm?: number; code?: string }[];
}

export interface MetadataPhase {
  phase?: string;
  startsAt?: string;
  endsAt?: string;
  gunStart?: string;
  cutOff?: string;
  venue?: string;
  /** Where that venue is, when the organiser pasted a link with a pin in it. */
  venueLat?: number;
  venueLng?: number;
  /** `HH:mm` opening hours that apply to each day of the phase. */
  dailyOpens?: string;
  dailyCloses?: string;
}

export type MetadataResult =
  | { status: "verified"; document: EventMetadata }
  /** Fetched and hashed, but the bytes are not the ones committed to. */
  | { status: "modified"; expectedHash: string; actualHash: string }
  /** Never got a document to check: no uri, network failure, or not JSON. */
  | { status: "unavailable"; reason: string };

/**
 * How long a document host gets to answer before the page stops waiting.
 *
 * Without a deadline, a host that accepts the connection and never replies
 * leaves the read pending for as long as the browser cares to wait. On the
 * directory that holds back every section that needs all documents in hand.
 * Eight seconds is well past a slow mobile response and short of someone
 * giving up on the page.
 */
export const METADATA_TIMEOUT_MS = 8_000;

export async function fetchEventMetadata(
  uri: string,
  expectedHash: string,
): Promise<MetadataResult> {
  if (!uri) return { status: "unavailable", reason: "This event has no metadata document." };

  let body: string;
  try {
    const response = await fetch(uri, { signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
    if (!response.ok) {
      return { status: "unavailable", reason: `The metadata document returned ${response.status}.` };
    }
    body = await response.text();
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error && error.name === "TimeoutError") {
      return { status: "unavailable", reason: "The metadata document took too long to answer." };
    }
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

  const document = readEventDocument(body);
  if (document === "not-json") {
    return { status: "unavailable", reason: "The metadata document is not valid JSON." };
  }
  if (document === "not-object") {
    return { status: "unavailable", reason: "The metadata document is not an object." };
  }

  return { status: "verified", document };
}

/**
 * The document text as the event page reads it, without the fetch or the hash.
 *
 * Exported for the organiser's review, which previews a race before its file
 * exists anywhere. Reading the draft through this same parser is what makes the
 * preview honest: a field the page would ignore is ignored there too, so the
 * organiser sees what runners will see rather than what the form collected.
 */
export function readEventDocument(text: string): EventMetadata | "not-json" | "not-object" {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "not-json";
  }
  if (!isRecord(raw)) return "not-object";
  return parseDocument(raw);
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
  const addOns = parseAddOns(raw.add_ons);
  const categories = parseCategories(raw.categories);

  return {
    ...str(raw.poster_url, "posterUrl"),
    ...str(raw.description, "description"),
    ...str(raw.terms, "terms"),
    ...str(raw.waiver_url, "waiverUrl"),
    ...(isRecord(raw.location) ? { location: parseLocation(raw.location) } : {}),
    ...(schedule ? { schedule } : {}),
    ...(isRecord(raw.links) ? { links: parseLinks(raw.links) } : {}),
    ...(schedule?.find((phase) => phase.gunStart)?.gunStart
      ? { gunStart: schedule.find((phase) => phase.gunStart)!.gunStart }
      : {}),
    ...(addOns && addOns.length > 0 ? { addOns } : {}),
    ...(categories.length > 0 ? { categories } : {}),
  };
}

/** A distance is only worth keeping with a code, since the code is the join to the chain. */
function parseCategories(raw: unknown): MetadataCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).flatMap((entry): MetadataCategory[] => {
    const code = typeof entry.code === "string" ? entry.code.trim() : "";
    if (!code) return [];
    return [{ code, ...str(entry.start_time, "startTime"), ...str(entry.cut_off, "cutOff") }];
  });
}

/**
 * An add-on is only shown when it has a name and at least one distance that
 * receives it. Anything else is a row somebody abandoned, and this file is
 * permanent: it will still be there on race day.
 */
function parseAddOns(raw: unknown): MetadataAddOn[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const addOns = raw.filter(isRecord).flatMap((entry): MetadataAddOn[] => {
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const includedIn = Array.isArray(entry.included_in)
      ? entry.included_in.filter((code): code is string => typeof code === "string")
      : [];
    if (!name || includedIn.length === 0) return [];
    const sizes = Array.isArray(entry.sizes)
      ? entry.sizes.filter(isRecord).flatMap((size): NonNullable<MetadataAddOn["sizes"]> => {
          const label = typeof size.label === "string" ? size.label.trim() : "";
          if (!label) return [];
          return [
            {
              label,
              ...(typeof size.chest_cm === "number" ? { chestCm: size.chest_cm } : {}),
              ...(typeof size.length_cm === "number" ? { lengthCm: size.length_cm } : {}),
              ...str(size.code, "code"),
            },
          ];
        })
      : [];
    return [
      {
        name,
        includedIn,
        ...str(entry.photo_url, "photoUrl"),
        ...str(entry.code, "code"),
        ...(sizes.length > 0 ? { sizes } : {}),
      },
    ];
  });
  return addOns.length > 0 ? addOns : undefined;
}

function parsePhase(raw: Record<string, unknown>): MetadataPhase {
  return {
    ...str(raw.phase, "phase"),
    ...str(raw.starts_at, "startsAt"),
    ...str(raw.ends_at, "endsAt"),
    ...str(raw.gun_start, "gunStart"),
    ...str(raw.cut_off, "cutOff"),
    ...str(raw.venue, "venue"),
    ...(typeof raw.venue_lat === "number" ? { venueLat: raw.venue_lat } : {}),
    ...(typeof raw.venue_lng === "number" ? { venueLng: raw.venue_lng } : {}),
    ...str(raw.daily_opens, "dailyOpens"),
    ...str(raw.daily_closes, "dailyCloses"),
  };
}

function parseLinks(raw: Record<string, unknown>): NonNullable<EventMetadata["links"]> {
  return {
    ...str(raw.instagram, "instagram"),
    ...str(raw.website, "website"),
  };
}

function parseLocation(raw: Record<string, unknown>): NonNullable<EventMetadata["location"]> {
  return {
    ...str(raw.name, "name"),
    ...str(raw.city, "city"),
    ...str(raw.province, "province"),
    ...str(raw.country, "country"),
    ...str(raw.country_code, "countryCode"),
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
