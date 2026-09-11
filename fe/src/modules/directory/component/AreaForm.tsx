"use client";

/**
 * The country and province behind "Races in your area".
 *
 * Indonesia is preselected, unlike the organiser's place fields, which start
 * empty (PlaceFields). That form writes a frozen document, where a wrong
 * prefilled country would be permanent. This is a browsing preference for a
 * pilot run in Indonesia, and changing it takes one tap.
 */
import { useState } from "react";

import { SearchableSelect } from "@/components/elements/SearchableSelect";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Area } from "@/lib/area";
import { countries, countryName, provincesOf } from "@/lib/places";

const DEFAULT_COUNTRY = "ID";

interface AreaFormProps {
  area: Area | null;
  onSave: (area: Area) => void;
  onClear: () => void;
}

export function AreaForm({ area, onSave, onClear }: AreaFormProps) {
  // The dialog unmounts its content when it closes, so this starts from the
  // saved area every time it opens.
  const [country, setCountry] = useState(area?.countryCode ?? DEFAULT_COUNTRY);
  const [province, setProvince] = useState(area?.province ?? "");
  // The dataset lists some provinces under two ids and one name (Indonesia's
  // Maluku and Papua among them). An area is stored by name, so those rows are
  // one choice here, and listing both would show the same name twice.
  const provinces = [...new Set(provincesOf(country).map((item) => item.name))];
  const ready = country.length > 0 && province.trim().length > 0;

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
              setCountry(next);
              setProvince("");
            }}
            placeholder="Select country"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="area-province">Province</Label>
          {provinces.length > 0 ? (
            <SearchableSelect
              id="area-province"
              ariaLabel="Province"
              options={provinces.map((name) => ({ value: name, label: name }))}
              value={province}
              onChange={setProvince}
              placeholder="Search provinces"
            />
          ) : (
            <Input
              id="area-province"
              aria-label="Province"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              placeholder="Type the province or state"
            />
          )}
        </div>
      </div>

      <DialogFooter>
        {area ? (
          <Button variant="ghost" onClick={onClear}>
            Clear area
          </Button>
        ) : null}
        <Button
          disabled={!ready}
          onClick={() =>
            onSave({ countryCode: country, country: countryName(country) ?? country, province: province.trim() })
          }
        >
          Save area
        </Button>
      </DialogFooter>
    </>
  );
}
