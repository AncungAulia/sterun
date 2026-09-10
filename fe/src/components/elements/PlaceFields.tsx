"use client";

/**
 * Where a race happens: a country, province and city you pick from a searchable
 * list, and then a venue you type.
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
 * The cities of one country are fetched when that country is picked, because
 * every country's cities at once is 2.1 MB. Any way that fetch can come back
 * empty, a country with no file, a province the data covers no cities for, a
 * request that failed, ends in a text input rather than an empty dropdown. A
 * missing list should cost an organiser a convenience, never the form.
 *
 * ## What this is not for
 *
 * Finding races near you. That is the coordinates from the maps link and a
 * distance calculation, which is exact, free and needs no list of names. These
 * are for reading, and for filtering by region.
 */
import { Field, FieldMessage, LabelText } from "@/components/elements/Field";
import { SearchableSelect } from "@/components/elements/SearchableSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCities } from "@/hooks/useCities";
import { countries, hasCities, provincesOf } from "@/lib/places";

export interface Place {
  venue: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Dataset id where there is a list, otherwise the typed name. */
  provinceId: string;
  city: string;
}

/**
 * Country starts empty rather than at Indonesia. A prefilled country is a field
 * people scroll past, and the one it prefills is wrong for everybody else.
 */
export const EMPTY_PLACE: Place = { venue: "", country: "", provinceId: "", city: "" };

interface PlaceFieldsProps {
  place: Place;
  onChange: (place: Place) => void;
  required?: boolean;
  errors?: Record<string, string>;
}

export function PlaceFields({
  place,
  onChange,
  required = false,
  errors = {},
}: PlaceFieldsProps) {
  const provinces = provincesOf(place.country);
  const { data: cities, isPending } = useCities(place.country);
  const cityOptions = cities?.[place.provinceId] ?? [];
  /*
    The select is shown while the file is still coming as well as once it is
    here. Swapping a text box for a dropdown under somebody's cursor is worse
    than a dropdown that says it is loading for a moment.
  */
  const loadingCities = hasCities(place.country) && place.provinceId.length > 0 && isPending;
  const cityIsAList = cityOptions.length > 0 || loadingCities;

  /**
   * A province means nothing without its country and a city means nothing
   * without its province, so each one waits for the one above it. Left open,
   * the fallback text inputs accept anything: somebody types a city, then picks
   * a province, and the two disagree with no way to tell which is wrong.
   */
  const provinceReady = place.country.length > 0;
  const cityReady = provinceReady && (place.provinceId.length > 0 || !hasCities(place.country));

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country">
            <LabelText label="Country" required={required} />
          </Label>
          <SearchableSelect
            id="country"
            ariaLabel="Country"
            options={countries.map((country) => ({ value: country.iso2, label: country.name }))}
            value={place.country}
            // Changing the country invalidates both, because a province id
            // belongs to one country and a city name to one province.
            onChange={(country) => onChange({ ...place, country, provinceId: "", city: "" })}
            placeholder="Select country"
          />
          <FieldMessage error={errors.country} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="province">
            <LabelText label="Province" required={required} />
          </Label>
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
              disabled={!provinceReady}
            />
          ) : (
            <Input
              id="province"
              aria-label="Province"
              value={place.provinceId}
              onChange={(e) => onChange({ ...place, provinceId: e.target.value })}
              placeholder={provinceReady ? "Type the province or state" : "Pick a country first"}
              disabled={!provinceReady}
            />
          )}
          {provinces.length === 0 && provinceReady ? (
            <FieldMessage hint="No province list for this country yet, so type it." />
          ) : null}
          <FieldMessage error={errors.province} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city">
            <LabelText label="City" required={required} />
          </Label>
          {cityIsAList ? (
            <SearchableSelect
              id="city"
              ariaLabel="City"
              options={cityOptions.map((city) => ({ value: city, label: city }))}
              value={place.city}
              onChange={(city) => onChange({ ...place, city })}
              placeholder={loadingCities ? "Loading cities" : "Search cities"}
              disabled={!cityReady || loadingCities}
            />
          ) : (
            <Input
              id="city"
              aria-label="City"
              value={place.city}
              onChange={(e) => onChange({ ...place, city: e.target.value })}
              placeholder={cityReady ? "Type the city" : "Pick a province first"}
              disabled={!cityReady}
            />
          )}
          {/*
            Said, not left to be worked out. Country and province are lists
            with a chevron on them, so a city that quietly turns into a plain
            box reads as a dropdown that failed to load rather than as a field
            waiting to be typed in. It cost somebody a bug report.
          */}
          {!cityIsAList && cityReady ? (
            <FieldMessage hint="No city list for this country yet, so type it." />
          ) : null}
          <FieldMessage error={errors.city} />
        </div>
      </div>

      <Field
        id="venue"
        label="Venue"
        value={place.venue}
        onChange={(e) => onChange({ ...place, venue: e.target.value })}
        placeholder="Gelora Bung Karno"
      />
    </>
  );
}
