/**
 * The file store, backed by Cloudflare R2.
 *
 * ## Why this exists
 *
 * `LocalFileStore` keeps bytes on one box's disk, which made a second API
 * instance impossible: replica two would answer 404 for every file replica one
 * holds. That was the single blocker in front of horizontal scaling, and this
 * removes it. Everything else about the feature is unchanged, because nothing
 * outside `FileStore` ever knew where bytes were kept — which is what the
 * interface was for.
 *
 * ## What deliberately does NOT change: the public URL
 *
 * Files are still served by this API at `/files/<sha256>`, not from a public R2
 * bucket or an R2 custom domain. That is the most consequential decision in
 * this file, so the reasons are written down:
 *
 *   - **The URL is committed on-chain, permanently.** `create_event` stores
 *     `uri` in contract storage and v1 is non-upgradeable. A URL pointing at a
 *     storage provider is a bet that we never change provider; a URL on our own
 *     domain survives the next migration, and there will be one.
 *   - **The security headers are ours to set.** These bytes are uploaded by
 *     anyone holding any keypair and served from the origin that also serves
 *     the PII vault. The `sandbox` CSP, the sniffed content type and the
 *     hash-derived filename all live in `routes/files.ts`. A bucket serving
 *     bytes directly answers with whatever the bucket is configured to say,
 *     configured somewhere `git log` cannot answer questions about.
 *   - **Cloudflare already caches the read path**, so the API is not in the hot
 *     path for repeats anyway.
 *
 * So R2 replaces where bytes live. It does not replace who serves them.
 *
 * ## The payload hash is free
 *
 * SigV4 requires the sha256 of the request body. Content addressing means we
 * have already computed exactly that number to derive the key. The two uses
 * are the same hash, so a PUT costs one sha256, not two.
 */
import { ALLOWED_CONTENT_TYPES, type AllowedContentType } from "./content-type.js";
import {
  EMPTY_PAYLOAD_SHA256,
  signRequest,
  uriEncode,
  type SigV4Credentials,
} from "./sigv4.js";
import { FileStoreError, hashBytes, type FileStore, type StoredFile } from "./store.js";

/**
 * Objects live under one prefix so the bucket can hold something else later
 * without the two becoming impossible to tell apart.
 */
const PREFIX = "files/";

/**
 * The key is the hash alone — no extension.
 *
 * `LocalFileStore` puts the extension in the filename because a directory entry
 * carries no type information. An S3 object does: the content type is stored
 * with the object and comes back on GET, so the extension would be a second
 * copy of a fact the store already holds, and two copies of a fact can differ.
 */
const keyFor = (sha256: string): string => `${PREFIX}${sha256}`;

export interface R2FileStoreOptions {
  readonly accountId: string;
  readonly bucket: string;
  readonly credentials: SigV4Credentials;
  /** See `LocalFileStoreOptions.maxTotalBytes`; the reasoning is identical. */
  readonly maxTotalBytes: number;
  /** Injectable so tests exercise this class without a network. */
  readonly fetch?: typeof globalThis.fetch;
  /** Injectable so a signature can be asserted against a fixed timestamp. */
  readonly now?: () => Date;
  /**
   * Attempts per operation, including the first. Three is deliberate: it covers
   * a single blip without turning a real outage into a request that hangs for
   * a minute before failing anyway.
   */
  readonly attempts?: number;
  /** Injectable so retry tests do not actually wait. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Statuses worth trying again, and nothing else.
 *
 * 5xx because R2 says so in its own error body — the InternalError it returns
 * reads "We encountered an internal error. Please try again." 429 because that
 * is a rate limit, which is by definition temporary. A 403 is bad credentials
 * and a 404 is a missing object; retrying either just spends time before
 * reporting the same thing.
 */
const isRetryable = (status: number): boolean => status === 429 || status >= 500;

/** Raised when R2 answers something this code cannot interpret as success. */
export class R2Error extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
    body: string,
  ) {
    // R2's error bodies are XML. The whole body is kept: it is the only thing
    // that distinguishes "wrong credentials" from "no such bucket", and both
    // arrive as a 403 often enough to matter.
    super(`R2 ${operation} failed with ${status}: ${body.slice(0, 400)}`);
    this.name = "R2Error";
  }

  /**
   * True when the caller should tell the client to try again rather than that
   * something is broken. Drives the 503 in `routes/files.ts`.
   */
  get transient(): boolean {
    return isRetryable(this.status);
  }
}

