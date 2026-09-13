/**
 * The wizard keeps the site header and takes no rail.
 *
 * `/org/new` is six steps that end in signing, and permanent navigation beside
 * it offers a way out of a half-finished race at every moment, plus a second
 * one next to the step's own way back. So the console's shell stops at the
 * console: this route sits under `/org` in the URL only.
 */
import type { ReactNode } from "react";

import { SiteFrame } from "@/components/layouts/SiteFrame";

export default function NewEventLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
