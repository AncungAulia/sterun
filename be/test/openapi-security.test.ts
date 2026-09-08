/**
 * The OpenAPI document must agree with what the API actually enforces.
 *
 * Not a list of paths kept in step by hand — that is the thing that goes stale.
 * Instead the check is a cross-examination: call every endpoint the document
 * describes with NO credentials, and if it answers 401, the document has to
 * say so. A route added later is covered without touching this file.
 *
 * The bug that motivated it: `securitySchemes` has been in the document since
 * STE-20, describing the wallet-signature handshake in detail, and not one
 * route referenced it. Five endpoints demanded a signature while the document
 * said they were open. Anyone generating a client from that spec would send no
 * credentials and get a 401 with nothing in the document pointing at why.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { ChainReader } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import { LocalFileStore } from "../src/files/store.js";
import { buildServer } from "../src/server.js";
import { ADDRESSES } from "./helpers/addresses.js";
import { FakeChain } from "./helpers/fake-chain.js";
import type { Vault } from "../src/vault.js";

/** Placeholders that satisfy the path patterns; nothing is expected to exist. */
const SAMPLES: Record<string, string> = {
  eventId: "0",
  tokenId: "0",
  id: "00000000-0000-0000-0000-000000000000",
  address: Keypair.random().publicKey(),
  filename: "a".repeat(64),
};

const fill = (path: string) =>
  path.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = SAMPLES[key];
    if (!value) throw new Error(`openapi path parameter {${key}} has no sample value`);
    return value;
  });

let app: FastifyInstance;

beforeAll(async () => {
  const chain = new FakeChain(ADDRESSES);
  /**
   * Every router mounted at once, which is the only way this check sees the
   * whole surface. The pool and vault are never reached: an unauthenticated
   * request is refused before the handler touches them, and any route that did
   * reach them would fail loudly here rather than pass quietly.
   */
  app = buildServer(loadConfig({ NODE_ENV: "test" }), {
    pool: {} as never,
    vault: {} as unknown as Vault,
    reader: new ChainReader(chain, ADDRESSES),
    challenges: new ChallengeStore(),
    fileStore: new LocalFileStore({ root: "/tmp/sterun-openapi-check", maxTotalBytes: 1 }),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("the document matches what the API enforces", () => {
  it("declares a security scheme for the wallet signature", async () => {
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json();
    expect(doc.components.securitySchemes.walletSignature).toBeDefined();
  });

  it("every endpoint that refuses an anonymous caller says so in the document", async () => {
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json();

    const undeclared: string[] = [];
    for (const [path, operations] of Object.entries(doc.paths as Record<string, object>)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!["get", "post", "put", "delete", "patch"].includes(method)) continue;

        const response = await app.inject({
          method: method.toUpperCase() as "GET",
          url: fill(path),
          // A body shaped like nothing in particular. A 400 for a bad body is
          // fine — this only cares about 401, which is decided before the body
          // is looked at.
          ...(method === "post" ? { headers: { "content-type": "application/json" }, payload: {} } : {}),
        });

        if (response.statusCode !== 401) continue;
        const declared = (operation as { security?: unknown[] }).security;
        if (!declared || declared.length === 0) {
          undeclared.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    // Named in the failure rather than counted, so a break says which route to
    // open rather than that a number moved.
    expect(undeclared).toEqual([]);
  });

  it("never serves an anonymous caller on an endpoint it marks as secured", async () => {
    /**
     * The opposite mistake, and a worse one for a reader: a document that
     * demands credentials for something open teaches people to send them
     * everywhere.
     *
     * The assertion is "does not succeed", not "answers 401", because Fastify
     * validates the body BEFORE the handler runs — so an anonymous POST with a
     * junk body gets 400 first. That ordering is fine here: the body schema is
     * published in this very document, so there is nothing to learn by probing
     * it. What would matter is a secured endpoint returning 2xx to someone with
     * no credentials, and that is what this catches.
     */
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json();

    const servedAnonymously: string[] = [];
    for (const [path, operations] of Object.entries(doc.paths as Record<string, object>)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!["get", "post"].includes(method)) continue;
        const declared = (operation as { security?: unknown[] }).security;
        if (!declared || declared.length === 0) continue;

        const response = await app.inject({
          method: method.toUpperCase() as "GET",
          url: fill(path),
          ...(method === "post" ? { headers: { "content-type": "application/json" }, payload: {} } : {}),
        });
        if (response.statusCode < 400) servedAnonymously.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(servedAnonymously).toEqual([]);
  });
});
