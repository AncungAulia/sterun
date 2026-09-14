"use client";

/**
 * The devices allowed to check runners in, and the only place one is added.
 *
 * Shaped like Entries and smaller: search and the one button above the card,
 * the table in it, no stat cards (three numbers about three rows would be
 * furniture).
 *
 * The list is the index's, which lags a signature by a poll, so what this tab
 * signed for is kept locally until the index agrees. Without that, a scanner
 * somebody just paid a signature for would vanish from the list they are
 * looking at, and the obvious reaction is to add it again.
 *
 * Added at and Scanned wait for STE-43: each column is drawn once any row
 * carries its field.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddScanner, useRemoveScanner } from "@/hooks/useOrganiser";
import { useRaceScanners } from "@/hooks/useRaceScanners";
import type { EventSummary } from "@/lib/events";
import { friendlyError } from "@/lib/errors";
import type { IndexedScanner } from "@/lib/scanners";
import { formatEventDate } from "@/utils/format";

const HEAD = "bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600";
const CELL = "border-b border-n-200 px-4 py-3 align-middle";

interface Row extends IndexedScanner {
  justAdded: boolean;
}

/** Why an address cannot be added, or `null` when it can. Checked before any signature. */
function refusal(address: string, organiser: string, listed: readonly string[]): string | null {
  if (address === organiser) {
    return "This is your own wallet. Paste the address of the phone that will scan.";
  }
  if (listed.includes(address)) return "This wallet can already check runners in for this race.";
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return "Paste a wallet address. It starts with G and is 56 characters long.";
  }
  return null;
}

