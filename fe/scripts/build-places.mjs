/**
 * Generates src/data/places.json from the Countries States Cities Database.
 *
 * Run by hand, not on install:
 *
 *     node scripts/build-places.mjs
 *
 * ## Why the data is committed rather than fetched at runtime
 *
 * A form field that depends on somebody else's uptime is a form field that
 * cannot be filled in on their bad day, and the organiser would read that as
 * our bug. The free tiers of the hosted versions of this data are also far too
 * small for a cascading select: three requests per form fill against a hundred
 * a day is about thirty organisers before the selects go empty.
 *
 * The third reason is the one that settles it. These names are written into the
 * event document, which is hashed and can never be edited. We want to know
 * exactly which version of the data produced them, and a committed file can be
 * audited later while last Tuesday's API response cannot.
 *
 * ## Licence
 *
 * ODbL v1.0. Commercial use and redistribution are allowed; attribution is
 * required and derivatives keep the licence. The attribution travels inside the
 * generated file and is shown in the app, so it cannot be lost in a refactor.
 *
 * ## What is kept, and what is dropped
 *
 * Everything except names and the ids needed to link them. The source carries
 * currencies, timezones, translations and emoji flags, none of which a race
 * organiser is choosing between, and all of which would be shipped to every
 * visitor.
 *
 * Cities are kept for Indonesia only. Worldwide cities are a 46 MB file, the
 * pilot is Indonesian, and a city select that covers one country honestly beats
 * one that half-covers every country. Elsewhere the city is typed.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json";
const ATTRIBUTION =
  "Data by Countries States Cities Database " +
  "https://github.com/dr5hn/countries-states-cities-database | ODbL v1.0";

/** The one country whose cities ship. Everything else types its city. */
const CITIES_FOR = "ID";

async function get(file) {
  process.stdout.write(`fetching ${file} ... `);
  const response = await fetch(`${BASE}/${file}`);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  const text = await response.text();
  console.log(`${(text.length / 1_000_000).toFixed(1)} MB`);
  return JSON.parse(text);
}

// countries+states.json is the small file, but its states are bare strings with
// no ids, so a city could never be attached to one. These two carry the ids.
const rawCountries = await get("countries.json");
const rawStates = await get("states.json");

const countries = rawCountries
  .map((country) => ({ iso2: country.iso2, name: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const states = {};
for (const state of rawStates) {
  (states[state.country_code] ??= []).push({ id: state.id, name: state.name });
}
for (const list of Object.values(states)) list.sort((a, b) => a.name.localeCompare(b.name));

// Cities come from the combined file, which is the only one linking a city to
// its state. Downloaded here and never shipped.
const all = await get("countries+states+cities.json");
const target = all.find((country) => country.iso2 === CITIES_FOR);
if (!target) throw new Error(`${CITIES_FOR} is not in the dataset`);

const cities = {};
for (const state of target.states ?? []) {
  const list = (state.cities ?? [])
    .map((city) => city.name)
    .sort((a, b) => a.localeCompare(b));
  if (list.length > 0) cities[state.id] = list;
}

const output = {
  attribution: ATTRIBUTION,
  generatedAt: new Date().toISOString().slice(0, 10),
  citiesFor: CITIES_FOR,
  countries,
  states,
  cities,
};

const path = join(import.meta.dirname, "..", "src", "data", "places.json");
writeFileSync(path, `${JSON.stringify(output)}\n`, "utf8");

const kb = (JSON.stringify(output).length / 1024).toFixed(0);
console.log(
  `wrote ${path}: ${countries.length} countries, ` +
    `${Object.values(states).flat().length} states, ` +
    `${Object.values(cities).flat().length} cities in ${CITIES_FOR}, ${kb} KB`,
);
