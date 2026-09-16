/**
 * A number, and what it is out of.
 *
 * There used to be a thin bar under the number. Ancung dropped it on
 * 2026-09-14 after seeing it on every card of the dashboard and the race page:
 * the comparison it drew is already in the unit beside the figure ("of 500"),
 * and three bars in a row read as decoration rather than as a measurement.
 */
export function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-n-200 bg-paper p-4">
      <p className="text-xs text-n-500">{label}</p>
      <p className="numeric mt-1.5 text-2xl font-medium text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-n-500">{unit}</span> : null}
      </p>
    </div>
  );
}
