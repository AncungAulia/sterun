/**
 * A record's meaning as a chip: the word, then an icon whose SHAPE differs,
 * then colour (docs/design/profile/README.md §4).
 *
 * Green against red is 1.41:1, so to a colour blind reader two chips side by
 * side are the same grey. Every meaning therefore carries its own shape: a ring
 * for entered, a box for the race pack, a tick, a cross, a single bar for a
 * runner who never started, and an alert for a race called off.
 */
import { Check, CircleAlert, Circle, Minus, Package, X, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

import { CHIP_WORD, type MeaningKind } from "../lib/record-meaning";

const LOOK: Record<MeaningKind, { icon: LucideIcon; className: string }> = {
  entered: { icon: Circle, className: "border-teal-200 bg-teal-50 text-teal-700" },
  collected: { icon: Package, className: "border-n-300 bg-n-200 text-n-700" },
  finished: { icon: Check, className: "border-success-border bg-success-surface text-success" },
  "finished-untimed": { icon: Check, className: "border-success-border bg-success-surface text-success" },
  dnf: { icon: X, className: "border-danger-border bg-danger-surface text-danger" },
  dns: { icon: Minus, className: "border-danger-border bg-danger-surface text-danger" },
  cancelled: { icon: CircleAlert, className: "border-warning-border bg-warning-surface text-warning" },
};

export function RecordChip({ kind }: { kind: MeaningKind }) {
  const { icon: Icon, className } = LOOK[kind];
  return (
    <Badge variant="outline" data-meaning={kind} className={cn("gap-1.5 rounded-sm px-2.5 py-1 text-sm", className)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
      {CHIP_WORD[kind]}
    </Badge>
  );
}
