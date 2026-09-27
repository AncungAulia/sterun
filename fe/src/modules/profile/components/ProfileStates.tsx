/**
 * The screens with nothing to list (P9 to P12). They are not interchangeable,
 * and the difference is the point:
 *
 *   - **No races yet** is a fact. `records_of` never reverts, so an empty list
 *     means this address has never entered a race.
 *   - **Could not load** is an admission. We could not look. Drawing a failed
 *     read as "no races" makes a network blip look like a runner's history was
 *     erased, which is exactly the failure this product exists to prevent.
 *   - **Not an address** never called anything: the check ran in the browser.
 *   - **Loading** shows the labels first and draws nothing that moves.
 */
import { CircleSlash, SearchX, WifiOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

function Notice({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-n-100 text-n-600">
        <Icon className="size-6" />
      </span>
      <h2 className="heading-strong text-2xl text-ink">{title}</h2>
      <p className="max-w-md text-base text-n-600">{body}</p>
      {children}
    </div>
  );
}

export function NoRaces() {
  return (
    <Notice
      icon={CircleSlash}
      title="No races yet"
      body="This address is real and was checked just now. It has simply never entered a race."
    />
  );
}

export function NotAnAddress() {
  return (
    <Notice
      icon={SearchX}
      title="That is not a Stellar address"
      body="A runner's address starts with G and is 56 characters long. Check it was copied whole."
    >
      <Button asChild variant="outline" className="mt-2">
        <Link href="/runner">Look up another address</Link>
      </Button>
    </Notice>
  );
}

export function CouldNotLoad({ onRetry }: { onRetry: () => void }) {
  return (
    <Notice
      icon={WifiOff}
      title="Could not load this history"
      body="The records are still there; this page could not fetch them just now."
    >
      <Button className="mt-2" onClick={onRetry}>
        Try again
      </Button>
    </Notice>
  );
}

export function LoadingRecords() {
  return (
    <div role="status" aria-label="Loading race records" className="flex flex-col gap-4">
      {[0, 1].map((index) => (
        <div key={index} className="flex flex-col gap-5 rounded-lg border border-n-200 bg-paper p-5">
          <div className="h-6 w-2/3 rounded-sm bg-n-200" />
          <div className="grid grid-cols-3 gap-4">
            {["Category", "Bib", "Finish time"].map((label) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs text-n-600">{label}</span>
                <span className="h-5 w-12 rounded-sm bg-n-200" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
