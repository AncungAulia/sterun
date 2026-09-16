/**
 * The React Query keys the scanner screens share.
 *
 * In a file of their own, with no imports, because the desk and the refused
 * list must be able to read them without pulling in the claim sender, and the
 * sender pulls in the wallet. An offline screen that needs no wallet should not
 * load one.
 */
export const scannerQueryKeys = {
  roster: (eventId: number) => ["scanner", "roster", eventId] as const,
  claims: (eventId: number) => ["scanner", "claims", eventId] as const,
};
