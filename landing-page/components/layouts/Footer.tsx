/**
 * Footer, composed after Nabil's Corolary footer: a paper card with rounded
 * corners sitting on the dark ground the closing section already set, a claim
 * and a short paragraph on the left, three columns of links on the right, and
 * the name set enormous along the bottom with the mark in its corner.
 *
 * The claim is the one sentence on the page that promises nothing a reader
 * cannot check, which is why it is the last thing they read. It is scoped with
 * care: the contracts are live on testnet; the entry pass and the scanner are
 * not built yet, so the footer does not say that "everything" runs.
 *
 * The contract column comes from lib/links.ts, which copies docs/deployments.md.
 * Never type an address here.
 *
 * NOT HERE YET: the line naming the team. Its wording (team name, where the team
 * is from, or the four people) is Axel's decision, and it goes under the claim
 * once made.
 *
 * The giant word is set in .heading-hero, the one face brand.md allows to
 * shout. It is a typographic treatment of the name, not the logo: the logo
 * files are outlines and are never retyped, which is why the real mark sits in
 * the corner.
 */

import Image from "next/image";
import { APP_URL, CONTRACTS, REPO_URL, SDK_URL } from "@/lib/links";

const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

const THIS_PAGE = [
  { label: "Problem", href: "#problem" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Product", href: "#product" },
  { label: "Why Stellar", href: "#why-stellar" },
];

const THE_APP = [
  { label: "Browse races", href: APP_URL },
  { label: "Organiser console", href: `${APP_URL}/org` },
  { label: "SDK", href: SDK_URL, external: true },
  { label: "Source", href: REPO_URL, external: true },
];

const CONTRACT_LINKS = [
  { label: "EventRegistry", ...CONTRACTS.eventRegistry },
  { label: "RaceRecord", ...CONTRACTS.raceRecord },
  { label: "sUSD", ...CONTRACTS.susd },
];

function Arrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{title}</h3>
      <ul className="mt-6 flex flex-col gap-4">{children}</ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="overflow-hidden rounded-[var(--radius-xl)] bg-paper text-ink">
        <div className="grid gap-14 px-6 pt-14 sm:px-10 lg:px-14 lg:pt-16 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)] xl:gap-10">
          <div>
            <p className="max-w-[18ch] text-[clamp(1.75rem,3.3vw,3.25rem)] font-medium leading-[1.15] tracking-[-0.01em]">
              The contracts this page describes are live on the Stellar testnet.
            </p>
            <p className="mt-10 max-w-[48ch] text-sm leading-[1.65] text-n-600">
              Race records are issued on testnet, and entry fees settle in sUSD, a test asset we issue
              ourselves. Personal details never reach the chain; only a salted hash does. Nothing here
              runs on mainnet yet.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-[1fr_1fr_1.7fr]">
            <Column title="This page">
              {THIS_PAGE.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="wipe-underline relative text-base leading-tight">
                    {l.label}
                  </a>
                </li>
              ))}
            </Column>

            <Column title="The app">
              {THE_APP.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="wipe-underline relative text-base leading-tight"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </Column>

            <div className="col-span-2 sm:col-span-1">
              <Column title="Contracts">
                {CONTRACT_LINKS.map((c) => (
                  <li key={c.label}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${c.label} on stellar.expert`}
                      className="group inline-flex items-baseline gap-x-2 whitespace-nowrap text-base leading-tight"
                    >
                      <span className="wipe-underline relative">{c.label}</span>
                      <span className="numeric text-sm text-n-600">{short(c.id)}</span>
                      <span className="text-n-600">
                        <Arrow />
                      </span>
                    </a>
                  </li>
                ))}
              </Column>
            </div>
          </nav>
        </div>

        {/* The name along the bottom, sized to span the card, with the mark in
            the corner above its end. aria-hidden: it is the same word the logo
            in the header already announces. */}
        <div className="relative mt-16 px-4 pb-4 sm:px-6 lg:mt-24 lg:px-10 lg:pb-6">
          <Image
            src="/brand/logo/sterun-logo-black.svg"
            alt=""
            width={400}
            height={400}
            className="absolute right-4 top-0 h-12 w-12 sm:right-6 sm:h-16 sm:w-16 lg:right-10"
          />
          <p
            aria-hidden
            className="heading-hero select-none text-[length:var(--fw)] uppercase leading-[0.78] tracking-[-0.02em] [--fw:min(22vw,30rem)] sm:[--fw:min(26vw,30rem)] lg:[--fw:min(28vw,40rem)]"
          >
            Sterun
          </p>
        </div>
      </div>
    </footer>
  );
}
