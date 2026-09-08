/**
 * AWS Signature Version 4, the subset R2 needs.
 *
 * ## Why this is hand-written rather than `@aws-sdk/client-s3`
 *
 * The SDK is the obvious answer and it is the wrong one here. This package has
 * SIX runtime dependencies, on purpose — no ORM, no migration framework, no
 * validation library — and `@aws-sdk/client-s3` brings dozens of transitive
 * packages plus its own middleware stack to perform four operations against one
 * bucket. The same reasoning already produced the ~60-line migrator in
 * `src/db/migrate.ts`.
 *
 * The risk of getting signing wrong is also unusually low, which is what makes
 * the trade acceptable. A signature that is off by one byte does not fail
 * quietly or insecurely: R2 answers `403 SignatureDoesNotMatch`, loudly, on the
 * first request. There is no failure mode here where a bug lets something
 * through that should not have been let through.
 *
 * The algorithm is a specification, not a judgement call, and is implemented
 * below in the order the AWS documentation states it:
 *
 *   1. canonical request  — method, path, query, headers, payload hash
 *   2. string to sign     — algorithm, timestamp, credential scope, hash of (1)
 *   3. signing key        — HMAC chain over date / region / service / "aws4_request"
 *   4. signature          — HMAC of (2) with (3)
 *
 * R2 specifics, confirmed against Cloudflare's own S3 API documentation rather
 * than from memory: the region is **`auto`**, the service is `s3`, and the
 * endpoint is `https://<account id>.r2.cloudflarestorage.com`.
 */
import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";
/** R2's region is always this. `us-east-1` and empty alias to it; `auto` is the real name. */
export const R2_REGION = "auto";
const S3_SERVICE = "s3";

export interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface SignableRequest {
  readonly method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** Absolute URL, including any query string. */
  readonly url: string;
  /** Headers to sign. `host`, `x-amz-date` and `x-amz-content-sha256` are added here. */
  readonly headers: Record<string, string>;
  /** sha256 of the body, lowercase hex. Empty body is the hash of the empty string. */
  readonly payloadSha256: string;
}

export const sha256Hex = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");

/** sha256 of zero bytes — the payload hash every GET, HEAD and DELETE carries. */
export const EMPTY_PAYLOAD_SHA256 = sha256Hex("");

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/**
 * RFC 3986 encoding, which is stricter than `encodeURIComponent`.
 *
 * `encodeURIComponent` leaves `!'()*` alone; SigV4 requires them encoded, and a
 * mismatch between what we sign and what we send is a 403 that looks like bad
 * credentials. Our own keys are hex and could skip this entirely — but a
 * continuation token from ListObjectsV2 is opaque base64 and routinely contains
 * characters that matter.
 */
export function uriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const char of value) {
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      out += char;
    } else if (char === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of Buffer.from(char, "utf8")) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

/** `20260908T041500Z` and `20260908`, which the signature needs in both forms. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Returns the headers to send, including `authorization`.
 *
 * The input headers are not mutated: the caller passes what it wants signed and
 * gets back the complete set, so there is no way to send a header that was not
 * part of the signature.
 */
export function signRequest(
  request: SignableRequest,
  credentials: SigV4Credentials,
  now: Date,
  /**
   * Defaulted to R2's values, and parameterised for one reason: it lets the
   * test suite run AWS's own published Signature Version 4 test vectors through
   * this exact code path. Without that, every assertion about the signature
   * would be this implementation agreeing with itself, which proves nothing.
   */
  scopeOf: { region: string; service: string } = { region: R2_REGION, service: S3_SERVICE },
): Record<string, string> {
  const url = new URL(request.url);
  const { amzDate, dateStamp } = amzDates(now);

  const headers: Record<string, string> = {
    ...request.headers,
    host: url.host,
    "x-amz-content-sha256": request.payloadSha256,
    "x-amz-date": amzDate,
  };

  // Canonical headers: lowercase names, trimmed values, sorted by name. The
  // signed-headers list must be the same set in the same order.
  const canonicalNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const lower: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    lower[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
  }
  const canonicalHeaders = canonicalNames.map((name) => `${name}:${lower[name]}\n`).join("");
  const signedHeaders = canonicalNames.join(";");

  // Path segments are encoded individually so `/` survives as a separator.
  const canonicalUri = url.pathname
    .split("/")
    .map((segment) => uriEncode(segment, true))
    .join("/");

  // Query parameters sorted by name, then by value for repeated names.
  const params: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => params.push([key, value]));
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const canonicalQuery = params
    .map(([key, value]) => `${uriEncode(key, true)}=${uriEncode(value, true)}`)
    .join("&");

  const canonicalRequest = [
    request.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    request.payloadSha256,
  ].join("\n");

  const scope = `${dateStamp}/${scopeOf.region}/${scopeOf.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, dateStamp), scopeOf.region), scopeOf.service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    authorization:
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
