/**
 * Pure formatting helpers. No chain coupling, no React, no side effects.
 */

/**
 * `GABCD…WXYZ` — enough of both ends to compare two addresses by eye, which is
 * what people actually do when checking they connected the right account.
 */
export function shortAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
