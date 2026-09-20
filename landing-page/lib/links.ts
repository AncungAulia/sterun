/**
 * Every outbound destination the landing page uses, in one place.
 *
 * Contract addresses are copied from docs/deployments.md, which is the only
 * file updated when the contracts are redeployed. If they ever disagree,
 * deployments.md is right and this file is stale.
 */

/**
 * The web app, live at app.sterun.xyz (STE-32): `/` browses races, `/org` is
 * the organiser console. NEXT_PUBLIC_APP_URL still overrides it, for a preview
 * deployment pointed at a preview app.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.sterun.xyz";

export const X_URL = "https://x.com/sterunxyz";
export const REPO_URL = "https://github.com/AncungAulia/sterun";
/** Published on npm since STE-19, so the registry page rather than the source folder. */
export const SDK_URL = "https://www.npmjs.com/package/@sterunxyz/sdk";

const EXPLORER = "https://stellar.expert/explorer/testnet/contract";

/**
 * The v2 pair, the one be/ and fe/ run against. deployments.md gives these the
 * unqualified row names and labels the older pair "v1"; v1 is still alive on
 * chain but is history, and nothing should point at it.
 */
export const CONTRACTS = {
  eventRegistry: {
    id: "CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU",
    url: `${EXPLORER}/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`,
  },
  raceRecord: {
    id: "CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW",
    url: `${EXPLORER}/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW`,
  },
  susd: {
    id: "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
    url: `${EXPLORER}/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`,
  },
} as const;

/**
 * Anchors into this page. There is no second page, so nav is in-page.
 *
 * One line per section a reader would go back to, which is why Proof is not
 * among them: it is the contract block inside Problem, and it was standing in
 * for sections that had not been built. Keep this list and the footer's "This
 * page" column saying the same thing.
 */
export const SECTIONS = [
  { n: "01", label: "Home", href: "#top" },
  { n: "02", label: "Problem", href: "#problem" },
  { n: "03", label: "How it works", href: "#how-it-works" },
  { n: "04", label: "Product", href: "#product" },
  { n: "05", label: "Why Stellar", href: "#why-stellar" },
] as const;
