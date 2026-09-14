import { APP_URL, CONTRACTS, REPO_URL, SDK_URL } from "@/lib/links";

/**
 * The four steps of How it works. Titles and bodies are fixed by
 * docs/landing-copy.md; pills, details and links are drawn from it.
 */

export type StepLink = { label: string; href: string; external: boolean };

export type Step = {
  index: string;
  pill: string;
  details: readonly [string, string];
  title: string;
  body: string;
  image: string;
  bg: string;
  /** Shown when the step is opened: what a reader would go and check. */
  links: readonly StepLink[];
};

const raceRecord: StepLink = { label: "RaceRecord contract", href: CONTRACTS.raceRecord.url, external: true };

export const STEPS: readonly Step[] = [
  {
    index: "01",
    pill: "Runner",
    details: ["One signature", "Hashed on chain"],
    title: "Enter",
    body: "A runner picks an event and a category, fills in their details, and pays the entry fee. One wallet signature covers the entry and the payment together. Personal data goes to Sterun’s backend, encrypted. Only a salted hash of it reaches the chain.",
    image: "/images/how-it-works/placeholder-1.svg",
    bg: "bg-n-200",
    links: [
      { label: "Launch app", href: APP_URL, external: false },
      { label: "EventRegistry contract", href: CONTRACTS.eventRegistry.url, external: true },
      { label: "sUSD token", href: CONTRACTS.susd.url, external: true },
    ],
  },
  {
    index: "02",
    pill: "Volunteer",
    details: ["Code changes every 30s", "Claimed once"],
    title: "Claim the racepack",
    body: "On race day a volunteer scans the runner’s pass. The code behind it changes every 30 seconds, so a screenshot is worthless by the time it is shown. The contract flips the record to claimed, which is what makes collecting twice impossible rather than merely discouraged.",
    image: "/images/how-it-works/placeholder-2.svg",
    bg: "bg-teal-100",
    links: [raceRecord],
  },
  {
    index: "03",
    pill: "Organiser",
    details: ["Signed by the organiser", "Written to the record"],
    title: "Finish",
    body: "The organiser records the result against the record. It is signed by the organiser’s key, so the time on the record is the time the organiser actually submitted.",
    image: "/images/how-it-works/placeholder-3.svg",
    bg: "bg-n-100",
    links: [raceRecord, { label: "Sterun SDK", href: SDK_URL, external: true }],
  },
  {
    index: "04",
    pill: "Anyone",
    details: ["Public profile", "No wallet needed"],
    title: "Verify",
    body: "Anyone opens the runner’s public profile and reads the history: event, category, bib, state, finish time, and the transaction behind each one. No wallet needed to look.",
    image: "/images/how-it-works/placeholder-4.svg",
    bg: "bg-teal-50",
    links: [raceRecord, { label: "Source code", href: REPO_URL, external: true }],
  },
];

/** A step title's size inside the box: akaru's 6.67% of the width, capped by the box's height. */
export const STEP_TITLE_SIZE = "min(calc(var(--bw) * 0.0667), calc(var(--bh, 100vh) * 0.136))";
