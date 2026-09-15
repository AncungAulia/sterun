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
 * Where the two numbers came from, which is not a detail: `view` is the only
 * one that can be tens of metres out, and the wizard says so while the link is
 * still being pasted (`StepDetails.tsx`, `PinHint`).
 */
export type CoordinateSource = "place" | "explicit" | "pair" | "view";

export interface ParsedCoordinates {
  coordinates: Coordinates;
  source: CoordinateSource;
}

/**
 * `-90..90` and `-180..180`. Worth checking rather than trusting, because the
 * common mistake is a swapped pair, and a latitude of 106 is the only visible
 * symptom of it.
 */
function inRange({ lat, lng }: Coordinates): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Some share sheets and some chat apps hand over the `data=` part percent
 * encoded, so the place pin arrives as `%213d...%214d...` and matches nothing.
 * Decoding first is what stops such a link degrading silently to `@`. A stray
 * `%` that is not an escape makes `decodeURIComponent` throw, and then the link
 * is read exactly as it was pasted.
 */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Tried in this order, and the order is the whole point.
 *
 * A Google Maps place URL carries two different pairs of numbers, and they are
 * not the same place. The pair after `@` is the centre of the map *view*: it
 * moves with every pan and every zoom step, so it says where the organiser was
 * looking, not what they pinned. The place's own coordinates sit in the `data=`
 * part as `!3d<lat>!4d<lng>`, usually inside an `!8m2!3d...!4d...` group.
 *
 * Reading `@` first is what put "Fakultas Teknik UGM" about 40 m away on a spot
 * with no name. So `@` is now the last thing tried, kept only because a link
 * that carries nothing better still deserves a rough answer, and because an
 * event document is frozen: a start that is 40 m out is permanent, but a start
 * that is missing entirely blocks the wizard.
 *
 * A pair that fails the range check does not end the search, it is skipped: a
 * place pin whose numbers are reversed degrades to the next pattern, which for
 * a full place URL is the `@` view, rather than refusing the link outright.
 */
const PATTERNS: { source: CoordinateSource; pattern: RegExp }[] = [
  // The pinned place, inside the `!8m2` group that Google writes around it.
  // https://www.google.com/maps/place/Name/@-7.7656,110.3718,17z/data=...!8m2!3d-7.76539!4d110.37254!16s...
  { source: "place", pattern: /!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/ },
  // The same pair without the group, for the URL shapes that omit it.
  { source: "place", pattern: /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/ },
  // An explicit coordinate somebody put in the link themselves.
  // https://maps.google.com/?q=-6.2185,106.8026  (also ?ll= and ?daddr=)
  { source: "explicit", pattern: /[?&](?:q|ll|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/ },
  // Pasted on their own, which is what a phone's share sheet often gives.
  { source: "pair", pattern: /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/ },
  // Last: the centre of the map view. See the note above.
  // https://www.google.com/maps/place/Name/@-6.2185,106.8026,17z/...
  { source: "view", pattern: /@(-?\d+\.\d+),(-?\d+\.\d+)/ },
];

/**
 * The pin in a pasted link plus where it was read from, or null if there is
 * not one.
 *
 * A shortened link (`maps.app.goo.gl/...`) carries no coordinates until it is
 * followed, and following it from the browser is a cross origin request Google
 * refuses. Returning null is honest: the field asks for the long link.
 */
export function parsePin(input: string): ParsedCoordinates | null {
  const text = decoded(input.trim());
  if (!text.trim()) return null;

  for (const { source, pattern } of PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const coordinates = { lat: Number(match[1]), lng: Number(match[2]) };
    if (Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng) && inRange(coordinates)) {
      return { coordinates, source };
    }
  }
  return null;
}

/** The two numbers on their own, for everything that does not care where they came from. */
export function parseCoordinates(input: string): Coordinates | null {
  return parsePin(input)?.coordinates ?? null;
}

/** A plain maps URL, buildable by anybody from the two numbers. */
export function mapsLink({ lat, lng }: Coordinates): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Mean Earth radius, the usual sphere the haversine formula assumes. */
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * How far apart two points are, in kilometres, over a sphere.
 *
 * Used to order the directory once a visitor has let the browser hand over
 * their position. A sphere is the right amount of precision here: the real
 * Earth is an ellipsoid and Vincenty's formula would answer to the millimetre,
 * but the question being asked is "which race is nearer", and the rounding
 * error of a sphere is about 0.5%, far below the error in a venue pin typed
 * into an event document.
 *
 * The formula wraps across the antimeridian on its own, with no special case:
 * only the sine of half the longitude difference appears, and that is periodic,
 * so 179.9E to 179.9W comes out as the 22 km it is rather than most of a lap.
 * The `Math.min(1, ...)` guards the other end, where two points that are the
 * same place can push the square root a hair above 1 through floating point and
 * make `asin` return NaN.
 */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const chord =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(chord)));
}
