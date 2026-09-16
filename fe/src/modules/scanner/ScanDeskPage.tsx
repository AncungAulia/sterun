"use client";

/**
 * `/scan/[eventId]`: the desk. S2 to S8.
 *
 * ## Everything here is local
 *
 * The roster and this phone's claims are read from IndexedDB, the code is
 * checked with an HMAC, and the only network call on this screen is the clock
 * check, which is optional. No wallet is needed to run the desk either: it
 * signs nothing until round 2 sends the claims.
 *
 * ## The order of a scan
 *
 * Read, decide, record, show. A HAND OVER writes its claim before the verdict
 * is on screen, so a pack handed over is a pack recorded even if the phone is
 * dropped in the same second, and the next scan of the same runner reads it.
 *
 * ## When the camera is not an option
 *
 * Refused, missing, or no decoder could load: the desk opens on manual entry
 * with a line saying why. Typing is the floor this screen never falls below.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/useOnline";

import { ClockBanner } from "./components/ClockBanner";
import { CameraFrame } from "./components/CameraFrame";
import { ManualEntry } from "./components/ManualEntry";
import { VerdictPanel } from "./components/VerdictPanel";
import { useCamera } from "./hooks/useCamera";
import { useClockDrift } from "./hooks/useClockDrift";
import { useQrReader } from "./hooks/useQrReader";
import { vibrateFor } from "./lib/haptics";
import type { ScannedCode } from "./lib/payload";
import { enqueueClaim, listClaims, readRoster } from "./lib/scanner-store";
import { verdictFor, type Presented, type Verdict } from "./lib/verdict";

const deskKeys = {
  roster: (eventId: number) => ["scanner", "roster", eventId] as const,
  claims: (eventId: number) => ["scanner", "claims", eventId] as const,
};

function queuedLabel(count: number): string {
  return `${count} queued`;
}

export function ScanDeskPage({ eventId }: { eventId: number }) {
  const online = useOnline();
  const queryClient = useQueryClient();

  const roster = useQuery({
    queryKey: deskKeys.roster(eventId),
    queryFn: async () => (await readRoster(eventId)) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const claims = useQuery({
    queryKey: deskKeys.claims(eventId),
    queryFn: () => listClaims(eventId),
    staleTime: 0,
  });

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [typing, setTyping] = useState(false);

  const camera = useCamera(roster.data != null);
  const clock = useClockDrift(roster.data ?? null);

  const decide = useCallback(
    async (presented: Presented) => {
      const current = roster.data;
      if (!current) return;

      const nowStep = Math.floor(Date.now() / 1000 / current.totp.stepSeconds);
      // Read fresh rather than from the cache: two scans a second apart must
      // see each other, and the cache is only as new as the last render.
      const recorded = await listClaims(eventId);
      const next = await verdictFor({ presented, roster: current, claims: recorded, nowStep });

      if (next.kind === "green") {
        await enqueueClaim({
          tokenId: next.entry.tokenId,
          bibNo: next.entry.bibNo,
          eventId,
          scannedAt: new Date().toISOString(),
          status: "waiting",
        });
        await queryClient.invalidateQueries({ queryKey: deskKeys.claims(eventId) });
      }

      vibrateFor(next.kind);
      setTyping(false);
      setVerdict(next);
    },
    [eventId, queryClient, roster.data],
  );

  const onRead = useCallback(
    (scanned: ScannedCode) => void decide({ via: "qr", ...scanned }),
    [decide],
  );

  const reader = useQrReader({
    videoRef: camera.videoRef,
    running: camera.state === "running",
    paused: verdict !== null || typing,
    onRead,
  });

  if (roster.isPending) {
    return <div role="status" aria-label="Opening the desk" className="flex flex-1 bg-n-950" />;
  }

  if (!roster.data) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-10">
        <h1 className="heading-strong text-2xl text-ink">No roster on this phone</h1>
        <p className="text-base text-n-600">
          This phone has not downloaded this race&apos;s roster, so it has nothing to check codes
          against. Download it while you have signal.
        </p>
        <Button asChild size="lg" className="h-14 text-base">
          <Link href="/scan">Pick a race</Link>
        </Button>
      </div>
    );
  }

  const current = roster.data;
  const waiting = (claims.data ?? []).filter((claim) => claim.status === "waiting").length;

  const cameraReason =
    camera.state === "denied"
      ? "The camera is not allowed for this site. Allow it in the browser settings to scan again."
      : camera.state === "absent"
        ? "This phone has no camera this page can use."
        : reader.state === "unavailable"
          ? "The QR reader could not load. Typing the code works the same."
          : undefined;
  const cameraUsable = cameraReason === undefined;
  const showManual = typing || (!cameraUsable && verdict === null);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-n-950 text-paper">
      {clock.tooFar && verdict === null ? (
        <ClockBanner
          driftSeconds={clock.driftSeconds}
          checking={clock.checking}
          onCheckAgain={clock.checkAgain}
        />
      ) : null}

      {verdict === null ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="truncate rounded-sm bg-n-800 px-3 py-1 text-sm text-n-100">
            {current.raceName}
          </span>
          <span className="flex shrink-0 gap-4 text-sm text-n-300">
            <span>{online ? "Online" : "Offline"}</span>
            <span className="tabular-nums">{queuedLabel(waiting)}</span>
          </span>
        </div>
      ) : null}

      {/*
        The camera stays mounted under everything. Its <video> holds the stream,
        and unmounting it for a verdict would leave the next scan looking at an
        empty element while the camera kept running for nobody. The verdict and
        the manual sheet cover it instead (M4), and the reader is paused while
        they do.
      */}
      <div className="relative flex flex-1 flex-col">
        <CameraFrame
          videoRef={camera.videoRef}
          onType={() => setTyping(true)}
          covered={verdict !== null || showManual}
        />

        {verdict !== null ? (
          <div className="absolute inset-0 z-10 flex flex-col">
            <VerdictPanel
              verdict={verdict}
              roster={current}
              waitingCount={waiting}
              onNext={() => setVerdict(null)}
              onType={() => {
                setVerdict(null);
                setTyping(true);
              }}
            />
          </div>
        ) : showManual ? (
          <div className="absolute inset-0 z-10 flex flex-col">
            <ManualEntry
              reason={cameraReason}
              onBack={cameraUsable ? () => setTyping(false) : undefined}
              onCheck={({ code, bibNo }) => void decide({ via: "typed", code, bibNo })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
