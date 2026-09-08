/**
 * The R2 file store and the SigV4 signer under it.
 *
 * ## How the signature is proven, given it is hand-written
 *
 * Three layers, because a signer that only agrees with itself proves nothing:
 *
 *   1. **A second implementation, written from the specification** and kept in
 *      this file. If the two disagree, one of them misread the spec. This is
 *      the same technique `docs/specs/verify.sh` already uses for the frozen
 *      hash and TOTP definitions — two reference implementations that must
 *      agree — so it is the project's existing answer to this question, not a
 *      new one.
 *   2. **Structural rules** the algorithm requires and a refactor could quietly
 *      break: header sorting, RFC 3986 encoding, the payload hash appearing in
 *      both the header and the canonical request.
 *   3. **R2 itself**, which is the only true known-answer test and cannot run
 *      in CI: a wrong signature is a 403 on the first request. That run is
 *      recorded in docs/deployments.md rather than pretended at here.
 *
 * The store's own tests use an injected `fetch`, so they assert what this code
 * sends and how it reads answers without touching the network.
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { R2FileStore, R2Error } from "../src/files/r2.js";
import {
  EMPTY_PAYLOAD_SHA256,
  amzDates,
  signRequest,
  uriEncode,
} from "../src/files/sigv4.js";
import { FileStoreError } from "../src/files/store.js";

const CREDS = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENGbPxRfiCYEXAMPLEKEY" };
const AT = new Date("2026-09-08T04:15:00.000Z");

// ---------------------------------------------------------------------------
// The independent implementation. Written from the AWS specification text, on
// purpose NOT by calling anything in src/. Kept short enough to audit by eye.
// ---------------------------------------------------------------------------

function referenceSignature(input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  payloadSha256: string;
  region: string;
  service: string;
  amzDate: string;
  secretAccessKey: string;
}): string {
  const url = new URL(input.url);
  const dateStamp = input.amzDate.slice(0, 8);

  const names = Object.keys(input.headers).map((n) => n.toLowerCase()).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${(input.headers[n] ?? input.headers[n.toLowerCase()] ?? "").trim()}\n`)
    .join("");

  const query = [...url.searchParams.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join("&");

  const canonicalRequest = [
    input.method,
    url.pathname.split("/").map(rfc3986).join("/"),
    query,
    canonicalHeaders,
    names.join(";"),
    input.payloadSha256,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    scope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const mac = (key: Buffer | string, data: string) =>
    createHmac("sha256", key).update(data, "utf8").digest();
  const key = mac(mac(mac(mac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), input.service), "aws4_request");
  return createHmac("sha256", key).update(stringToSign, "utf8").digest("hex");
}

/** Percent-encode everything outside the unreserved set. */
function rfc3986(value: string): string {
  return [...value]
    .map((c) =>
      /[A-Za-z0-9\-._~]/.test(c)
        ? c
        : [...Buffer.from(c, "utf8")]
            .map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`)
            .join(""),
    )
    .join("");
}

const signatureOf = (headers: Record<string, string>): string =>
  /Signature=([0-9a-f]{64})/.exec(headers.authorization ?? "")?.[1] ?? "";

// ---------------------------------------------------------------------------

describe("the signer agrees with an independent implementation", () => {
  it.each([
    ["a GET with no query", "GET", "https://acct.r2.cloudflarestorage.com/bucket/files/abc", EMPTY_PAYLOAD_SHA256],
    ["a PUT with a body hash", "PUT", "https://acct.r2.cloudflarestorage.com/bucket/files/abc", "a".repeat(64)],
    ["a HEAD", "HEAD", "https://acct.r2.cloudflarestorage.com/bucket/files/abc", EMPTY_PAYLOAD_SHA256],
  ])("matches on %s", (_label, method, url, payload) => {
    const signed = signRequest(
      { method: method as "GET", url, headers: {}, payloadSha256: payload },
      CREDS,
      AT,
    );

    const expected = referenceSignature({
      method,
      url,
      headers: {
        host: new URL(url).host,
        "x-amz-content-sha256": payload,
        "x-amz-date": amzDates(AT).amzDate,
      },
      payloadSha256: payload,
      region: "auto",
      service: "s3",
      amzDate: amzDates(AT).amzDate,
      secretAccessKey: CREDS.secretAccessKey,
    });

    expect(signatureOf(signed)).toBe(expected);
  });

  it("matches on a listing whose continuation token needs encoding", () => {
    // The case that makes RFC 3986 encoding load-bearing: a continuation token
    // is opaque base64 and routinely carries `+`, `/` and `=`.
    const query = new URLSearchParams({
      "list-type": "2",
      prefix: "files/",
      "continuation-token": "1/abc+def=ghi",
    });
    const url = `https://acct.r2.cloudflarestorage.com/bucket?${query.toString()}`;

    const signed = signRequest(
      { method: "GET", url, headers: {}, payloadSha256: EMPTY_PAYLOAD_SHA256 },
      CREDS,
      AT,
    );
    const expected = referenceSignature({
      method: "GET",
      url,
      headers: {
        host: "acct.r2.cloudflarestorage.com",
        "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256,
        "x-amz-date": amzDates(AT).amzDate,
      },
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      region: "auto",
      service: "s3",
      amzDate: amzDates(AT).amzDate,
      secretAccessKey: CREDS.secretAccessKey,
    });

    expect(signatureOf(signed)).toBe(expected);
  });
});

