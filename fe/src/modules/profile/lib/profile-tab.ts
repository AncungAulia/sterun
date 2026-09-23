/**
 * The three sections of `/profile`, and how they live in the address.
 *
 * In the address rather than in component state, for the same reason the race
 * console does it: a pass is the thing a runner sends themselves, and a tab
 * held in state cannot be linked to, cannot be shared and makes Back leave the
 * page instead of returning to the section it came from.
 *
 * **Entries first, test money last** (Ancung, 2026-09-23, reversing the order
 * the redesign was asked for). Two reasons, and the second is the stronger:
 *
 *   - Test money only exists on testnet. A tab that disappears with the network
 *     cannot be the one a page opens on, or the default section changes shape
 *     the day Sterun moves to mainnet.
 *   - A runner opens this page for their pass, at a race pack desk, on race
 *     morning. The faucet is used once, in the first five minutes of a testnet
 *     wallet's life.
 *
 * No "use client": the route is a server component and imports `parseProfileTab`.
 */
export const PROFILE_TABS = [
  { id: "entries", label: "Your entries" },
  { id: "record", label: "Race record" },
  { id: "faucet", label: "Faucet" },
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

/**
 * The tabs actually drawn. On mainnet there are two, rather than three with one
 * greyed out: there is no test money there to explain the absence of.
 */
export function profileTabs(testnet: boolean): readonly (typeof PROFILE_TABS)[number][] {
  return testnet ? PROFILE_TABS : PROFILE_TABS.filter((tab) => tab.id !== "faucet");
}

/**
 * An unknown tab, and `?tab=faucet` off testnet, open Entries. A link written
 * down while Sterun was on testnet must still land somewhere that exists.
 */
export function parseProfileTab(value: string | string[] | undefined, testnet: boolean): ProfileTab {
  const first = Array.isArray(value) ? value[0] : value;
  const found = profileTabs(testnet).find((tab) => tab.id === first);
  return found ? found.id : "entries";
}

export function profileTabHref(tab: ProfileTab): string {
  return tab === "entries" ? "/profile" : `/profile?tab=${tab}`;
}
