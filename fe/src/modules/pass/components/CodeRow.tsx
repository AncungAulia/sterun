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
        {code.split("").map((character, index) => (
          /*
            The key carries the code, not just the position. Keyed by position
            alone, React updates the text in place, the element is never
            replaced, and the animation never restarts: a roll nobody sees.

            Each character is hidden from a screen reader because the paragraph
            already carries the whole code as its name; six nodes would be read
            out one at a time.
          */
          <span
            key={`${code}-${index}`}
            data-testid="code-character"
            aria-hidden="true"
            className="pass-character"
            style={{ animationDelay: `${index * 25}ms` }}
          >
            {character}
          </span>
        ))}
      </p>
    </div>
  );
}