describe("signer structure", () => {
  it("sends the payload hash as a header as well as signing it", () => {
    const headers = signRequest(
      { method: "PUT", url: "https://a.example/b/c", headers: {}, payloadSha256: "b".repeat(64) },
      CREDS,
      AT,
    );
    expect(headers["x-amz-content-sha256"]).toBe("b".repeat(64));
    expect(headers.authorization).toContain("x-amz-content-sha256");
  });

  it("lists signed headers in sorted order", () => {
    const headers = signRequest(
      {
        method: "PUT",
        url: "https://a.example/b",
        headers: { "content-type": "image/png", "content-length": "12" },
        payloadSha256: EMPTY_PAYLOAD_SHA256,
      },
      CREDS,
      AT,
    );
    const signed = /SignedHeaders=([^,]+)/.exec(headers.authorization ?? "")?.[1];
    expect(signed).toBe("content-length;content-type;host;x-amz-content-sha256;x-amz-date");
  });

  it("changes the signature when any single input changes", () => {
    const base = { method: "GET" as const, url: "https://a.example/b", headers: {}, payloadSha256: EMPTY_PAYLOAD_SHA256 };
    const original = signatureOf(signRequest(base, CREDS, AT));

    expect(signatureOf(signRequest({ ...base, url: "https://a.example/c" }, CREDS, AT))).not.toBe(original);
    expect(signatureOf(signRequest({ ...base, payloadSha256: "c".repeat(64) }, CREDS, AT))).not.toBe(original);
    expect(signatureOf(signRequest(base, { ...CREDS, secretAccessKey: "other" }, AT))).not.toBe(original);
    expect(signatureOf(signRequest(base, CREDS, new Date("2026-09-09T04:15:00Z")))).not.toBe(original);
  });

  it("encodes the characters encodeURIComponent leaves alone", () => {
    // `!'()*` are unreserved to encodeURIComponent and reserved to SigV4. A
    // mismatch here is a 403 that reads like bad credentials.
    expect(uriEncode("a!b'c(d)e*f", false)).toBe("a%21b%27c%28d%29e%2Af");
    expect(uriEncode("a/b", false)).toBe("a/b");
    expect(uriEncode("a/b", true)).toBe("a%2Fb");
  });

  it("formats the timestamp the way the algorithm requires", () => {
    expect(amzDates(AT)).toEqual({ amzDate: "20260908T041500Z", dateStamp: "20260908" });
  });
});

