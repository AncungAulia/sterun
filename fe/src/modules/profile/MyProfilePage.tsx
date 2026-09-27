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
 * ## Why tabs
 *
 * Three sections that answer three different questions, and nobody needs two of
 * them at once: the pass is for a desk, the record is for showing somebody, the
 * faucet is for the first five minutes of a testnet wallet. As one scroll the
 * page's length depended on how many races a runner had run, so on a phone the
 * faucet sat below eleven record cards. What tabs cost on a page whose parts
 * are compared, like the directory, is the comparison; here there is none to
 * lose. The order, and why the tab lives in the address, are in `lib/profile-tab.ts`.
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

import { CouldNotLoad, LoadingRecords } from "./components/ProfileStates";
import { ProfileTabs } from "./components/ProfileTabs";
import { RecordCard } from "./components/RecordCard";
import { useRunnerProfile } from "./hooks/useRunnerProfile";
import { formatFactDay } from "./lib/profile-summary";
import type { ProfileTab } from "./lib/profile-tab";

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

export function MyProfilePage({ tab }: { tab: ProfileTab }) {
  return (
    <WalletGate title={ASK.title} description={ASK.description}>
      <Connected tab={tab} />
    </WalletGate>
  );
}

function Connected({ tab }: { tab: ProfileTab }) {
  const address = useWallet((state) => state.address);
  if (!address) return null;
  return <Profile address={address} tab={tab} />;
}

function Profile({ address, tab }: { address: string; tab: ProfileTab }) {
  const { records, summaryOf, cityOf } = useRunnerProfile(address);
  const disconnect = useWallet((state) => state.disconnect);

  const list = records.data ?? [];
  const current = list.filter(isCurrent);
  const history = list.filter((record) => !isCurrent(record));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-n-500">Your wallet</p>
        <p className="numeric max-w-full break-all text-lg text-ink">{address}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyAddress address={address} />
          {/* No second way to the public page here (Ancung, 2026-09-23): the
              record tab's own "Open the public page" is the one, and it sits
              beside the history it opens. */}
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        </div>
      </header>

      <ProfileTabs
        current={tab}
        testnet={IS_TESTNET}
        counts={records.isSuccess ? { entries: current.length, record: history.length } : undefined}
      />

      {tab === "entries" ? (
        <section aria-label="Your entries" className="flex flex-col gap-4">
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
      ) : null}

      {tab === "record" ? (
        <section aria-label="Your race record" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/runner/${address}`}>Open the public page</Link>
            </Button>
          </div>
          {records.isPending ? (
            <LoadingRecords />
          ) : records.isError ? (
            <CouldNotLoad onRetry={() => void records.refetch()} />
          ) : history.length === 0 ? (
            <EmptyState title="Nothing finished yet" icon={FlagIcon}>
              A race appears here once its organiser records your result.
            </EmptyState>
          ) : (
            history.map((record) => (
              <RecordCard
                key={record.tokenId}
                record={record}
                summary={summaryOf(record.eventId)}
                city={cityOf(record.eventId)}
                owner={address}
              />
            ))
          )}
        </section>
      ) : null}

      {tab === "faucet" ? <Faucet address={address} /> : null}
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
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
  );
}

function Faucet({ address }: { address: string }) {
  const balance = useSusdBalance(address);

  return (
    /* A column in the middle of the space the other tabs fill, with no card
       around it (Ancung, 2026-09-23). A panel holding one number, one button
       and one sentence, pinned to the left of a page this wide, read as the
       first of several cards that never arrived. It is the same shape an empty
       state takes, for the same reason: there is nothing here to compare it
       with. */
    <section
      aria-label="Faucet"
      className="flex flex-col items-center gap-4 px-6 py-12 text-center"
    >
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-n-500">In this wallet</p>
        {/* A wallet with no trustline has no balance to read rather than a
            zero, and saying zero there would send somebody to the faucet for a
            problem the faucet's own button explains. */}
        <p className="heading-hero text-5xl text-ink tabular-nums">
          {balance.data?.kind === "balance"
            ? `sUSD ${formatAmount(balance.data.stroops)}`
            : balance.data
              ? "sUSD 0"
              : " "}
        </p>
      </div>
      <GetTestSusd address={address} />
      <p className="max-w-md text-sm text-n-500">
        Test money for trying Sterun. It has no value, and it only works while Sterun runs on the test
        network.
      </p>
    </section>
  );
}
