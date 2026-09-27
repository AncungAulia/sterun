"use client";

/**
 * A phone that did not enter, and so has no secret to make codes from.
 *
 * Entering on a laptop and running with a phone is the ordinary case, not an
 * edge one, and so is a new phone or cleared site data. The wallet that owns
 * the record signs one message, the secret is written here, and the desk needs
 * no network after that.
 *
 * The race's facts are read in the same breath, because a secret with no race
 * name beside it is not a pass. What is deliberately not written is the
 * receipt code: it was shown once, on the device that entered, and inventing an
 * empty one here would let this phone look like it holds a receipt it does not.
 *
 * The wallet kit is imported on press, as `GetTestSusd` does: a static import
 * pulls the whole Stellar Wallets Kit into this screen's graph, and this is the
 * screen that has to open at a venue.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorNotice } from "@/components/feedback/ErrorNotice";
import { Button } from "@/components/ui/button";
import { WalletGate } from "@/components/wallet/WalletGate";
import { useWallet } from "@/hooks/useWallet";
import { ApiError } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/errors";
import { readClient } from "@/lib/chain/sterun";
import { saveEntry } from "@/lib/entry-store";
import { getEventSummary } from "@/lib/event/events";

import { fetchPass } from "../lib/pass-api";

/** What each refusal means to the person holding the phone. */
function sentenceFor(error: unknown): string {
  if (error instanceof ApiError && error.code === "forbidden") {
    return "Connect the wallet that entered this race, then try again.";
  }
  if (error instanceof ApiError && error.code === "no-pass") {
    return "This entry has no pass yet. Open it again in a minute, or check your receipt on the device you entered with.";
  }
  return friendlyError(error);
}

export function GetPassHere({ tokenId }: { tokenId: number }) {
  const address = useWallet((state) => state.address);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function getIt() {
    if (!address) return;
    setBusy(true);
    setProblem(null);
    try {
      const { signMessage } = await import("@/lib/wallet/kit");
      const [pass, record] = await Promise.all([
        fetchPass(tokenId, address, signMessage),
        readClient.recordOf(tokenId),
      ]);
      const summary = await getEventSummary(readClient, record.eventId);

      await saveEntry({
        eventId: record.eventId,
        categoryId: record.categoryId,
        tokenId,
        bibNo: record.bibNo,
        bibName: pass.bibName ?? "",
        raceName: summary.event.name,
        startsAt: summary.event.startsAt.toString(),
        distanceCode: summary.categories.find((c) => c.categoryId === record.categoryId)?.code ?? "",
        participantHash: record.participantHash,
        // Neither of these belongs to this phone: see the header.
        salt: "",
        txHash: "",
        totpSecret: pass.totpSecret,
        runner: address,
        enteredAt: new Date().toISOString(),
        state: record.state,
        claimedAt: record.claimedAt?.toString(),
      });

      // The page read an empty store a moment ago, so it is told to read again.
      void queryClient.invalidateQueries({ queryKey: ["stored-entry", tokenId] });
    } catch (error) {
      setProblem(sentenceFor(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WalletGate
      title="Connect your wallet to open your pass"
      description="Your pass belongs to the wallet that entered. Connect it and this phone can make your codes without a signal."
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-10">
        <h1 className="heading-strong text-2xl text-ink">Get your pass on this phone</h1>
        <p className="text-base text-n-600">
          This phone did not enter the race, so it has no codes yet. Sign one message and they are
          made here from then on, with no signal needed at the desk.
        </p>

        {problem ? <ErrorNotice title="We could not get your pass" detail={problem} /> : null}

        <Button onClick={() => void getIt()} disabled={busy}>
          {busy ? "Check your wallet" : "Get my pass"}
        </Button>
      </div>
    </WalletGate>
  );
}
