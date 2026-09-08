/**
 * The upload and download endpoints, through the real server.
 *
 * No Postgres here on purpose: an upload needs no database and no chain, and a
 * test that demanded one would be asserting a dependency this feature does not
 * have.
 *
 * Two groups matter more than the rest. The auth group, because anyone holding
 * any keypair can upload and the signature is the only gate. And the "serving
 * other people's bytes" group, because these files come back out under the same
 * origin that serves the PII vault.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { ALLOWED_CONTENT_TYPES } from "../src/files/content-type.js";
import { LocalFileStore } from "../src/files/store.js";
import { buildServer } from "../src/server.js";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("poster"),
]);
const METADATA = Buffer.from(
  JSON.stringify({ name: "Borobudur 10K", location: "Magelang", instagram: "@borobudurrun" }),
);

/** Smallest thing that satisfies both the header and the trailer check. */
const WAIVER_PDF = Buffer.from(
  "%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

const organiser = Keypair.random();
const stranger = Keypair.random();

const sign = (kp: Keypair, nonce: string) =>
  Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64");

let root: string;
let app: FastifyInstance;
let challenges: ChallengeStore;

/** A fresh, spendable credential for `kp`. */
async function credentials(kp: Keypair): Promise<Record<string, string>> {
  const { nonce } = await challenges.issue(kp.publicKey());
  return {
    "x-sterun-address": kp.publicKey(),
    "x-sterun-nonce": nonce,
    "x-sterun-signature": sign(kp, nonce),
  };
}

async function upload(kp: Keypair, body: Buffer, contentType = "application/octet-stream") {
  return app.inject({
    method: "POST",
    url: "/events/files",
    headers: { ...(await credentials(kp)), "content-type": contentType },
    payload: body,
  });
}

function build(options: { maxTotalBytes?: number; publicBaseUrl?: string } = {}) {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "",
    PII_KEYS: "",
    ...(options.publicBaseUrl ? { STERUN_PUBLIC_BASE_URL: options.publicBaseUrl } : {}),
  });
  challenges = new ChallengeStore();
  return buildServer(config, {
    challenges,
    fileStore: new LocalFileStore({
      root,
      // Comfortably above the 5 MB per-file limit, so the ceiling only ever
      // fails a test that asked for it. The store-full case sets its own.
      maxTotalBytes: options.maxTotalBytes ?? 16 * 1024 * 1024,
    }),
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sterun-files-routes-"));
  app = build({ publicBaseUrl: "https://api-sterun.jameshub.fun" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe("positive", () => {
  it("stores a poster and answers with its address", async () => {
    const response = await upload(organiser, PNG, "image/png");
    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.sha256).toBe(createHash("sha256").update(PNG).digest("hex"));
    expect(body.size).toBe(PNG.length);
    expect(body.content_type).toBe("image/png");
    expect(body.created).toBe(true);
  });

  it("returns a URL that ends with the hash it also returns", async () => {
    // The two are one fact written twice. If they could disagree, the console
    // would have to pick one to put on-chain.
    const body = (await upload(organiser, PNG, "image/png")).json();
    expect(body.url).toBe(`https://api-sterun.jameshub.fun/files/${body.sha256}.png`);
  });

  it("stores the metadata JSON document the chain commits to", async () => {
    const body = (await upload(organiser, METADATA, "application/json")).json();
    expect(body.content_type).toBe("application/json");
    expect(body.url.endsWith(".json")).toBe(true);
  });

  it("serves the file back byte for byte", async () => {
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.png` });

    expect(fetched.statusCode).toBe(200);
    expect(fetched.rawPayload.equals(PNG)).toBe(true);
  });

  it("serves it without any credential, because the URL is public on-chain", async () => {
    const { url } = (await upload(organiser, METADATA, "application/json")).json();
    const path = new URL(url).pathname;
    expect((await app.inject({ method: "GET", url: path })).statusCode).toBe(200);
  });

  it("stores a waiver PDF, which is what the document has to be to be legible", async () => {
    const body = (await upload(organiser, WAIVER_PDF, "application/pdf")).json();
    expect(body.content_type).toBe("application/pdf");
    expect(body.url.endsWith(".pdf")).toBe(true);
  });

  it("serves a PDF sandboxed and with its own type, not as a download prompt", async () => {
    // Inline rather than attachment on purpose: this is a document somebody is
    // being asked to agree to, and making them download it first is hostile.
    // The sandbox CSP is what makes inline defensible.
    const { sha256 } = (await upload(organiser, WAIVER_PDF, "application/pdf")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.pdf` });

    expect(fetched.statusCode).toBe(200);
    expect(fetched.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(fetched.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(fetched.headers["content-disposition"]).toBe(`inline; filename="${sha256}.pdf"`);
    expect(fetched.rawPayload.equals(WAIVER_PDF)).toBe(true);
  });

  it("advertises the limits on /config so the console need not hardcode them", async () => {
    const config = (await app.inject({ method: "GET", url: "/config" })).json();
    expect(config.files.enabled).toBe(true);
    expect(config.files.maxBytes).toBe(5 * 1024 * 1024);
    expect(config.files.contentTypes).toContain("image/png");
    expect(config.files.contentTypes).toContain("application/pdf");
    expect(config.files.contentTypes).not.toContain("image/svg+xml");
  });
});

describe("idempotence", () => {
  it("gives the same URL for the same bytes and says nothing was created", async () => {
    const first = (await upload(organiser, PNG, "image/png")).json();
    const second = (await upload(organiser, PNG, "image/png")).json();

    expect(second.url).toBe(first.url);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("gives a different organiser the same URL for the same file", async () => {
    // Content addressing has no notion of ownership, and that is correct: two
    // events using the same stock poster are one stored file.
    const mine = (await upload(organiser, PNG, "image/png")).json();
    const theirs = (await upload(stranger, PNG, "image/png")).json();
    expect(theirs.url).toBe(mine.url);
  });

  it("changing one byte changes the URL", async () => {
    // The property that makes `metadata_hash` meaningful.
    const a = (await upload(organiser, METADATA, "application/json")).json();
    const edited = Buffer.from(METADATA.toString().replace("Magelang", "Magelanh"));
    const b = (await upload(organiser, edited, "application/json")).json();
    expect(b.url).not.toBe(a.url);
  });
});

describe("authentication", () => {
  it("refuses an upload with no credentials at all", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/events/files",
      headers: { "content-type": "image/png" },
      payload: PNG,
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a replayed nonce — one signature, one upload", async () => {
    const headers = { ...(await credentials(organiser)), "content-type": "image/png" };
    expect((await app.inject({ method: "POST", url: "/events/files", headers, payload: PNG })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/events/files", headers, payload: PNG })).statusCode).toBe(401);
  });

  it("accepts the SEP-53 signature a browser wallet sends", async () => {
    // The organiser console is the only client this endpoint was built for, and
    // it signs through a wallet, which means SEP-53 rather than the raw nonce
    // bytes every script here uses. If this route only took the raw form, the
    // console could never upload anything and the whole endpoint would be
    // reachable by curl alone.
    const { nonce } = await challenges.issue(organiser.publicKey());

    const response = await app.inject({
      method: "POST",
      url: "/events/files",
      headers: {
        "x-sterun-address": organiser.publicKey(),
        "x-sterun-nonce": nonce,
        "x-sterun-signature": Buffer.from(organiser.signMessage(nonce)).toString("base64"),
        "content-type": "image/png",
      },
      payload: PNG,
    });

    expect(response.statusCode).toBe(201);
  });

  it("refuses a signature from a different key than the nonce was issued to", async () => {
    const { nonce } = await challenges.issue(organiser.publicKey());
    const response = await app.inject({
      method: "POST",
      url: "/events/files",
      headers: {
        "x-sterun-address": organiser.publicKey(),
        "x-sterun-nonce": nonce,
        "x-sterun-signature": sign(stranger, nonce),
        "content-type": "image/png",
      },
      payload: PNG,
    });
    expect(response.statusCode).toBe(401);
  });

  it("stores nothing when the signature is refused", async () => {
    const sha256 = createHash("sha256").update(PNG).digest("hex");
    await app.inject({
      method: "POST",
      url: "/events/files",
      headers: { "content-type": "image/png" },
      payload: PNG,
    });
    expect((await app.inject({ method: "GET", url: `/files/${sha256}.png` })).statusCode).toBe(404);
  });
});

describe("what may be uploaded", () => {
  it("REFUSES an SVG, whatever the request calls it", async () => {
    // The case this endpoint would be dangerous without. Note the header says
    // image/png and it still loses.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const response = await upload(organiser, svg, "image/png");
    expect(response.statusCode).toBe(415);
    expect(response.json().error).toBe("unsupported-file-type");
  });

  it("refuses HTML labelled as an image", async () => {
    const response = await upload(organiser, Buffer.from("<html><script>x()</script></html>"), "image/png");
    expect(response.statusCode).toBe(415);
  });

  it("refuses a truncated PDF, so a broken waiver is caught at upload", async () => {
    const cut = WAIVER_PDF.subarray(0, WAIVER_PDF.length - 8);
    expect((await upload(organiser, cut, "application/pdf")).statusCode).toBe(415);
  });

  it("refuses an executable labelled as JSON", async () => {
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    expect((await upload(organiser, elf, "application/json")).statusCode).toBe(415);
  });

  it("says why, and says the header is not what decides", async () => {
    const response = await upload(organiser, Buffer.from("%PDF-1.7\n"), "application/json");
    expect(response.json().message).toMatch(/Content-Type header is not consulted/);
  });

  it("refuses an empty body", async () => {
    const response = await upload(organiser, Buffer.alloc(0), "image/png");
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("empty-body");
  });

  it("refuses a body over 5 MB before it is stored", async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const response = await upload(organiser, huge, "image/png");
    expect(response.statusCode).toBe(413);
  });

  it("accepts a file that is exactly at the size limit", async () => {
    const exact = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 - PNG.length)]);
    expect(exact.length).toBe(5 * 1024 * 1024);
    expect((await upload(organiser, exact, "image/png")).statusCode).toBe(201);
  });

  it("answers 507 rather than 500 when the store is full", async () => {
    await app.close();
    app = build({ maxTotalBytes: 4, publicBaseUrl: "https://api-sterun.jameshub.fun" });
    await app.ready();

    const response = await upload(organiser, PNG, "image/png");
    expect(response.statusCode).toBe(507);
    expect(response.json().error).toBe("store-full");
  });
});

describe("serving other people's bytes safely", () => {
  it("sends a sandbox CSP, so anything that slipped through cannot act", async () => {
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.png` });
    expect(fetched.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
  });

  it("sends nosniff, so a browser does not re-decide the type for itself", async () => {
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.png` });
    expect(fetched.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sends the SNIFFED content type, not the one the uploader claimed", async () => {
    // Uploaded as octet-stream; the bytes are a PNG; the response says PNG.
    const { sha256 } = (await upload(organiser, PNG, "application/octet-stream")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.png` });
    expect(fetched.headers["content-type"]).toMatch(/^image\/png/);
  });

  it("names the download by its hash, never by anything the uploader chose", async () => {
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.png` });
    expect(fetched.headers["content-disposition"]).toBe(`inline; filename="${sha256}.png"`);
  });

  it("caches immutably, which content addressing makes true rather than hopeful", async () => {
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    const fetched = await app.inject({ method: "GET", url: `/files/${sha256}.png` });
    expect(fetched.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(fetched.headers["etag"]).toBe(`"${sha256}"`);
  });
});

describe("negative", () => {
  it("answers 404 for a hash it does not hold", async () => {
    const response = await app.inject({ method: "GET", url: `/files/${"a".repeat(64)}.png` });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("not-found");
  });

  it.each([
    ["too short", "abc"],
    ["uppercase", "A".repeat(64)],
    ["not hex", "z".repeat(64)],
  ])("answers 400 for a file name that is %s", async (_label, name) => {
    const response = await app.inject({ method: "GET", url: `/files/${name}` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("bad-file-name");
  });

  it("cannot be walked out of the file directory", async () => {
    // Fastify normalises the path before routing, so this does not even reach
    // the handler — which is the outcome that matters. Asserted so a future
    // router change that stopped normalising would be caught here.
    const response = await app.inject({ method: "GET", url: "/files/..%2f..%2fetc%2fpasswd" });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.rawPayload.toString()).not.toContain("root:");
  });
});

describe("edge", () => {
  it("resolves by hash whatever extension the URL carries", async () => {
    // The extension is cosmetic: it makes the URL look like a file to humans
    // and to link previews. The hash is what resolves.
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    const asJpg = await app.inject({ method: "GET", url: `/files/${sha256}.jpg` });
    expect(asJpg.statusCode).toBe(200);
    // ...and the type served is still the true one.
    expect(asJpg.headers["content-type"]).toMatch(/^image\/png/);
  });

  it("resolves with no extension at all", async () => {
    const { sha256 } = (await upload(organiser, PNG, "image/png")).json();
    expect((await app.inject({ method: "GET", url: `/files/${sha256}` })).statusCode).toBe(200);
  });

  it("derives the origin from the request when none is configured", async () => {
    await app.close();
    app = build();
    await app.ready();

    const body = (await upload(organiser, PNG, "image/png")).json();
    expect(body.url).toMatch(/^http:\/\/[^/]+\/files\/[0-9a-f]{64}\.png$/);
  });

  it("prefers the configured origin over a forged Host header", async () => {
    // The URL this returns is one the organiser then commits on-chain, so a
    // Host header must not be able to point it at somebody else's domain.
    const response = await app.inject({
      method: "POST",
      url: "/events/files",
      headers: {
        ...(await credentials(organiser)),
        "content-type": "image/png",
        host: "evil.example",
        "x-forwarded-host": "evil.example",
      },
      payload: PNG,
    });
    expect(response.json().url.startsWith("https://api-sterun.jameshub.fun/")).toBe(true);
  });

  it("mounts /auth/challenge even with no vault and no database", async () => {
    // The STE-20 shape of bug: the upload authenticates, so a deployment that
    // only stores files still has to be able to issue a nonce.
    const response = await app.inject({
      method: "POST",
      url: "/auth/challenge",
      payload: { address: organiser.publicKey() },
    });
    expect(response.statusCode).toBe(200);
  });

  it("accepts a request body sent as ANY type on the allow-list", async () => {
    /**
     * The guard for a trap that already cost time once: Fastify refuses a
     * content type it has no parser for with its own 415, before this router
     * runs, so a type added to the allow-list and forgotten in the parser list
     * fails with an error mentioning neither. The parser list is derived from
     * the allow-list now; this proves the derivation still holds.
     *
     * The bytes are junk on purpose — 415 from OUR sniffer is the pass here,
     * because it means the request reached the sniffer at all. What must never
     * appear is the parser's own rejection.
     */
    for (const type of ALLOWED_CONTENT_TYPES) {
      const response = await upload(organiser, Buffer.from("not a real file of any type"), type);
      expect(response.statusCode, `content-type: ${type}`).toBe(415);
      expect(response.json().error, `content-type: ${type}`).toBe("unsupported-file-type");
    }
  });

  it("is described in the OpenAPI document", async () => {
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json();
    expect(doc.paths["/events/files"]).toBeDefined();
    expect(doc.paths["/files/{filename}"]).toBeDefined();
  });
});
