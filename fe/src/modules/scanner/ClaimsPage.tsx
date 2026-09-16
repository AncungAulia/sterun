"use client";

/**
 * `/scan/[eventId]/claims`: S9 and S10, the race packs this phone handed over
 * and what has become of them.
 *
 * ## Sending starts on a tap, not on its own
 *
 * The handoff has claims go "by themselves once there is signal". With a wallet
 * that cannot be true: every claim is its own transaction and needs its own
 * approval (lib/send-claims.ts). A run that started itself when a bar of signal
 * came back would open a wallet prompt over the desk while a volunteer is in
 * the middle of checking a runner. So the phone keeps them, says how many, and
 * sends when the volunteer chooses to.
 *
 * ## Nothing here can lose a claim
 *
 * Every row is in IndexedDB before this screen exists. Leaving it mid-run stops
 * the run, and whatever was not sent is still waiting next time.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/useOnline";
import { useWallet } from "@/hooks/useWallet";

import { useSendClaims } from "./hooks/useSendClaims";
import { scannerQueryKeys } from "./lib/query-keys";
import { formatClock, formatLedger } from "./lib/roster-facts";
import { listClaims, readRoster, type QueuedClaim } from "./lib/scanner-store";
import type { SendStop } from "./lib/send-claims";

function stopSentence(stop: SendStop): string {
  switch (stop.kind) {
    case "declined":
      return "You declined in your wallet, so nothing more was sent. The rest are still waiting.";
    case "not-scanner":
      return "This wallet is not a scanner for this race. Connect the one the organiser added, then send again.";
    case "no-answer":
      return "The last one may have gone through. Send again: if it did, it moves to Refused for the organiser to check.";
    case "failed":
      return stop.message;
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function Row({
  claim,
  name,
  sendingNow,
}: {
  claim: QueuedClaim;
  name: string | null;
  sendingNow: boolean;
}) {
  let detail: string[];
  let badge;
  if (sendingNow) {
    detail = ["Sending"];
    badge = <Badge variant="muted">Now</Badge>;
  } else if (claim.status === "sent") {
    detail = ["Sent", ...(claim.ledger ? [`Ledger ${formatLedger(claim.ledger)}`] : [])];
    badge = <Badge variant="success">Done</Badge>;
  } else {
    detail = [...(name ? [name] : []), formatClock(claim.scannedAt)];
    badge = <Badge variant="muted">Waiting</Badge>;
  }

  return (
    <li className="flex items-center justify-between gap-4 border-b border-n-800 py-4 last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="text-xl tabular-nums">Bib {claim.bibNo}</span>
        <span className="flex gap-4 text-base text-n-300 tabular-nums">
          {detail.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </span>
      </div>
      {badge}
    </li>
  );
}

export function ClaimsPage({ eventId }: { eventId: number }) {
  const online = useOnline();
  const { isConnecting, connect } = useWallet();
  const sender = useSendClaims(eventId);

  const claims = useQuery({
    queryKey: scannerQueryKeys.claims(eventId),
    queryFn: () => listClaims(eventId),
    staleTime: 0,
  });
  const roster = useQuery({
    queryKey: scannerQueryKeys.roster(eventId),
    queryFn: async () => (await readRoster(eventId)) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const all = claims.data ?? [];
  const shown = all.filter((claim) => claim.status !== "refused");
  const waiting = all.filter((claim) => claim.status === "waiting").length;
  const refused = all.length - shown.length;
  const nameOf = (tokenId: number) =>
    roster.data?.entries.find((entry) => entry.tokenId === tokenId)?.nameFragment ?? null;

  const sentThisRun = Math.max(0, sender.runSize - waiting);
  const progress = sender.runSize > 0 ? sentThisRun / sender.runSize : 0;

  const title = sender.running
    ? `Sending ${plural(sender.runSize, "claim", "claims")}`
    : waiting > 0
      ? `${plural(waiting, "claim", "claims")} waiting`
      : "No claims waiting";

  const lead = sender.running
    ? "One approval each in your wallet, sent one after another."
    : !online
      ? "Saved on this phone. Send them once there is signal."
      : waiting > 0
        ? "Saved on this phone. Each one needs its own approval in your wallet."
        : "Every race pack handed over at this desk has been sent.";

  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-6 bg-n-950 px-5 py-6 text-paper">
      <div className="flex justify-between text-sm text-n-300">
        <Link href={`/scan/${eventId}`} className="underline-offset-4 hover:underline">
          Back to the desk
        </Link>
        <span>{online ? "Online" : "Offline"}</span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="heading-strong text-3xl">{title}</h1>
        <p className="text-lg text-n-300">{lead}</p>
      </header>

      {sender.running ? (
        <div
          role="progressbar"
          aria-label="Claims sent"
          aria-valuemin={0}
          aria-valuemax={sender.runSize}
          aria-valuenow={sentThisRun}
          className="h-1.5 w-full overflow-hidden rounded-full bg-n-800"
        >
          <div
            className="h-full origin-left bg-teal-400 transition-transform duration-200"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      ) : null}

      {sender.stop ? (
        <p role="alert" className="rounded-md border border-n-700 bg-n-900 px-4 py-3 text-base">
          {stopSentence(sender.stop)}
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul aria-label="Claims">
          {shown.map((claim) => (
            <Row
              key={claim.tokenId}
              claim={claim}
              name={nameOf(claim.tokenId)}
              sendingNow={sender.sendingToken === claim.tokenId}
            />
          ))}
        </ul>
      ) : null}

      {refused > 0 ? (
        <Link
          href={`/scan/${eventId}/flagged`}
          className="text-base text-danger-surface underline underline-offset-4"
        >
          {plural(refused, "claim was", "claims were")} refused
        </Link>
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        {waiting > 0 && online && !sender.running ? (
          sender.address ? (
            <Button size="lg" className="h-14 text-base" onClick={() => void sender.start()}>
              Send {plural(waiting, "claim", "claims")}
            </Button>
          ) : (
            <Button size="lg" className="h-14 text-base" onClick={() => void connect()} disabled={isConnecting}>
              {isConnecting ? "Connecting" : "Connect wallet to send"}
            </Button>
          )
        ) : null}
        <p className="text-base text-n-300">
          {sender.running
            ? "Keep this screen open until they finish. Anything not sent stays saved."
            : "Leaving this screen does not lose them. A refused claim is kept, never dropped."}
        </p>
      </div>
    </div>
  );
}
