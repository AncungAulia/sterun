/**
 * Every outbound destination the landing page uses, in one place.
 *
 * Contract addresses are copied from docs/deployments.md, which is the only
 * file updated when the contracts are redeployed. If they ever disagree,
 * deployments.md is right and this file is stale.
 */

/**
 * The web app. Set NEXT_PUBLIC_APP_URL at deploy time (STE-32); until that
 * project exists there is no URL to hardcode, and inventing one would ship a
 * dead button. The header hides its CTA rather than pointing nowhere.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export const X_URL = "https://x.com/sterunxyz";
export const REPO_URL = "https://github.com/AncungAulia/sterun";
export const SDK_URL = "https://github.com/AncungAulia/sterun/tree/main/sdk";

const EXPLORER = "https://stellar.expert/explorer/testnet/contract";

export const CONTRACTS = {
  eventRegistry: {
    id: "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64",
    url: `${EXPLORER}/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64`,
  },
  raceRecord: {
    id: "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4",
    url: `${EXPLORER}/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4`,
  },
  susd: {
    id: "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
    url: `${EXPLORER}/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`,
  },
} as const;

/** Anchors into this page. There is no second page, so nav is in-page. */
export const SECTIONS = [
  { n: "01", label: "Home", href: "#top" },
  { n: "02", label: "Problem", href: "#problem" },
  { n: "03", label: "How it works", href: "#how-it-works" },
  { n: "04", label: "Proof", href: "#proof" },
] as const;
