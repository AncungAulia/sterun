/**
 * Generates src/data/places.json and public/places/<ISO2>.json from the
 * Countries States Cities Database.
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
 * ## Why cities are one file per country
 *
 * Cities used to ship for Indonesia alone, because the source's combined file
 * is 46 MB. But almost all of that 46 MB is coordinates, timezones and wikidata
 * ids. The names alone, for every country on earth, are 2.1 MB: 152,970 cities
 * across 223 countries, and the largest single country (the United States) is
 * 205 KB.
 *
 * So the cities go in neither the bundle nor one file. Each country is written
 * to `public/places/<ISO2>.json` and fetched only when somebody picks that
 * country. One organiser filling in one form downloads one file, typically
 * about 10 KB, and an organiser in Guangdong gets a list of cities rather than
 * a text box and a shrug.
 *
 * `places.json` keeps the countries and the provinces, since both are needed
 * before anything can be picked, and adds `hasCities` so the form knows whether
 * a fetch is worth making before it makes one.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json";
const ATTRIBUTION =
  "Data by Countries States Cities Database " +
  "https://github.com/dr5hn/countries-states-cities-database | ODbL v1.0";

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
// its state. Downloaded here, stripped to names, never shipped whole.
const all = await get("countries+states+cities.json");

const citiesDir = join(import.meta.dirname, "..", "public", "places");
// Emptied first. A country dropped upstream would otherwise leave a stale file
// behind that `hasCities` no longer lists but the server still serves.
rmSync(citiesDir, { recursive: true, force: true });
mkdirSync(citiesDir, { recursive: true });

const hasCities = [];
let cityCount = 0;
let cityBytes = 0;
let largest = { iso2: "", bytes: 0 };

for (const country of all) {
  const byProvince = {};
  let count = 0;
  for (const state of country.states ?? []) {
    const list = (state.cities ?? [])
      .map((city) => city.name)
      .sort((a, b) => a.localeCompare(b));
    if (list.length > 0) {
      byProvince[state.id] = list;
      count += list.length;
    }
  }
  if (count === 0) continue;

  const json = `${JSON.stringify(byProvince)}\n`;
  writeFileSync(join(citiesDir, `${country.iso2}.json`), json, "utf8");
  hasCities.push(country.iso2);
  cityCount += count;
  cityBytes += json.length;
  if (json.length > largest.bytes) largest = { iso2: country.iso2, bytes: json.length };
}

hasCities.sort();

const output = {
  attribution: ATTRIBUTION,
  generatedAt: new Date().toISOString().slice(0, 10),
  countries,
  states,
  hasCities,
};

const path = join(import.meta.dirname, "..", "src", "data", "places.json");
writeFileSync(path, `${JSON.stringify(output)}\n`, "utf8");

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `wrote ${path}: ${countries.length} countries, ` +
    `${Object.values(states).flat().length} states, ${kb(JSON.stringify(output).length)}`,
);
console.log(
  `wrote ${citiesDir}: ${hasCities.length} files, ` +
    `${cityCount.toLocaleString()} cities, ${(cityBytes / 1e6).toFixed(1)} MB total, ` +
    `largest ${largest.iso2} at ${kb(largest.bytes)}`,
);
