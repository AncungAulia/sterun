/**
 * STE-17 — coordinates, taken from what an organiser already has.
 *
 * The alternative designs were worse. A country/province/city cascade is three
 * dropdowns that nobody can answer faster than they can drop a pin, and it does
 * not produce the one thing a runner actually wants, which is a map they can
 * open. A geocoding API (Nominatim is free and keyless) adds a network
 * dependency, a rate limit and an attribution requirement to a form field.
 *
 * So: paste the Google Maps link you already have open, and the coordinates
 * come out of the URL. No key, no request, no quota, and the same two numbers
 * go into the event document as `lat` and `lng` (WEB_APP_IA.md §6).
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * `-90..90` and `-180..180`. Worth checking rather than trusting, because the
 * common mistake is a swapped pair, and a latitude of 106 is the only visible
 * symptom of it.
 */
function inRange({ lat, lng }: Coordinates): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

const PATTERNS = [
  // https://www.google.com/maps/place/Name/@-6.2185,106.8026,17z/...
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  // https://maps.google.com/?q=-6.2185,106.8026  (also ?ll= and ?daddr=)
  /[?&](?:q|ll|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  // Pasted on their own, which is what a phone's share sheet often gives.
  /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/,
];

/**
 * The pin in a pasted link, or null if there is not one.
 *
 * A shortened link (`maps.app.goo.gl/...`) carries no coordinates until it is
 * followed, and following it from the browser is a cross origin request Google
 * refuses. Returning null is honest: the field asks for the long link.
 */
export function parseCoordinates(input: string): Coordinates | null {
  const text = input.trim();
  if (!text) return null;

  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const coordinates = { lat: Number(match[1]), lng: Number(match[2]) };
    if (Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng) && inRange(coordinates)) {
      return coordinates;
    }
  }
  return null;
}

/** A plain maps URL, buildable by anybody from the two numbers. */
export function mapsLink({ lat, lng }: Coordinates): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
