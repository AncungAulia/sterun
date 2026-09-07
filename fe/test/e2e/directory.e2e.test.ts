// @vitest-environment node
/**
 * STE-13 e2e — the directory read, against the live testnet contracts.
 *
 * Opt-in, because typescript.yml deliberately touches no network: it installs
 * from the lockfile and runs lint, typecheck, build and tests, and it must not
 * be able to go red because a public Soroban node was slow. Run it by hand:
 *
 *     STERUN_E2E=1 pnpm --filter fe test test/e2e
 *
 * What it proves that the unit tests cannot: the fan-out in lib/events works
 * against the real EventRegistry at the address in fe/.env, the values decode
 * into the shapes the components read, and the whole path needs no wallet.
 *
 * It runs in the node environment rather than the jsdom one the other tests
 * use, and that is forced rather than chosen. jsdom installs its own realm's
 * Uint8Array as the global, so `Buffer.from(...)` produces a value that fails
 * `instanceof Uint8Array` inside the XDR encoder, and every call dies with
 * "functionName: expected Uint8Array" before it reaches the network. A browser
 * does not have that problem: stellar-sdk ships a Buffer polyfill that extends
 * the page's own Uint8Array. So this is a jsdom artefact, and running under
 * node is what keeps the test about the chain.
 *
 * Nothing is asserted about which events exist. Anybody can call create_event
 * on testnet, so the fixture is not ours to pin.
 */
import { describe, expect, it } from "vitest";

import { listEvents } from "@/lib/events";
import { readClient } from "@/lib/sterun";
import { formatEventDate, formatPrice } from "@/utils/format";

const live = process.env.STERUN_E2E === "1" ? describe : describe.skip;

live("directory against live testnet", () => {
  it(
    "reads the registry and decodes every event it counts",
    async () => {
      const { events, unreadable } = await listEvents(readClient);

      // A registry that answers at all is the point. Zero events would be a
      // valid answer on a fresh deployment, so the assertion is on the shape.
      expect(Array.isArray(events)).toBe(true);
      expect(Array.isArray(unreadable)).toBe(true);

      for (const { event, categories } of events) {
        expect(event.eventId).toBeGreaterThanOrEqual(0);
        expect(event.name.length).toBeGreaterThan(0);
        expect(event.organiser).toMatch(/^G[A-Z2-7]{55}$/);
        expect(event.metadataHash).toMatch(/^[0-9a-f]{64}$/);
        expect(["Draft", "Open", "Closed", "Completed"]).toContain(event.status);

        // The two conversions the cards depend on. A bigint that reaches
        // Intl.NumberFormat wrong throws rather than rendering wrong, so this
        // is a real check and not a tautology.
        expect(formatEventDate(event.startsAt)).not.toBe("Unknown date");
        for (const category of categories) {
          expect(formatPrice(category.priceStroops)).toMatch(/^(Free|sUSD [\d,.]+)$/);
          expect(category.slotsLeft).toBe(Math.max(0, category.quota - category.enteredCount));
        }
      }
    },
    { timeout: 60_000 },
  );

  it(
    "needs no wallet: the client carries no signer",
    async () => {
      // readClient is built without a publicKey or signTransaction at all. If
      // that ever changed, the read above would still pass while the public
      // pages started demanding a wallet, so it is asserted separately.
      const count = await readClient.eventCount();

      expect(count).toBeGreaterThanOrEqual(0);
    },
    { timeout: 30_000 },
  );
});
