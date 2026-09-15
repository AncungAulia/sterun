"use client";

/**
 * A list of suggestions that never refuses an answer it has not heard of.
 *
 * This replaced a native `<datalist>`. That was the smallest thing that offered
 * a list and still took free text, but it is drawn by the operating system: it
 * arrives in the browser's own font, at the browser's own size, with the
 * browser's own colours, and it does not look like anything else on the page.
 * A form built on one design system with one control from another reads as
 * broken even when it works.
 *
 * So it is the same Popover-and-Command pairing as `SearchableSelect`, with one
 * behavioural difference that is the whole point: whatever has been typed is
 * offered as its own row at the bottom of the list. A race hands out things
 * nobody could enumerate in advance, and an organiser with a meal ticket to add
 * should not have to discover that the field secretly accepts free text.
 *
 * ## Why the value is only committed on a choice
 *
 * Typing alone changes nothing. The query lives inside the popover, and the
 * field takes a value only when a row is chosen, including the row that says
 * "Add …". That makes the free-text path a deliberate act with a visible
 * consequence, rather than something that happens by closing the popover, and
 * it means an abandoned search cannot silently become the answer.
 */
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";

interface CreatableSelectProps {
  id: string;
  /** The accessible name. The visible label lives with the caller. */
  ariaLabel: string;
  /** Suggestions, shown in this order. Never a limit on what can be chosen. */
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function CreatableSelect({
  id,
  ariaLabel,
  options,
  value,
  onChange,
  placeholder,
}: CreatableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const typed = query.trim();
  const isNew =
    typed.length > 0 && !options.some((option) => option.toLowerCase() === typed.toLowerCase());

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Cleared on close so reopening starts from the list rather than from
        // whatever was abandoned last time.
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type your own" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => choose(option)}>
                  <CheckIcon
                    className={cn("mr-2 size-4", option === value ? "opacity-100" : "opacity-0")}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
            {isNew ? (
              <CommandGroup>
                {/*
                  `value={typed}` on purpose. Command filters its items against
                  what has been typed, so an item whose value *is* the query is
                  the one item that can never be filtered away.
                */}
                <CommandItem value={typed} onSelect={() => choose(typed)}>
                  <PlusIcon className="mr-2 size-4" />
                  Add &quot;{typed}&quot;
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
