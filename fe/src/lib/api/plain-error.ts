/**
 * An error whose message was written for whoever is reading the screen.
 *
 * `lib/api/errors.ts` shows the message of one of these as it is, and replaces
 * everything else with a sentence of its own, because a library's wording is
 * written for a log. Without a marker it cannot tell the two apart.
 *
 * ## Why this is not in `lib/api/errors.ts`
 *
 * That file reads contract error codes, so it imports `@sterunxyz/sdk`, which
 * pulls the whole Stellar SDK in behind it. `lib/wallet/kit.ts` throws one of these
 * and has no other reason to carry that weight: adding the import there put
 * nearly two seconds on the wallet tests alone. A class with no dependencies is
 * cheap to import from anywhere, which is the point of it living by itself.
 *
 * So: throw from here, map in `lib/api/errors.ts`.
 */
export class PlainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlainError";
  }
}
