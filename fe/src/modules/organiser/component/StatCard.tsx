/**
 * A number with its comparison underneath.
 *
 * The bar is there because a number without context is unfinished: 4,680 sUSD
 * says nothing until you know it is 62% of what a sell-out pays. It is a bar
 * rather than a sentence because the sentence was cut, and an organiser reading
 * three cards does not want three explanations.
 *
 * `filled` is optional, and omitting it draws no bar at all rather than an
 * empty one. A track with nothing in it is a measurement that says zero, and
 * "there is nothing to compare this against" is a different statement.
 */
export function StatCard({
  label,
  value,
  unit,
  filled,
  tone = "teal",
}: {
  label: string;
  value: string;
  unit?: string;
  /** 0 to 1. Omit when there is nothing to compare against. */
  filled?: number;
  tone?: "teal" | "success";
}) {
  /*
    The one inline style this file is allowed: a percentage known only at
    runtime has no class to come from. It is clamped rather than trusted,
    because a quota read back as zero would otherwise send it to Infinity.
  */
  const width = filled === undefined ? null : `${Math.min(100, Math.max(0, filled * 100))}%`;

  return (
    <div className="rounded-lg border border-n-200 bg-paper p-4">
      <p className="text-xs text-n-500">{label}</p>
      <p className="numeric mt-1.5 text-2xl font-medium text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-n-500">{unit}</span> : null}
      </p>
      {width === null ? null : (
        <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-n-100">
          <div
            className={
              tone === "success" ? "h-full rounded-full bg-success" : "h-full rounded-full bg-teal"
            }
            style={{ width }}
          />
        </div>
      )}
    </div>
  );
}
