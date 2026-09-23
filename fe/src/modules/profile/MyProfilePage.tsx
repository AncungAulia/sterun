"use client";

/**
 * `/profile`: the connected wallet's own page (Ancung, 2026-09-23).
 *
 * ## Why a page rather than the menu it replaces
 *
 * The wallet button used to open a popover holding five unrelated things: the
 * address, a link to the public record, the sUSD balance, the faucet and
 * Disconnect. A popover is the wrong room for that. It is a phone-width panel
 * hanging off a button, it cannot be linked to, it closes when anything else is
 * pressed, and the one thing a runner actually comes back for, their pass, was
 * not in it at all. Eventbrite splits the same material into pages rather than
 * a menu: `/mytickets/` and `/account-settings/` are real routes that redirect
 * to sign-in when you are logged out, and the bar only links to them.
 *
 * ## What is here that was nowhere before
 *
 * **The races this wallet is still in, with the pass.** Until now, opening a
 * pass meant remembering which race it was for and finding that race again.
 * A pass is what a runner holds up at a desk, so it belongs one press from the
 * name of the wallet holding it.
 *
 * ## What this is not
 *
 * It is not a replacement for `/runner/[address]`, which is public, has no
 * wallet in it and is what a runner sends to somebody else. This page is the
 * same history plus the things only its owner may do, so it links there rather
 * than copying it: two pages claiming to be the record is how they drift.
 */
import { CheckIcon, CopyIcon, FlagIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/button";
import { GetTestSusd } from "@/components/wallet/GetTestSusd";
import { WalletGate } from "@/components/wallet/WalletGate";
import { useSusdBalance } from "@/hooks/useSusdBalance";
import { useWallet } from "@/hooks/useWallet";
import { IS_TESTNET } from "@/lib/chain/env";
import { formatAmount } from "@/utils/format";
import type { SterunRecord } from "@sterunxyz/sdk";

import { RecordCard } from "./components/RecordCard";
import { CouldNotLoad, LoadingRecords } from "./components/ProfileStates";
import { useRunnerProfile } from "./hooks/useRunnerProfile";
import { formatFactDay } from "./lib/profile-summary";

const ASK = {
  title: "Your profile",
  description: "Connect the wallet you enter races with to see your entries, your passes and your race record.",
};

/**
 * A record is still "an entry" while the race can still be run: the runner has
 * a pass to show and a desk to show it at. Once there is a result it is
 * history, and history is what the record cards are for.
 */
function isCurrent(record: SterunRecord): boolean {
  return record.state === "Entered" || record.state === "RacepackClaimed";
}

export function MyProfilePage() {
  return (
    <WalletGate title={ASK.title} description={ASK.description}>
      <Connected />
    </WalletGate>
  );
}

function Connected() {
  const address = useWallet((state) => state.address);
  if (!address) return null;
  return <Profile address={address} />;
}

function Profile({ address }: { address: string }) {
  const { records, summaryOf, cityOf } = useRunnerProfile(address);
  const disconnect = useWallet((state) => state.disconnect);
  const balance = useSusdBalance(IS_TESTNET ? address : null);
  const [copied, setCopied] = useState(false);

  const list = records.data ?? [];
  const current = list.filter(isCurrent);
  const history = list.filter((record) => !isCurrent(record));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-n-500">Your wallet</p>
          <p className="numeric break-all text-lg text-ink">{address}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(address)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy address"}
          </Button>
          {/* Named for what it is rather than "public profile": the page it
              opens is the one a runner sends to somebody who wants proof. */}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/runner/${address}`}>See what others see</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        </div>
      </header>

      {IS_TESTNET ? (
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="heading-strong text-lg text-ink">Test money</h2>
            {/* A wallet with no trustline has no balance to read rather than a
                zero, and saying zero there would send somebody to the faucet
                for a problem the faucet's own button explains. */}
            <p className="numeric text-lg text-ink">
              {balance.data?.kind === "balance"
                ? `sUSD ${formatAmount(balance.data.stroops)}`
                : balance.data
                  ? "sUSD 0"
                  : ""}
            </p>
          </div>
          <GetTestSusd address={address} />
          <p className="text-sm text-n-500">
            Test money for trying Sterun. It has no value.
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="heading-strong text-2xl text-ink">Races you are in</h2>
        {records.isPending ? (
          <LoadingRecords />
        ) : records.isError ? (
          <CouldNotLoad onRetry={() => void records.refetch()} />
        ) : current.length === 0 ? (
          <EmptyState title="No races yet" icon={TicketIcon}>
            Races you enter appear here, with the pass you show at the race pack desk.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {current.map((record) => {
              const summary = summaryOf(record.eventId);
              const category = summary?.categories.find(
                (candidate) => candidate.categoryId === record.categoryId,
              );
              return (
                <li
                  key={record.tokenId}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-n-200 bg-paper p-5 shadow-card"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="heading-strong text-lg text-ink">
                      {summary?.event.name ?? `Race ${record.eventId}`}
                    </p>
                    <p className="numeric text-sm text-n-600">
                      {[category?.code, `Bib ${record.bibNo}`, cityOf(record.eventId)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="numeric text-sm text-n-500">
                      Entered {formatFactDay(record.enteredAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/pass/${record.tokenId}`}>Open my pass</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/events/${record.eventId}/entered/${record.tokenId}`}>
                        View my entry
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="heading-strong text-2xl text-ink">Your race record</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/runner/${address}`}>Open the public page</Link>
          </Button>
        </div>
        {records.isSuccess && history.length === 0 ? (
          <EmptyState title="Nothing finished yet" icon={FlagIcon}>
            A race appears here once its organiser records your result.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {history.map((record) => (
              <RecordCard
                key={record.tokenId}
                record={record}
                summary={summaryOf(record.eventId)}
                city={cityOf(record.eventId)}
                owner={address}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