// ---------------------------------------------------------------------------
// The store, over an injected fetch.
// ---------------------------------------------------------------------------

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("poster"),
]);
const PNG_SHA = createHash("sha256").update(PNG).digest("hex");

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

/** A fake R2: records what was sent, answers from a key/value map. */
function fakeR2(objects: Map<string, { bytes: Buffer; contentType: string }> = new Map()) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body ? { body: init.body as Uint8Array } : {}),
    });

    if (url.includes("list-type=2")) {
      const sizes = [...objects.values()]
        .map((o) => `<Contents><Size>${o.bytes.length}</Size></Contents>`)
        .join("");
      return new Response(`<ListBucketResult>${sizes}<IsTruncated>false</IsTruncated></ListBucketResult>`, { status: 200 });
    }

    const key = new URL(url).pathname.split("/").slice(2).join("/");
    if (method === "PUT") {
      objects.set(key, { bytes: Buffer.from(init?.body as Uint8Array), contentType: (init?.headers as Record<string, string>)["content-type"] ?? "" });
      return new Response("", { status: 200 });
    }
    const found = objects.get(key);
    if (!found) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    if (method === "HEAD") return new Response(null, { status: 200 });
    return new Response(new Uint8Array(found.bytes), {
      status: 200,
      headers: { "content-type": found.contentType },
    });
  }) as typeof globalThis.fetch;

  return { fetchImpl, calls, objects };
}

const storeWith = (fake: ReturnType<typeof fakeR2>, maxTotalBytes = 1024 * 1024) =>
  new R2FileStore({
    accountId: "acct",
    bucket: "sterun-files",
    credentials: CREDS,
    maxTotalBytes,
    fetch: fake.fetchImpl,
    now: () => AT,
  });

describe("positive", () => {
  it("stores the object under the sha256 of its bytes", async () => {
    const fake = fakeR2();
    const stored = await storeWith(fake).put(PNG, "image/png");

    expect(stored.sha256).toBe(PNG_SHA);
    expect(stored.created).toBe(true);
    expect([...fake.objects.keys()]).toEqual([`files/${PNG_SHA}`]);
  });

  it("signs the PUT with the body hash, which is the same number as the key", async () => {
    // Worth asserting because it is the one place two separate requirements —
    // the storage key and the SigV4 payload hash — resolve to one value.
    const fake = fakeR2();
    await storeWith(fake).put(PNG, "image/png");

    const put = fake.calls.find((c) => c.method === "PUT");
    expect(put?.headers["x-amz-content-sha256"]).toBe(PNG_SHA);
    expect(put?.url).toContain(`/sterun-files/files/${PNG_SHA}`);
  });

  it("stores the content type on the object rather than in the key", async () => {
    const fake = fakeR2();
    await storeWith(fake).put(PNG, "image/png");
    expect(fake.objects.get(`files/${PNG_SHA}`)?.contentType).toBe("image/png");
  });

  it("reads bytes and type back", async () => {
    const fake = fakeR2();
    const store = storeWith(fake);
    await store.put(PNG, "image/png");

    const got = await store.get(PNG_SHA);
    expect(got?.bytes.equals(PNG)).toBe(true);
    expect(got?.contentType).toBe("image/png");
  });

  it("sums sizes through ListObjectsV2", async () => {
    const fake = fakeR2();
    const store = storeWith(fake);
    await store.put(PNG, "image/png");
    await store.put(Buffer.from('{"a":1}'), "application/json");
    expect(await store.totalBytes()).toBe(PNG.length + 7);
  });
});

