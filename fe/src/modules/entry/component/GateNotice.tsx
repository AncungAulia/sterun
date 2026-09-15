/**
 * What the enter page shows instead of the form (mockup block 7).
 *
 * One sentence and a way on, in the same frame for every case. The existing
 * entry is the only one drawn in success colours: it is good news, and a
 * runner who comes back to the enter page after paying should read it as such.
 *
 * A sold-out distance offers the others that still have places, because that
 * is the question the runner is left with.
 */
import Link from "next/link";
import { BadgeCheckIcon, BanIcon, CircleOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { EventSummary } from "@/lib/events";
import { cn } from "@/utils/cn";

import type { Gate } from "../gate";

export function GateNotice({
  gate,
  summary,
}: {
  gate: Exclude<Gate, { kind: "open" }>;
  summary: EventSummary;
}) {
  const eventId = summary.event.eventId;

  switch (gate.kind) {
    case "already-entered": {
      const what = gate.distanceCode ? `the ${gate.distanceCode}` : "this race";
      return (
        <Frame eventId={eventId} tone="success" icon={<BadgeCheckIcon aria-hidden="true" className="size-6" />} title="You're already entered">
          {`This wallet entered ${what} with bib ${gate.record.bibNo}. One entry per race.`}
        </Frame>
      );
    }

    case "closed":
      return (
        <Frame eventId={eventId} icon={<CircleOffIcon aria-hidden="true" className="size-6" />} title="Entries are closed">
          Entries for this race are closed.
        </Frame>
      );

    case "sold-out": {
      const others = summary.categories.filter(
        (category) => category.categoryId !== gate.categoryId && category.slotsLeft > 0,
      );
      return (
        <Frame
          eventId={eventId}
          icon={<BanIcon aria-hidden="true" className="size-6" />}
          title="Sold out"
          actions={others.map((category) => (
            <Button key={category.categoryId} asChild>
              <Link href={`/events/${eventId}/enter?category=${category.categoryId}`}>
                Enter {category.code}
              </Link>
            </Button>
          ))}
        >
          This distance is sold out.
        </Frame>
      );
    }

    case "no-distance":
      return (
        <Frame eventId={eventId} icon={<BanIcon aria-hidden="true" className="size-6" />} title="Sold out">
          Every distance is full.
        </Frame>
      );
  }
}

function Frame({
  eventId,
  icon,
  tone = "neutral",
  title,
  children,
  actions = [],
}: {
  eventId: number;
  icon: ReactNode;
  tone?: "success" | "neutral";
  title: string;
  children: ReactNode;
  actions?: ReactNode[];
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span
        className={cn(
          "grid size-13 place-items-center rounded-full border",
          tone === "success"
            ? "border-success-border bg-success-surface text-success"
            : "border-n-200 bg-n-100 text-n-600",
        )}
      >
        {icon}
      </span>
      <h1 className="heading-strong text-2xl text-ink">{title}</h1>
      <p className="text-base text-n-600">{children}</p>
      <div className="mt-2 flex w-full flex-col gap-3">
        {actions}
        {/* The way back is the main action only when there is nothing better to offer. */}
        <Button asChild variant={actions.length > 0 ? "secondary" : "default"}>
          <Link href={`/events/${eventId}`}>Back to the race</Link>
        </Button>
      </div>
    </div>
  );
}
