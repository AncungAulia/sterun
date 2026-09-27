/**
 * Is a URL actually serving our app, or merely answering?
 *
 * A 200 is not the question. `sterun.xyz` answered 200 for weeks while it was
 * a Hostinger "Parked Domain" placeholder, and a rehearsal that reads 200 as
 * "the landing page is live" reports a deploy that has not happened. The
 * inverse bug is the one this module was written for: from 2026-09-23, when
 * STE-32 shipped, until 2026-09-25 the rehearsal's S.2 step carried the
 * sentence "STE-32 (Vercel deploy) is still Backlog" as a hardcoded note, so
 * every run told Ancung to redo a deploy she had already done.
 *
 * The rule both bugs break: measure the site, never assert a ticket's status.
 */

/** Placeholder pages that answer 200 while serving nothing of ours. */
const PLACEHOLDER =
  /Parked Domain|domain\s+(?:name\s+)?(?:is\s+)?for sale|domain parking|Future home of|Default Web Site Page/i;

export interface SiteProbe {
  /** HTTP status, or 0 when the request itself failed. */
  status: number;
  /** The response body, as far as it was read. */
  body: string;
}

export interface SiteVerdict {
  live: boolean;
  placeholder: boolean;
  /** One sentence for the evidence file, stating what was measured. */
  reason: string;
}

/**
 * Decide from a probe alone — no network here, so the rule is testable.
 * `live` requires a 2xx AND a body that is not a parking placeholder.
 */
export function verdictFor(url: string, probe: SiteProbe): SiteVerdict {
  const ok = probe.status >= 200 && probe.status < 300;
  const placeholder = PLACEHOLDER.test(probe.body);

  if (!probe.status) {
    return { live: false, placeholder: false, reason: `${url} could not be reached at all` };
  }
  if (!ok) {
    return { live: false, placeholder, reason: `${url} answers ${probe.status}, so it is not serving the app` };
  }
  if (placeholder) {
    return {
      live: false,
      placeholder: true,
      reason: `${url} answers ${probe.status} with a parking placeholder, not the app — a 200 here proves only that the domain resolves`,
    };
  }
  return { live: true, placeholder: false, reason: `${url} answers ${probe.status} and serves a real page` };
}
