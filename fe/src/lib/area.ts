/**
 * The visitor's chosen area, kept in this browser only.
 *
 * Not an account setting: there are no accounts, and a province is not worth a
 * server round trip. localStorage can refuse (a private window, storage turned
 * off), so every access is guarded and the page simply works without an area.
 *
 * The country name is stored beside its code so the header can name the area
 * without loading the places dataset, which is 176 KB and only needed once the
 * visitor opens the picker.
 */
export interface Area {
  /** ISO 3166-1 alpha-2, the same code event documents carry. */
  countryCode: string;
  country: string;
  /** The province as the places dataset spells it, e.g. "DI Yogyakarta". */
  province: string;
}

export const AREA_STORAGE_KEY = "sterun.area";

export function parseArea(raw: string | null): Area | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { countryCode, country, province } = value as Record<string, unknown>;
  if (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (typeof country !== "string" || country.trim().length === 0) return null;
  if (typeof province !== "string" || province.trim().length === 0) return null;
  return { countryCode, country: country.trim(), province: province.trim() };
}

const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastArea: Area | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(AREA_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The stored area. The same object until the stored text changes, because
 * `useSyncExternalStore` re-renders for ever on a snapshot that is new each call.
 */
export function readArea(): Area | null {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastArea = parseArea(raw);
  }
  return lastArea;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function storeArea(area: Area): void {
  try {
    window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(area));
  } catch {
    // Refused. The page carries on without an area, as it does on a first visit.
  }
  notify();
}

export function clearStoredArea(): void {
  try {
    window.localStorage.removeItem(AREA_STORAGE_KEY);
  } catch {
    // Nothing was stored to begin with.
  }
  notify();
}

/** Changes from this tab, and from other tabs through the storage event. */
export function subscribeArea(listener: () => void): () => void {
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