describe("idempotence", () => {
  it("does not re-upload bytes it already holds", async () => {
    const fake = fakeR2();
    const store = storeWith(fake);
    await store.put(PNG, "image/png");
    const again = await store.put(PNG, "image/png");

    expect(again.created).toBe(false);
    expect(again.sha256).toBe(PNG_SHA);
    expect(fake.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });
});

describe("negative", () => {
  it("answers undefined for a hash the bucket does not hold", async () => {
    expect(await storeWith(fakeR2()).get("f".repeat(64))).toBeUndefined();
  });

  it.each([
    ["a traversal", "../../etc/passwd"],
    ["uppercase hex", "A".repeat(64)],
    ["the wrong length", "abc"],
  ])("never sends a request for %s", async (_label, key) => {
    // The guard runs before the request is built, so a bad key costs no round
    // trip and cannot be interpolated into a URL at all.
    const fake = fakeR2();
    expect(await storeWith(fake).get(key)).toBeUndefined();
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a write that would exceed the ceiling", async () => {
    const fake = fakeR2();
    await expect(storeWith(fake, 4).put(PNG, "image/png")).rejects.toThrow(FileStoreError);
  });

  it("raises rather than reporting absence when R2 answers 500", async () => {
    const fetchImpl = (async () => new Response("<Error/>", { status: 500 })) as typeof globalThis.fetch;
    const store = new R2FileStore({
      accountId: "acct",
      bucket: "b",
      credentials: CREDS,
      maxTotalBytes: 1024,
      fetch: fetchImpl,
      now: () => AT,
    });
    await expect(store.get(PNG_SHA)).rejects.toThrow(R2Error);
  });

  it("REFUSES to serve an object whose stored type is not on the allow-list", async () => {
    // The bucket is not ours alone: the token that reaches it can write any
    // object with any content type. Re-checking on read is what stops a stray
    // `text/html` object being handed to a browser from our own origin.
    const objects = new Map([
      [`files/${PNG_SHA}`, { bytes: PNG, contentType: "text/html" }],
    ]);
    const fake = fakeR2(objects);
    await expect(storeWith(fake).get(PNG_SHA)).rejects.toThrow(/not one this service serves/);
  });

  it("keeps the R2 status code and body in the error, because 403 is ambiguous", async () => {
    const fetchImpl = (async () =>
      new Response("<Error><Code>SignatureDoesNotMatch</Code></Error>", { status: 403 })) as typeof globalThis.fetch;
    const store = new R2FileStore({
      accountId: "acct",
      bucket: "b",
      credentials: CREDS,
      maxTotalBytes: 1024,
      fetch: fetchImpl,
      now: () => AT,
    });
    await expect(store.put(PNG, "image/png")).rejects.toThrow(/403.*SignatureDoesNotMatch/s);
  });
});

describe("retrying what R2 says is temporary", () => {
  /**
   * These exist because of a 500 served to a real upload in production. R2
   * answered `InternalError` with the body "We encountered an internal error.
   * Please try again." — an instruction this store was ignoring, so a blip on
   * Cloudflare's side became a failed upload for an organiser.
   */
  const flaky = (failures: number, status: number) => {
    let calls = 0;
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("list-type=2")) {
        return new Response("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>", { status: 200 });
      }
      if ((init?.method ?? "GET") === "HEAD") return new Response(null, { status: 404 });
      calls += 1;
      return calls <= failures
        ? new Response("<Error><Code>InternalError</Code></Error>", { status })
        : new Response("", { status: 200 });
    }) as typeof globalThis.fetch;
    return { fetchImpl, puts: () => calls };
  };

  const storeOver = (fetchImpl: typeof globalThis.fetch, attempts = 3) =>
    new R2FileStore({
      accountId: "acct",
      bucket: "b",
      credentials: CREDS,
      maxTotalBytes: 1024 * 1024,
      fetch: fetchImpl,
      now: () => AT,
      attempts,
      sleep: async () => {}, // no real waiting in tests
    });

  it("succeeds when R2 fails once and then works", async () => {
    const f = flaky(1, 500);
    await expect(storeOver(f.fetchImpl).put(PNG, "image/png")).resolves.toMatchObject({
      created: true,
    });
    expect(f.puts()).toBe(2);
  });

  it("retries a 429, which is a rate limit and therefore temporary by definition", async () => {
    const f = flaky(1, 429);
    await expect(storeOver(f.fetchImpl).put(PNG, "image/png")).resolves.toMatchObject({
      created: true,
    });
  });

  it("gives up after the configured number of attempts rather than hanging on", async () => {
    const f = flaky(99, 500);
    await expect(storeOver(f.fetchImpl).put(PNG, "image/png")).rejects.toThrow(R2Error);
    expect(f.puts()).toBe(3);
  });

  it("does NOT retry a 403, because bad credentials do not improve with time", async () => {
    const f = flaky(99, 403);
    await expect(storeOver(f.fetchImpl).put(PNG, "image/png")).rejects.toThrow(/403/);
    expect(f.puts()).toBe(1);
  });

  it("does NOT retry a 404 on read — an absent object is an answer, not a failure", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    }) as typeof globalThis.fetch;
    expect(await storeOver(fetchImpl).get(PNG_SHA)).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("retries a refused connection too, not only an HTTP status", async () => {
    let calls = 0;
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("list-type=2")) {
        return new Response("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>", { status: 200 });
      }
      if ((init?.method ?? "GET") === "HEAD") return new Response(null, { status: 404 });
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response("", { status: 200 });
    }) as typeof globalThis.fetch;

    await expect(storeOver(fetchImpl).put(PNG, "image/png")).resolves.toMatchObject({ created: true });
    expect(calls).toBe(2);
  });

  it("marks a 5xx as transient and a 403 as not, which is what drives the 503", async () => {
    expect(new R2Error(500, "PUT x", "").transient).toBe(true);
    expect(new R2Error(429, "PUT x", "").transient).toBe(true);
    expect(new R2Error(403, "PUT x", "").transient).toBe(false);
  });

  it("waits the Retry-After R2 asked for instead of guessing", async () => {
    const waited: number[] = [];
    let calls = 0;
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("list-type=2")) {
        return new Response("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>", { status: 200 });
      }
      if ((init?.method ?? "GET") === "HEAD") return new Response(null, { status: 404 });
      calls += 1;
      return calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "2" } })
        : new Response("", { status: 200 });
    }) as typeof globalThis.fetch;

    const store = new R2FileStore({
      accountId: "acct",
      bucket: "b",
      credentials: CREDS,
      maxTotalBytes: 1024 * 1024,
      fetch: fetchImpl,
      now: () => AT,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await store.put(PNG, "image/png");
    expect(waited).toEqual([2000]);
  });
});

