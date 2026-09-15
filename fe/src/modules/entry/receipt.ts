/**
 * What the entry receipt says (STE-21, mockup block 6). Pure, so a test can
 * prove what it leaves out.
 *
 * ## What it carries, and why
 *
 * The receipt code (the salt) is the point of it. With the runner's own name,
 * identity number and emergency phone, the code recomputes the identity
 * fingerprint stored on the race record, which proves the record is theirs
 * without depending on Sterun existing.
 *
 * ## What it never carries
 *
 * No name, identity number, email or phone, so a leaked receipt leaks nothing
 * personal. And never the check-in secret, which would let anyone who holds
 * the file show this runner's pass.
 */
import type { StoredEntry } from "@/lib/entry-store";
import { formatEventDate, formatPrice } from "@/utils/format";

export interface ReceiptLine {
  label: string;
  value: string;
  /** Set when the value is a link somebody can follow. */
  href?: string;
}

export interface Receipt {
  issuedOn: string;
  /** Empty when the bib is not known. */
  bibNo: string;
  headline: string;
  subline: string;
  lines: ReceiptLine[];
  /** The receipt code, in full. */
  code: string;
  fine: string;
}

export function buildReceipt(entry: StoredEntry, explorerBase: string): Receipt {
  const lines: ReceiptLine[] = [{ label: "Race record number", value: `#${entry.tokenId}` }];

  // Left out rather than printed blank when this device never recorded them.
  if (entry.racePack && entry.racePack.length > 0) {
    lines.push({ label: "Race pack", value: entry.racePack.join(", ") });
  }
  if (entry.paidStroops !== undefined && /^\d+$/.test(entry.paidStroops)) {
    lines.push({ label: "Paid", value: formatPrice(BigInt(entry.paidStroops)) });
  }

  lines.push({ label: "Wallet", value: entry.runner });
  lines.push({ label: "Identity fingerprint", value: entry.participantHash });

  // An entry found by the no-answer check has no hash, and a network with no
  // explorer has nowhere to link to.
  if (entry.txHash && explorerBase) {
    const href = `${explorerBase}/tx/${entry.txHash}`;
    lines.push({ label: "Transaction", value: href, href });
  }

  return {
    issuedOn: `Issued ${formatDay(entry.enteredAt)}`,
    bibNo: entry.bibNo >= 0 ? String(entry.bibNo) : "",
    headline: [entry.raceName, entry.distanceCode].filter(Boolean).join(" · "),
    subline: [
      /^\d+$/.test(entry.startsAt) ? formatEventDate(BigInt(entry.startsAt)) : "",
      entry.bibName ? `Bib name ${entry.bibName}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    lines,
    code: entry.salt,
    fine:
      "This receipt, together with the name, identity document number and emergency contact phone " +
      `you entered, lets anyone recompute the identity fingerprint above and confirm race record ` +
      `#${entry.tokenId} belongs to you. It does not contain those details.`,
  };
}

/** The receipt code as the page shows it before Show is pressed. */
export function maskCode(salt: string): string {
  return `${salt.slice(0, 8)} •••• •••• ${salt.slice(-8)}`;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
