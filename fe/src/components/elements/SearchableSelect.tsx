"use client";

/**
 * A select you can type into, for lists nobody should have to scroll.
 *
 * shadcn's Combobox pattern: a Popover holding a Command list. Worth using
 * rather than a plain Select because the lists here are 250 countries and, for
 * a chosen province, up to a few hundred cities. A plain select turns "Jakarta
 * Pusat" into a scroll hunt; typing three letters does not.
 *
 * Command brings the parts that are tedious to get right: filtering, arrow key
 * movement through results, enter to choose, escape to close, and an aria
 * listbox that announces what is highlighted.
 */
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";

export interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  /** The accessible name. The visible label lives with the caller. */
  ariaLabel: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Shown when nothing matches what was typed. */
  emptyText?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  id,
  ariaLabel,
  options,
  value,
  onChange,
  placeholder,
  emptyText = "Nothing found.",
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // Command filters on the value it is given, so it has to be
                  // the label. The id travels in the click instead.
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn("mr-2 size-4", option.value === value ? "opacity-100" : "opacity-0")}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