describe("edge", () => {
  it("pages through a truncated listing instead of stopping at the first page", async () => {
    let page = 0;
    const fetchImpl = (async (input: string | URL) => {
      if (!String(input).includes("list-type=2")) return new Response("", { status: 404 });
      page += 1;
      return page === 1
        ? new Response(
            "<ListBucketResult><Contents><Size>10</Size></Contents>" +
              "<IsTruncated>true</IsTruncated><NextContinuationToken>tok/en+1=</NextContinuationToken></ListBucketResult>",
            { status: 200 },
          )
        : new Response(
            "<ListBucketResult><Contents><Size>32</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>",
            { status: 200 },
          );
    }) as typeof globalThis.fetch;

    const store = new R2FileStore({
      accountId: "acct",
      bucket: "b",
      credentials: CREDS,
      maxTotalBytes: 1024,
      fetch: fetchImpl,
      now: () => AT,
    });
    expect(await store.totalBytes()).toBe(42);
    expect(page).toBe(2);
  });

  it("counts the listing once and then keeps its own total", async () => {
    const fake = fakeR2();
    const store = storeWith(fake);
    await store.totalBytes();
    await store.put(PNG, "image/png");
    await store.totalBytes();

    // One listing: the ceiling is an abuse bound, not an accounting system, and
    // a full listing per upload would make every upload O(bucket).
    expect(fake.calls.filter((c) => c.url.includes("list-type=2"))).toHaveLength(1);
  });
});
