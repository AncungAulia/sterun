/**
 * The public pages: the directory, an event, the wizard's preview.
 *
 * They get the site header. The console does not, which is the whole reason
 * this file exists rather than the root layout deciding for everybody.
 */
import type { ReactNode } from "react";

import { SiteFrame } from "@/components/layouts/SiteFrame";

export default function BrowseLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
