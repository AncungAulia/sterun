/**
 * The place the visitor browses from, kept in this browser only. It decides
 * which races the directory lists first and hides none of them. No stored place
 * means all locations.
 *
 * There are two ways to have one, and they are a union rather than one record
 * with optional fields, because optional fields can disagree: a value carrying
 * both a province and a pair of coordinates has no single answer to "what does
 * the button say" or "what is the sort key", and nothing would stop it being
 * written. A discriminator makes the impossible state unrepresentable.
 *
 *   - `area`   a whole country, or one province of it, picked by hand.
 *   - `nearby` the coordinates the browser handed over, once the visitor
 *              allowed its own prompt (Revision 4 of the directory spec).
 *
 * Beside the place sits `asked`: whether the browser's location prompt has
 * already been shown once. It has to be stored, not derived, because a refusal
 * leaves no trace anywhere else, and re-asking on every visit is exactly the
 * behaviour browsers punish by blocking the prompt for good.
 *
 * Not an account setting: there are no accounts, and a province is not worth a
 * server round trip. localStorage can refuse (a private window, storage turned
 * off), so every access is guarded and the page simply works without a place.
 *
 * The country name is stored beside its code so the header can name the place
 * without loading the places dataset, which is 176 KB and only needed once the
 * visitor opens the picker. That is also why this file imports nothing at
 * runtime: the one import below is a type, and types are erased.
 */
import type { Coordinates } from "@/utils/geo";

/** A place named by hand: a whole country, or one province of it. */
export interface Area {
  mode: "area";
  /** ISO 3166-1 alpha-2, the same code event documents carry. */
  countryCode: string;
  country: string;
  /**
   * The province as the places dataset spells it, e.g. "DI Yogyakarta". Absent
   * for the whole country, never blank.
   */
  province?: string;
}

/**
 * Where the browser said the visitor is. Unnamed on purpose: turning these two
 * numbers into "DI Yogyakarta" needs a geocoding service, and this project uses
 * none, so the header says "Near you" instead of guessing.
 */
export interface Nearby extends Coordinates {
  mode: "nearby";
}

export type Place = Area | Nearby;

/** Everything this module keeps, which is the place and one flag. */
export interface StoredPlace {
  place: Place | null;
  /** Whether the browser's own location prompt has already been shown once. */
  asked: boolean;
}

export const AREA_STORAGE_KEY = "sterun.area";

/** A first visit: nothing chosen, nothing asked. One object, so it is stable. */
const NOTHING: StoredPlace = { place: null, asked: false };

function parsePlace(value: unknown): Place | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (raw.mode === "nearby") {
    const { lat, lng } = raw;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // A swapped pair is the common corruption, and a latitude of 106 is its
    // only visible symptom. Out of range is not read back.
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { mode: "nearby", lat, lng };
  }

  // An area, with or without its discriminator. A value stored before the
  // coordinates mode existed carries no `mode` at all, and a visitor who picked
  // a province on an earlier visit must not lose it over a refactor.
  if (raw.mode !== undefined && raw.mode !== "area") return null;
  const { countryCode, country, province } = raw;
  if (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (typeof country !== "string" || country.trim().length === 0) return null;
  const place: Area = { mode: "area", countryCode, country: country.trim() };
  // Missing or blank is the whole country. A province that is not text at all
  // was not written by this app, so the stored value is not trusted.
  if (province === undefined || province === null) return place;
  if (typeof province !== "string") return null;
  return province.trim() ? { ...place, province: province.trim() } : place;
}

/**
 * What is in storage, in either shape it can be in.
 *
 * The current shape is `{ place, asked }`. The shape before the prompt existed
 * was the area itself at the top level, and it is still read: an unreadable
 * value would silently throw away a province somebody chose, and there is no
 * migration step anywhere to run.
 */
export function parseStoredPlace(raw: string | null): StoredPlace {
  if (!raw) return NOTHING;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return NOTHING;
  }
  if (typeof value !== "object" || value === null) return NOTHING;
  const record = value as Record<string, unknown>;
  if ("place" in record || "asked" in record) {
    return { place: parsePlace(record.place), asked: record.asked === true };
  }
  return { place: parsePlace(record), asked: false };
}

/**
 * "DI Yogyakarta, Indonesia", "Indonesia", or "Near you".
 *
 * Coordinates get no name because naming them needs a geocoding service. "Near
 * you" is what the visitor already knows to be true, which is better than a
 * province guessed from a pin that may be across its border.
 */
export function placeLabel(place: Place): string {
  if (place.mode === "nearby") return "Near you";
  return place.province ? `${place.province}, ${place.country}` : place.country;
}

const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastStored: StoredPlace = NOTHING;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(AREA_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * What is stored. The same object until the stored text changes, because
 * `useSyncExternalStore` re-renders for ever on a snapshot that is new each call.
 */
export function readStoredPlace(): StoredPlace {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastStored = parseStoredPlace(raw);
  }
  return lastStored;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function write(next: StoredPlace): void {
  try {
    window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Refused. The page carries on without a place, as it does on a first visit.
  }
  notify();
}

/**
 * Keep a place, from the picker or from the browser's answer.
 *
 * It records that we asked even when nothing asked. Choosing by hand is an
 * answer to the same question, and a visitor who has just set a place and then
 * cleared it should not be met by the browser's prompt for their trouble.
 */
export function storePlace(place: Place): void {
  write({ place, asked: true });
}

/** Back to all locations, without forgetting that the prompt has been shown. */
export function clearStoredPlace(): void {
  const { asked } = readStoredPlace();
  if (asked) {
    write({ place: null, asked: true });
    return;
  }
  try {
    window.localStorage.removeItem(AREA_STORAGE_KEY);
  } catch {
    // Nothing was stored to begin with.
  }
  notify();
}

/**
 * Record that the browser's prompt has been shown, before it is answered.
 *
 * Before, rather than after, because three of the four outcomes are silent: a
 * dismissed prompt calls neither callback, so a flag written in the error path
 * would leave the prompt firing on every visit.
 */
export function markAsked(): void {
  const { place, asked } = readStoredPlace();
  if (asked) return;
  write({ place, asked: true });
}

/** Changes from this tab, and from other tabs through the storage event. */
export function subscribePlace(listener: () => void): () => void {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === AREA_STORAGE_KEY) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
