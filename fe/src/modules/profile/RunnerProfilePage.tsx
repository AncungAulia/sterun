"use client";

/**
 * `/runner/[address]`: every race an address has entered, read from the chain,
 * readable by anyone with the link (STE-24, P1, P2, P9 to P12).
 *
 * No wallet, no login, and nothing on this page writes. The address is checked
 * in the browser first, so a mistyped link costs no request and gets its own
 * screen. The history comes from RPC; see `useRunnerProfile` for what each part
 * does when it fails.
 */
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { shortAddress } from "@/utils/format";

import { CouldNotLoad, LoadingRecords, NoRaces, NotAnAddress } from "./components/ProfileStates";
import { RecordCard } from "./components/RecordCard";
import { useRunnerProfile } from "./hooks/useRunnerProfile";
import { formatFirstRace, pageCount, pageOf, profileNumbers } from "./lib/profile-summary";
import { cleanAddress, isRunnerAddress } from "./lib/runner-address";

function Stat({ label, value, align = "left" }: { label: string; value: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right lg:text-left" : undefined}>
      <p className="text-xs text-n-600">{label}</p>
      <p className="heading-hero mt-1 text-4xl text-ink tabular-nums">{value}</p>
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={copied ? "Address copied" : "Copy the full address"}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(address)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

function Profile({ address }: { address: string }) {
  const { records, summaryOf, cityOf } = useRunnerProfile(address);
  const [page, setPage] = useState(1);

  const list = records.data ?? [];
  const numbers = profileNumbers(list);
  const current = pageOf(list, page);
  const pages = pageCount(list.length);

  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_1fr] lg:gap-12">
      <aside className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-n-600">Race record</p>
          {/* One line always: split across two, the address read as two
              different strings and pushed the copy button off to the side. */}
          <div className="flex items-center gap-3">
            <h1 className="heading-hero text-4xl whitespace-nowrap text-ink" title={address}>
              {shortAddress(address, 4, 4)}
            </h1>
            <CopyAddress address={address} />
          </div>
          <p className="text-base text-n-600">Every race this address has entered, read from the Stellar testnet.</p>
        </div>

        {records.isSuccess && list.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-1">
            <Stat label="Races" value={String(numbers.races)} />
            <Stat label="Finished" value={String(numbers.finished)} />
            {numbers.firstEnteredAt !== null ? (
              <Stat label="First race" value={formatFirstRace(numbers.firstEnteredAt)} align="right" />
            ) : null}
          </div>
        ) : null}

        <div className="hidden flex-col gap-1 lg:flex">
          <p className="text-xs text-n-600">Where this comes from</p>
          <p className="text-sm text-n-600">
            Read live from the Stellar testnet each time this page opens. Nothing on it is stored by Sterun.
          </p>
        </div>
      </aside>

      <section aria-label="Races" className="flex min-w-0 flex-col gap-4">
        {records.isPending ? <LoadingRecords /> : null}
        {records.isError ? <CouldNotLoad onRetry={() => void records.refetch()} /> : null}
        {records.isSuccess && list.length === 0 ? <NoRaces /> : null}

        {current.items.map((record) => (
          <RecordCard
            key={record.tokenId}
            record={record}
            summary={summaryOf(record.eventId)}
            city={cityOf(record.eventId)}
            owner={address}
          />
        ))}

        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-between gap-4 pt-2">
            <Button variant="outline" onClick={() => setPage(current.page - 1)} disabled={current.page === 1}>
              Newer races
            </Button>
            <span className="text-sm text-n-600 tabular-nums">
              Page {current.page} of {pages}
            </span>
            <Button variant="outline" onClick={() => setPage(current.page + 1)} disabled={current.page === pages}>
              Older races
            </Button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

export function RunnerProfilePage({ address }: { address: string }) {
  const cleaned = cleanAddress(decodeURIComponent(address));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 lg:py-12">
      {isRunnerAddress(cleaned) ? <Profile address={cleaned} /> : <NotAnAddress />}
    </div>
  );
}
