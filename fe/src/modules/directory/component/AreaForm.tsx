"use client";

/**
 * The country, and optionally the province, whose races the directory lists
 * before the rest.
 *
 * Indonesia is preselected, unlike the organiser's place fields, which start
 * empty (PlaceFields). That form writes a frozen document, where a wrong
 * prefilled country would be permanent. This is a browsing preference for a
 * pilot run in Indonesia, and changing it takes one tap.
 *
 * The whole country is the province list's first option, "All of Indonesia",
 * rather than a province left unpicked: an empty select reads as unfinished,
 * and a country on its own is a complete answer.
 */
import { useState } from "react";

import { SearchableSelect } from "@/components/elements/SearchableSelect";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Area, Place } from "@/lib/area";
import { countries, countryName, provincesOf } from "@/lib/places";

const DEFAULT_COUNTRY = "ID";

/**
 * The province value that means the whole country. Empty works as an option
 * value because SearchableSelect matches options by equality and has no
 * "nothing selected" value of its own, and no province name is ever blank.
 */
const WHOLE_COUNTRY = "";

interface AreaFormProps {
  place: Place | null;
  onSave: (area: Area) => void;
  onClear: () => void;
}

export function AreaForm({ place, onSave, onClear }: AreaFormProps) {
  // Coordinates name no country, so the form starts where it starts for
  // somebody with no place at all. Applying a country replaces them.
  const saved = place?.mode === "area" ? place : null;
  // The dialog unmounts its content when it closes, so this starts from the
  // saved place every time it opens.
  const [country, setCountry] = useState(saved?.countryCode ?? DEFAULT_COUNTRY);
  const [province, setProvince] = useState(saved?.province ?? WHOLE_COUNTRY);
  const name = countryName(country) ?? country;
  // The dataset lists some provinces under two ids and one name (Indonesia's
  // Maluku and Papua among them). A place is stored by name, so those rows are
  // one choice here, and listing both would show the same name twice.
  const provinces = [...new Set(provincesOf(country).map((item) => item.name))];

  function apply() {
    const chosen = province.trim();
    onSave(
      chosen
        ? { mode: "area", countryCode: country, country: name, province: chosen }
        : { mode: "area", countryCode: country, country: name },
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="area-country">Country</Label>
          <SearchableSelect
            id="area-country"
            ariaLabel="Country"
            options={countries.map((item) => ({ value: item.iso2, label: item.name }))}
            value={country}
            onChange={(next) => {
              // The select reports a choice even when it is the same country,
              // and that must not throw away the province picked under it.
              if (next === country) return;
              setCountry(next);
              setProvince(WHOLE_COUNTRY);
            }}
            placeholder="Select country"
            modal
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="area-province">Province</Label>
          {provinces.length > 0 ? (
            <SearchableSelect
              id="area-province"
              ariaLabel="Province"
              options={[
                { value: WHOLE_COUNTRY, label: `All of ${name}` },
                ...provinces.map((item) => ({ value: item, label: item })),
              ]}
              value={province}
              onChange={setProvince}
              placeholder="Search provinces"
              modal
            />
          ) : (
            // A country the dataset has no provinces for. Left blank, it is the
            // whole country, which the placeholder says in the list's own words.
            <Input
              id="area-province"
              aria-label="Province"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              placeholder={`All of ${name}`}
            />
          )}
        </div>
      </div>

      <DialogFooter>
        {/* The way back, from either mode: coordinates need it as much as a
            province does, since nothing else on the page turns them off. */}
        {place ? (
          <Button variant="ghost" onClick={onClear}>
            All locations
          </Button>
        ) : null}
        <Button disabled={country.length === 0} onClick={apply}>
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}
