/**
 * A link to one transaction on the explorer.
 *
 * Shared because the same receipt is worth reading in two places: while the
 * run is happening, next to the step that just landed, and afterwards on the
 * Done step, where it is the only proof left that the signatures were real.
 *
 * Degrades to the truncated hash when no explorer is configured. A hash nobody
 * can click is still a hash somebody can paste, which beats hiding it.
 */
import { EXPLORER_BASE } from "@/lib/env";

export function Receipt({ txHash, label = "Receipt" }: { txHash: string; label?: string }) {
  if (!EXPLORER_BASE) {
    return <span className="numeric text-sm text-muted-foreground">{txHash.slice(0, 12)}</span>;
  }

  return (
    <a
      href={`${EXPLORER_BASE}/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-teal-500 underline underline-offset-4"
    >
      {label}
    </a>
  );
}
