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
}

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
}

export class R2FileStore implements FileStore {
  readonly #endpoint: string;
  readonly #bucket: string;
  readonly #credentials: SigV4Credentials;
  readonly #maxTotalBytes: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;
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

    const headers = signRequest(
      {
        method,
        url,
        headers: options.headers ?? {},
        payloadSha256: options.payloadSha256,
      },
      this.#credentials,
      this.#now(),
    );

    return this.#fetch(url, {
      method,
      headers,
      ...(options.body ? { body: new Uint8Array(options.body) } : {}),
    });
  }
}
