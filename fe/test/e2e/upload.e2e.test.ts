// @vitest-environment node
/**
 * STE-17 e2e — publishing the details file, against the live backend.
 *
 * Opt-in, because typescript.yml deliberately touches no network:
 *
 *     STERUN_E2E=1 pnpm --filter fe test test/e2e
 *
 * What it proves that the unit tests cannot. Those stub `fetch`, so they pin
 * the shape this module sends and nothing about whether the server accepts it.
 * Here a real keypair takes a real nonce from `api-sterun.jameshub.fun`, signs
 * it, and uploads real bytes: header names, the base64 encoding of the
 * signature, the raw (not multipart) body, and the content-addressed url all
 * have to be right at once or this fails.
 *
 * A throwaway keypair, deliberately. The endpoint is authenticated but not
 * authorised against an event — anybody holding any Stellar keypair can upload,
 * which is what lets a first-time organiser publish before their event exists.
 * Nothing here needs funding, because nothing here touches the chain.
 *
 * The one thing it cannot cover is the wallet. A browser signs through Stellar
 * Wallets Kit, and whether a given wallet signs the raw nonce or wraps it first
 * is the wallet's business, not this module's. That has to be checked by
 * clicking Publish with Freighter connected.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { documentHash } from "@/lib/event-document";
import { uploadEventFile } from "@/lib/upload";

const live = process.env.STERUN_E2E === "1" ? describe : describe.skip;

live("publishing a details file against the live backend", () => {
  it(
    "stores the bytes and hands back the hash the chain would record",
    async () => {
      const keypair = Keypair.random();
      // Unique per run, so the first upload is genuinely a creation rather than
      // a hit on something a previous run left behind.
      const text = `${JSON.stringify({ name: "e2e", nonce: Date.now() }, null, 2)}\n`;
      const bytes = new TextEncoder().encode(text);
      const expected = await documentHash(text);

      const stored = await uploadEventFile({
        bytes,
        contentType: "application/json",
        address: keypair.publicKey(),
        expectedSha256: expected,
        sign: async (message) => Buffer.from(keypair.sign(Buffer.from(message))).toString("base64"),
      });

      // The store is content-addressed, so these are one fact: if the server
      // hashed different bytes from the ones we hashed, everything downstream
      // is wrong and unfixable once it is on chain.
      expect(stored.sha256).toBe(expected);
      expect(stored.url).toContain(stored.sha256);
      expect(stored.created).toBe(true);

      // Served, not merely stored. This is the same fetch the public event page
      // makes, so passing here is what makes "Published" mean something.
      const served = await fetch(stored.url);
      expect(served.ok).toBe(true);
      expect(await served.text()).toBe(text);
    },
    60_000,
  );

  it(
    "reports identical bytes as already stored rather than failing",
    async () => {
      const keypair = Keypair.random();
      const text = `${JSON.stringify({ name: "e2e-repeat", nonce: Date.now() }, null, 2)}\n`;
      const bytes = new TextEncoder().encode(text);
      const sign = async (message: string) =>
        Buffer.from(keypair.sign(Buffer.from(message))).toString("base64");
      const request = {
        bytes,
        contentType: "application/json",
        address: keypair.publicKey(),
        sign,
      } as const;

      const first = await uploadEventFile(request);
      // A fresh nonce is fetched per upload, which is the property being leaned
      // on here: a second call with the same keypair must not be a replay.
      const second = await uploadEventFile(request);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.url).toBe(first.url);
    },
    60_000,
  );

  it(
    "refuses a signature that does not match the address",
    async () => {
      // The negative case that matters: if this passed, the auth would be
      // decoration.
      const keypair = Keypair.random();
      const impostor = Keypair.random();

      await expect(
        uploadEventFile({
          bytes: new TextEncoder().encode('{"name":"e2e-bad"}\n'),
          contentType: "application/json",
          address: keypair.publicKey(),
          sign: async (message) =>
            Buffer.from(impostor.sign(Buffer.from(message))).toString("base64"),
        }),
      ).rejects.toMatchObject({ status: 401 });
    },
    60_000,
  );
});
