import { notFound } from "next/navigation";

import { DonePreview } from "./DonePreview";

/**
 * A harness for the last step of the create-event wizard.
 *
 * The Done step is the hardest screen in the app to look at: reaching it for
 * real costs three signed transactions on testnet and a new event nobody
 * wanted, and its confetti fires once on mount and then removes its own
 * canvas, so even a screenshot is a race. This renders it directly, with the
 * inputs exposed and a button that remounts it.
 *
 * Development only. It 404s in production rather than being hidden behind a
 * link nobody follows: a preview route that ships is a page an organiser can
 * land on from a search engine, and this one lies about a race being live.
 */
export default function DonePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <DonePreview />;
}
