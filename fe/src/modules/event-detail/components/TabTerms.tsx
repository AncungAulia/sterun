/**
 * The rules, exactly as they were published.
 *
 * The one tab whose value is not the content but the fact that it cannot have
 * changed. Terms live inside the document, so the fingerprint on chain covers
 * them: a runner can prove the rules they agreed to are the rules still being
 * served, which is the thing no race website can offer.
 *
 * Rendered as plain text with its line breaks intact rather than parsed as
 * markdown. What the organiser typed is what was hashed, and reformatting it
 * would put a second interpretation between a reader and the bytes.
 */
export function TabTerms({ terms }: { terms: string | undefined }) {
  if (!terms) {
    return (
      <p className="text-base text-n-600">
        This race has not published terms and conditions.
      </p>
    );
  }

  return (
    <div className="max-w-2xl">
      <p className="text-base whitespace-pre-line text-n-700">{terms}</p>
    </div>
  );
}