export class R2FileStore implements FileStore {
  readonly #endpoint: string;
  readonly #bucket: string;
  readonly #credentials: SigV4Credentials;
  readonly #maxTotalBytes: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;
  readonly #attempts: number;
  readonly #sleep: (ms: number) => Promise<void>;
  /**
   * Same caching reasoning as the local store, with one honest difference:
   * behind several replicas each process caches its own total, so the ceiling
   * is enforced per instance rather than globally. That is acceptable because
   * the ceiling is an abuse bound, not an accounting system — and R2's failure
   * mode when it is exceeded is a bill, not a full disk taking Postgres down.
   */
  #cachedTotal: number | undefined;

  constructor(options: R2FileStoreOptions) {
    this.#endpoint = `https://${options.accountId}.r2.cloudflarestorage.com`;
    this.#bucket = options.bucket;
    this.#credentials = options.credentials;
    this.#maxTotalBytes = options.maxTotalBytes;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => new Date());
    this.#attempts = options.attempts ?? 3;
    this.#sleep =
      options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  async put(
    bytes: Buffer,
    contentType: AllowedContentType,
  ): Promise<StoredFile & { created: boolean }> {
    const sha256 = hashBytes(bytes);

    // Already held: the same bytes are the same object. Checked before the
    // quota for the same reason as the local store — re-uploading something we
    // already have adds nothing, so refusing it when full would be a confusing
    // way to say "this is already stored".
    if (await this.#head(sha256)) {
      return { sha256, size: bytes.length, contentType, created: false };
    }

    const total = await this.totalBytes();
    if (total + bytes.length > this.#maxTotalBytes) {
      throw new FileStoreError(
        "store-full",
        `the file store is full (${total} of ${this.#maxTotalBytes} bytes used). ` +
          `Raise STERUN_FILES_MAX_BYTES — see be/OPERATIONS.md.`,
      );
    }

    const response = await this.#send("PUT", keyFor(sha256), {
      // The signed payload hash and the storage key are the same number.
      payloadSha256: sha256,
      body: bytes,
      headers: { "content-type": contentType, "content-length": String(bytes.length) },
    });
    if (!response.ok) {
      throw new R2Error(response.status, `PUT ${keyFor(sha256)}`, await response.text());
    }

