"use client";

import type { ReactNode } from "react";

import { Help } from "@/components/elements/Help";

/**
 * A heading, the one line that has to be read, and the rest behind an info
 * button.
 *
 * The split is the same one every field makes (`elements/Help.tsx`): `note` is
 * what somebody needs in order to fill this section in, or a cost they cannot
 * undo. Background goes in `help`, where it is opened on purpose.
 */
export function Section({
  title,
  note,
  help,
  children,
}: {
  title: string;
  note?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="heading-strong text-lg text-foreground">{title}</h2>
          {help ? <Help label={title}>{help}</Help> : null}
        </div>
        {note ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}
