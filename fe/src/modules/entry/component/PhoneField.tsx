"use client";

/**
 * A phone number with a country picker that always produces E.164 (STE-21).
 *
 * ## Why E.164 is correctness, not polish
 *
 * The emergency phone is part of `participant_hash`, and `norm_contact`
 * (HASH_AND_TOTP.md §2.3) strips spaces and punctuation but never adds a
 * country code. So `0812 3456 7890` and `+62 812 3456 7890` are one phone and
 * two hashes, and a medic recomputing later would fail on correct data. The
 * vault refuses anything but E.164 for that reason (be/CLAUDE.md, STE-47).
 *
 * ## National input, not international
 *
 * The runner types the number the way they say it, leading zero included, and
 * `react-phone-number-input` turns it into E.164 for the chosen country:
 * `081234567890` in Indonesia is `+6281234567890`. The international mode would
 * put `+62` in the box and keep a typed zero after it, which is a well-formed
 * wrong number.
 *
 * ## Built from shadcn parts
 *
 * The library owns parsing and formatting. What is drawn is ours: the number is
 * the shadcn `Input`, and the country picker is `Popover` + `Command` +
 * `ScrollArea`, the shape of the community `shadcn-phone-input`.
 */
import PhoneInput, { getCountryCallingCode, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import en from "react-phone-number-input/locale/en";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";

import { FieldMessage, LabelRow } from "@/components/elements/Field";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils/cn";

export type { Country };

export function PhoneField({
  id,
  label,
  value,
  onChange,
  defaultCountry,
  hint,
  error,
  required,
}: {
  id: string;
  label: string;
  /** E.164, or empty. */
  value: string;
  /** Always E.164, or empty when the field is cleared. */
  onChange: (value: string) => void;
  defaultCountry: Country;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <LabelRow htmlFor={id} label={label} required={required} />
      <PhoneInput
        id={id}
        value={value || undefined}
        onChange={(next) => onChange(next ?? "")}
        defaultCountry={defaultCountry}
        labels={en}
        flags={flags}
        countrySelectComponent={CountrySelect}
        inputComponent={NumberInput}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        limitMaxLength
        className="flex"
      />
      <FieldMessage hint={hint} error={error} />
    </div>
  );
}

/** The number itself: shadcn's Input, joined to the picker on its left. */
function NumberInput({ className, ...props }: ComponentProps<"input">) {
  return <Input {...props} className={cn("numeric rounded-l-none", className)} />;
}

interface CountryOption {
  value?: Country;
  label: string;
  divider?: boolean;
}

/** What `react-phone-number-input` hands its `countrySelectComponent`. */
interface CountrySelectProps {
  value?: Country;
  options: CountryOption[];
  onChange: (country?: Country) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

function CountrySelect({ value, options, onChange, disabled, "aria-label": ariaLabel }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const countries = options.filter(
    (option): option is CountryOption & { value: Country } => Boolean(option.value) && !option.divider,
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? "Phone number country"}
          disabled={disabled}
          className="numeric shrink-0 gap-2 rounded-r-none border-r-0 px-3 focus:z-10"
        >
          <Flag country={value} />
          <span>{value ? `+${getCountryCallingCode(value)}` : "+"}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 text-n-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country" />
          <CommandList>
            <ScrollArea className="h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countries.map((option) => {
                  const code = getCountryCallingCode(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      // Searchable by name and by code: people know "+65" as well as "Singapore".
                      value={`${option.label} +${code}`}
                      onSelect={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <Flag country={option.value} />
                      <span className="flex-1">{option.label}</span>
                      <span className="numeric text-sm text-n-500">+{code}</span>
                      {option.value === value ? <CheckIcon aria-hidden="true" className="size-4" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Flag({ country }: { country?: Country }) {
  const Svg = country ? flags[country] : undefined;
  return (
    <span aria-hidden="true" className="flex h-4 w-6 shrink-0 overflow-hidden rounded-sm bg-n-100 [&_svg]:size-full">
      {Svg && country ? <Svg title={en[country] ?? country} /> : null}
    </span>
  );
}
