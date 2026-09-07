"use client";

/**
 * Where a race happens: a venue you type, and a country, province and city you
 * pick from a searchable list.
 *
 * ## Why lists and not free text
 *
 * "Jakarta", "DKI Jakarta", "Jkt" and "jakarta" are one place typed four ways,
 * and a directory that groups races by region cannot group those. Choosing from
 * a list makes the value comparable, which is the whole reason to ask for it
 * separately from the venue.
 *
 * ## Why the city falls back to typing
 *
 * The committed dataset carries cities for one country. Rather than showing an
 * empty list everywhere else, the field becomes a text input, which is honest
 * about what we have and still lets anybody enter a race.
 *
 * ## What this is not for
 *
 * Finding races near you. That is the coordinates from the maps link and a
 * distance calculation, which is exact, free and needs no list of names. These
 * are for reading, and for filtering by region.
 */
import { Field } from "@/components/elements/Field";
import { SearchableSelect } from "@/components/elements/SearchableSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { citiesOf, countries, hasCities, provincesOf } from "@/lib/places";

export interface Place {
  venue: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Dataset id where there is a list, otherwise the typed name. */
  provinceId: string;
  city: string;
}

export const EMPTY_PLACE: Place = { venue: "", country: "ID", provinceId: "", city: "" };

interface PlaceFieldsProps {
  place: Place;
  onChange: (place: Place) => void;
}

export function PlaceFields({ place, onChange }: PlaceFieldsProps) {
  const provinces = provincesOf(place.country);
  const cities = citiesOf(place.provinceId ? Number(place.provinceId) : null);
  const cityIsAList = hasCities(place.country) && cities.length > 0;

  return (
    <>
      <Field
        id="venue"
        label="Venue"
        value={place.venue}
        onChange={(e) => onChange({ ...place, venue: e.target.value })}
        placeholder="Gelora Bung Karno"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country">Country</Label>
          <SearchableSelect
            id="country"
            ariaLabel="Country"
            options={countries.map((country) => ({ value: country.iso2, label: country.name }))}
            value={place.country}
            // Changing the country invalidates both, because a province id
            // belongs to one country and a city name to one province.
            onChange={(country) => onChange({ ...place, country, provinceId: "", city: "" })}
            placeholder="Search countries"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="province">Province</Label>
          {provinces.length > 0 ? (
            <SearchableSelect
              id="province"
              ariaLabel="Province"
              options={provinces.map((province) => ({
                value: String(province.id),
                label: province.name,
              }))}
              value={place.provinceId}
              onChange={(provinceId) => onChange({ ...place, provinceId, city: "" })}
              placeholder="Search provinces"
            />
          ) : (
            <Input
              id="province"
              aria-label="Province"
              value={place.provinceId}
              onChange={(e) => onChange({ ...place, provinceId: e.target.value })}
              placeholder="Province or state"
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city">City</Label>
          {cityIsAList ? (
            <SearchableSelect
              id="city"
              ariaLabel="City"
              options={cities.map((city) => ({ value: city, label: city }))}
              value={place.city}
              onChange={(city) => onChange({ ...place, city })}
              placeholder="Search cities"
            />
          ) : (
            <Input
              id="city"
              aria-label="City"
              value={place.city}
              onChange={(e) => onChange({ ...place, city: e.target.value })}
              placeholder={
                hasCities(place.country) ? "Pick a province first" : "City"
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