    this.#cachedTotal = total + bytes.length;
    return { sha256, size: bytes.length, contentType, created: true };
  }

  async get(
    sha256: string,
  ): Promise<{ bytes: Buffer; contentType: AllowedContentType } | undefined> {
    // The same guard the local store applies, and for a reason that outlives
    // the filesystem: this value arrives from a URL path, and anything that is
    // not 64 hex characters has no business being interpolated into a request.
    if (!/^[0-9a-f]{64}$/.test(sha256)) return undefined;

    const response = await this.#send("GET", keyFor(sha256), {
      payloadSha256: EMPTY_PAYLOAD_SHA256,
    });
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new R2Error(response.status, `GET ${keyFor(sha256)}`, await response.text());
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    /**
     * The stored content type is re-checked against the allow-list before it is
     * handed back, rather than trusted because we wrote it.
     *
     * The bucket is not a private implementation detail we are the only writer
     * of: the token that reaches it can write any object with any content type,
     * and it is shared with whatever else is given that token later. Re-checking
     * costs one comparison and keeps `routes/files.ts` honest when it echoes
     * this value into a `Content-Type` response header.
     */
    const declared = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const contentType = ALLOWED_CONTENT_TYPES.find((allowed) => allowed === declared);
    if (!contentType) {
      throw new R2Error(
        200,
        `GET ${keyFor(sha256)}`,
        `stored object declares content type ${JSON.stringify(declared)}, which is not one this ` +
          `service serves. Refusing to hand it to a browser.`,
      );
    }

    return { bytes, contentType };
  }

  async totalBytes(): Promise<number> {
    if (this.#cachedTotal !== undefined) return this.#cachedTotal;

    let total = 0;
    let token: string | undefined;
    // Paginated: ListObjectsV2 returns at most 1000 keys, and a bucket that has
    // grown past that is exactly the one whose size matters.
    do {
      const query = new URLSearchParams({ "list-type": "2", prefix: PREFIX, "max-keys": "1000" });
      if (token) query.set("continuation-token", token);

      const response = await this.#send("GET", "", {
        payloadSha256: EMPTY_PAYLOAD_SHA256,
        query: query.toString(),
      });
      if (!response.ok) {
        throw new R2Error(response.status, "ListObjectsV2", await response.text());
      }

      const xml = await response.text();
      for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
        total += Number(match[1]);
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
        : undefined;
    } while (token);

    this.#cachedTotal = total;
    return total;
  }

  /** True when the object exists. Any non-404 failure is raised rather than read as absence. */
  async #head(sha256: string): Promise<boolean> {
    const response = await this.#send("HEAD", keyFor(sha256), {
      payloadSha256: EMPTY_PAYLOAD_SHA256,
    });
    if (response.status === 404) return false;
    if (response.ok) return true;
    throw new R2Error(response.status, `HEAD ${keyFor(sha256)}`, await response.text());
  }

  /**
   * One request, retried while R2 says the failure is its own and temporary.
   *
   * This exists because of a 500 served to a real upload: R2 answered
   * `InternalError` with the body "We encountered an internal error. Please try
   * again." — an explicit instruction this code was ignoring, turning a blip on
   * Cloudflare's side into a failed upload for an organiser.
   *
   * **Retrying is unusually safe here, and that is not luck.** Every operation
   * this store performs is idempotent by construction: PUT writes bytes at the
   * hash of those same bytes, so a duplicate write is the same write; GET, HEAD
   * and LIST change nothing. There is no operation whose repetition could
   * double anything, which is exactly the property that makes blind retries
   * dangerous elsewhere.
   *
   * The request is re-signed on each attempt rather than reusing the headers:
   * the signature covers `x-amz-date`, so a retry that crossed into the next
   * clock skew window would fail authentication for a reason that has nothing
   * to do with why it was retried.
   */
  async #send(
    method: "GET" | "PUT" | "HEAD" | "DELETE",
    key: string,
    options: {
      payloadSha256: string;
      body?: Buffer;
      headers?: Record<string, string>;
      query?: string;
    },
  ): Promise<Response> {
    const path = `/${this.#bucket}${key ? `/${uriEncode(key, false)}` : ""}`;
    const url = `${this.#endpoint}${path}${options.query ? `?${options.query}` : ""}`;
    const label = `${method} ${key || "(bucket)"}`;

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.#attempts; attempt += 1) {
      let response: Response;
      try {
        const headers = signRequest(
          { method, url, headers: options.headers ?? {}, payloadSha256: options.payloadSha256 },
          this.#credentials,
          this.#now(),
        );
        response = await this.#fetch(url, {
          method,
          headers,
          ...(options.body ? { body: new Uint8Array(options.body) } : {}),
        });
      } catch (e) {
        // A refused connection or a reset socket is the same class of problem
        // as a 500 and gets the same treatment.
        lastError = e;
        if (attempt === this.#attempts) throw e;
        await this.#sleep(backoffMs(attempt, undefined));
        continue;
      }

      if (!isRetryable(response.status) || attempt === this.#attempts) return response;

      // `Retry-After` is R2 telling us how long to wait; honouring it beats
      // guessing, and ignoring it on a 429 is how a rate limit gets worse.
      await this.#sleep(backoffMs(attempt, response.headers.get("retry-after")));
    }

    // Unreachable: the loop either returns or throws. Present so the compiler
    // does not have to be told to trust a comment.
    throw lastError ?? new Error(`R2 ${label} exhausted its attempts`);
  }
}

/**
 * Exponential, with jitter so a burst of clients that failed together does not
 * come back together. Capped: a request that has already failed twice should
 * report that, not sit for a minute first.
 */
function backoffMs(attempt: number, retryAfter: string | null | undefined): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5_000);
  }
  const base = Math.min(100 * 2 ** (attempt - 1), 2_000);
  return base + Math.floor(Math.random() * 100);
}