export function ScannersTab({ summary }: { summary: EventSummary }) {
  const { eventId, organiser } = summary.event;
  const queryClient = useQueryClient();
  const scanners = useRaceScanners(eventId);

  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  if (scanners.isError) {
    return (
      <ErrorNotice
        title="We could not load the scanners"
        detail="This is a connection problem, not an empty list. Please try again."
        onRetry={() => void scanners.refetch()}
      />
    );
  }
  if (scanners.data === undefined) {
    return (
      <div
        role="status"
        aria-label="Loading scanners"
        className="h-48 animate-pulse rounded-lg bg-n-100"
      />
    );
  }

  const indexed = scanners.data;
  const rows: Row[] = [
    ...indexed.map((scanner) => ({ ...scanner, justAdded: false })),
    ...added
      .filter((address) => !indexed.some((scanner) => scanner.address === address))
      .map((address) => ({ address, addedLedger: 0, addedAt: null, scans: null, justAdded: true })),
  ].filter((row) => !removed.includes(row.address));

  const needle = query.trim().toUpperCase();
  const shown = needle === "" ? rows : rows.filter((row) => row.address.includes(needle));
  const showAddedAt = rows.some((row) => row.addedAt !== null);
  const showScans = rows.some((row) => row.scans !== null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["scanners", eventId] });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a wallet"
          aria-label="Search a wallet"
          className="w-full sm:w-72"
        />
        <Button onClick={() => setAdding(true)}>Add scanner</Button>
        <span className="ml-auto text-sm text-n-500">
          {rows.length === 1 ? "1 scanner" : `${rows.length} scanners`}
        </span>
      </div>

      <section className="overflow-hidden rounded-lg border border-n-200 bg-paper">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-ink">No scanner yet</p>
            <p className="mt-1 text-sm text-n-500">Nobody can check runners in on race day.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-n-500">No scanner matches</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>
                    Wallet
                  </th>
                  {showAddedAt ? (
                    <th scope="col" className={HEAD}>
                      Added at
                    </th>
                  ) : null}
                  {showScans ? (
                    <th scope="col" className={HEAD}>
                      Scanned
                    </th>
                  ) : null}
                  <th scope="col" className={HEAD}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {shown.map((row) => (
                  <tr key={row.address}>
                    <td className={`numeric break-all text-ink ${CELL}`}>
                      {row.address}
                      {row.justAdded ? (
                        <span className="ml-2 text-xs text-n-500">Just added</span>
                      ) : null}
                    </td>
                    {showAddedAt ? (
                      <td className={`whitespace-nowrap text-n-600 ${CELL}`}>
                        {row.addedAt === null ? "" : formatEventDate(row.addedAt)}
                      </td>
                    ) : null}
                    {showScans ? (
                      <td className={`numeric text-n-600 ${CELL}`}>{row.scans ?? ""}</td>
                    ) : null}
                    <td className={`w-px text-right whitespace-nowrap ${CELL}`}>
                      <button
                        type="button"
                        aria-label={`Remove ${row.address}`}
                        className="text-sm font-medium text-teal hover:underline"
                        onClick={() => setRemoving(row.address)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddScannerDialog
        open={adding}
        eventId={eventId}
        organiser={organiser}
        listed={rows.map((row) => row.address)}
        onClose={() => setAdding(false)}
        onAdded={async (address) => {
          setAdded((list) => [...list, address]);
          setRemoved((list) => list.filter((item) => item !== address));
          setAdding(false);
          await refresh();
        }}
      />

      <RemoveScannerDialog
        address={removing}
        eventId={eventId}
        onClose={() => setRemoving(null)}
        onRemoved={async (address) => {
          setRemoved((list) => [...list, address]);
          setAdded((list) => list.filter((item) => item !== address));
          setRemoving(null);
          await refresh();
        }}
      />
    </>
  );
}

function AddScannerDialog({
  open,
  eventId,
  organiser,
  listed,
  onClose,
  onAdded,
}: {
  open: boolean;
  eventId: number;
  organiser: string;
  listed: readonly string[];
  onClose: () => void;
  onAdded: (address: string) => Promise<void>;
}) {
  const { write, phase, isBusy, error, reset } = useAddScanner();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function close() {
    if (isBusy) return;
    setValue("");
    setProblem(null);
    reset();
    onClose();
  }

  async function submit() {
    const address = value.trim();
    const why = refusal(address, organiser, listed);
    setProblem(why);
    if (why) return;
    try {
      await write({ eventId, scanner: address });
      setValue("");
      reset();
      await onAdded(address);
    } catch {
      // `error` carries it into the dialog.
    }
  }

  const message = problem ?? (error ? friendlyError(error) : null);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a scanner</DialogTitle>
          <DialogDescription>
            Open Sterun on the phone that will do the scanning and copy its wallet address.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="G…"
          aria-label="Wallet address"
          autoComplete="off"
          spellCheck={false}
          disabled={isBusy}
        />
        {message ? (
          <p role="alert" className="text-sm text-danger">
            {message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={isBusy} onClick={() => void submit()}>
            {isBusy ? (phase === "signing" ? "Confirm in your wallet" : "Adding") : "Sign and add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveScannerDialog({
  address,
  eventId,
  onClose,
  onRemoved,
}: {
  address: string | null;
  eventId: number;
  onClose: () => void;
  onRemoved: (address: string) => Promise<void>;
}) {
  const { write, phase, isBusy, error, reset } = useRemoveScanner();

  function close() {
    if (isBusy) return;
    reset();
    onClose();
  }

  async function confirm() {
    if (address === null) return;
    try {
      await write({ eventId, scanner: address });
      reset();
      await onRemoved(address);
    } catch {
      // `error` carries it into the dialog.
    }
  }

  return (
    <Dialog open={address !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this scanner?</DialogTitle>
          <DialogDescription>
            This phone will no longer be able to check runners in for this race.
          </DialogDescription>
        </DialogHeader>
        <p className="numeric text-sm break-all text-ink">{address}</p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyError(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={isBusy} onClick={() => void confirm()}>
            {isBusy
              ? phase === "signing"
                ? "Confirm in your wallet"
                : "Removing"
              : "Sign and remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
