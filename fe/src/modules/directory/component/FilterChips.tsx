/**
 * What is filtered, visible without opening the drawer, and removable one at a
 * time. A filtered list that does not say it is filtered reads as a directory
 * with fewer races in it.
 */
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { filterChips, type Filters } from "../filters";

interface FilterChipsProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}

export function FilterChips({ filters, onChange, onClear }: FilterChipsProps) {
  const chips = filterChips(filters);
  if (chips.length === 0) return null;

  return (
    <ul aria-label="Applied filters" className="flex flex-wrap items-center justify-center gap-2">
      {chips.map((chip) => (
        <li key={chip.id}>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onChange(chip.remove(filters))}
          >
            {chip.label}
            <XIcon aria-hidden />
          </Button>
        </li>
      ))}
      <li>
        <Button variant="link" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      </li>
    </ul>
  );
}
