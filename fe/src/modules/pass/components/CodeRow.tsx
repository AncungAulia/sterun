/**
 * The manual fallback: six characters a runner reads out when a camera fails.
 *
 * Tabular figures and wide tracking, because these are read aloud one at a
 * time across a desk. The whole code carries one accessible name so a screen
 * reader says it once rather than spelling six separate nodes, and a leading
 * zero is part of the code rather than decoration (the spec's section 4.4).
 */
export function CodeRow({ code }: { code: string }) {
  return (
    <div className="text-center">
      <p className="text-sm text-n-600">Camera not working? Read these out</p>
      <p
        aria-label={`Check-in code ${code}`}
        className="numeric mt-1 text-3xl font-semibold tracking-[0.22em] text-ink"
      >
        {code}
      </p>
    </div>
  );
}
