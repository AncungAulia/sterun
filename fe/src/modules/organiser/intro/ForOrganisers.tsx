"use client";

/**
 * `/organisers` - the way in for somebody who runs races (Ancung, 2026-09-23).
 *
 * Until this page existed, a race organiser reaching Sterun had nowhere to
 * land. The console is behind a wallet, and a wallet that is not on the
 * allowlist met a refusal that said "send this address to the Sterun team" and
 * named no way of doing it. That is a dead end dressed as an instruction, and
 * it sat at exactly the point where somebody had decided to try.
 *
 * So the page answers three questions in the order they are asked: what this
 * does for a race, what publishing one involves, and how to be allowed to.
 * The last one shows the connected wallet's address when there is one, because
 * that address is the thing the team needs, and copying it out of a wallet
 * extension is the step people get wrong.
 *
 * It is a public page under `(browse)`, not part of the console: the reader
 * does not have a console yet, and may never connect a wallet at all.
 */
import { CheckIcon, CopyIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { X_HANDLE, X_URL } from "@/lib/contact";

const STEPS = [
  {
    title: "Publish the race",
    detail:
      "Name it, add the distances with their prices and how many people each can take, and say what is in the race pack. It goes up as one page runners can read and enter from.",
  },
  {
    title: "Runners enter and pay",
    detail:
      "Entries stop on their own once a distance is full, so you never oversell one. Each runner gets a pass with a code that changes every 30 seconds, which is what makes a forwarded screenshot useless.",
  },
  {
    title: "Race day, with or without signal",
    detail:
      "Your volunteers download the runner list once, then check people in from a phone with no signal at all. A race pack cannot be collected twice, and that is enforced rather than remembered.",
  },
  {
    title: "Results anyone can check",
    detail:
      "Upload your results and each runner gets a race record that belongs to them, which they can show to anyone without going through you.",
  },
];

export function ForOrganisers() {
  const address = useWallet((state) => state.address);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard leaves the address on screen to
      // select by hand, which is what somebody would have done anyway.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-12">
      <header className="flex flex-col gap-4">
        <h1 className="heading-hero text-4xl text-ink">Run a race on Sterun</h1>
        <p className="max-w-2xl text-lg text-n-600">
          Sell entries, check runners in at the desk without signal, and give every finisher a
          result they can prove is theirs, years later, without asking you for it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/org">Open the organiser console</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Browse races</Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="heading-strong text-2xl text-ink">How a race runs here</h2>
        <ol className="flex flex-col gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="numeric grid size-8 shrink-0 place-items-center rounded-full bg-teal-50 text-base font-medium text-teal"
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="heading-strong text-lg text-ink">{step.title}</h3>
                <p className="max-w-2xl text-base text-n-600">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 px-6 py-6">
        <h2 className="heading-strong text-2xl text-ink">Before you can publish</h2>
        <p className="max-w-2xl text-base text-n-600">
          Sterun keeps a list of the wallets allowed to publish a race, so nobody can put up a race
          in somebody else{"'"}s name. Ask us to add yours, and send the wallet address you will
          publish from.
        </p>

        {address ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-n-500">The wallet you are connected with</p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="numeric break-all text-base text-foreground">{address}</p>
              <Button variant="outline" size="sm" onClick={() => void copyAddress()}>
                {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                {copied ? "Copied" : "Copy address"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="max-w-2xl text-base text-n-600">
            Connect your wallet on this page and your address appears here, ready to copy.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={X_URL} target="_blank" rel="noreferrer">
              Message us on X
            </a>
          </Button>
          <p className="text-base text-n-600">{X_HANDLE}</p>
        </div>

        <p className="max-w-2xl text-sm text-n-500">
          Being on the list only decides who may publish a race. It changes nothing else: your
          races, your runners and your results stay yours.
        </p>
      </section>
    </div>
  );
}
