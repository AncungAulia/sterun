/**
 * Where event metadata files live.
 *
 * ## Content-addressed, and that is the whole design
 *
 * The storage key IS the sha256 of the bytes. Not a random id with a hash
 * recorded next to it — the same number, used for both jobs.
 *
 * That single choice removes most of the ways this feature could go wrong:
 *
 *   - The URL cannot serve different content later. `create_event` commits
 *     `metadata_hash` on-chain and the event page refuses a file that does not
 *     match; with content addressing the two can never disagree in the first
 *     place, because a changed byte is a different URL.
 *   - Upload is idempotent. Sending the same poster twice is one stored file
 *     and the same URL, so a retry after a flaky connection is free and a
 *     double-click is not a leak.
 *   - There is no overwrite path to get wrong, and therefore no way for one
 *     organiser to replace another organiser's poster.
 *   - `Cache-Control: immutable` is honest rather than a hopeful guess.
 *
 * This is the property Ancung liked about IPFS ("CID itu sendiri hash konten,
 * jadi URL dan sidik jari jadi satu benda") without a pinning service, a
 * gateway, or a second network to be down.
 *
 * ## Why local disk first, and what that costs
 *
 * `LocalFileStore` needs no new account, no new secret in `be/.env`, and no
 * egress bill. Cloudflare already sits in front of this API (the tunnel from
 * STE-31), so responses are cached at the edge for free either way.
 *
 * The cost is honest and worth writing down: **files live on one box, and only
 * that box can serve them.** A second API replica would answer 404 for
 * everything the first one holds. STE-31 already notes a second replica is
 * untested; this makes it a blocker rather than a maybe. When that day comes,
 * implement `FileStore` against R2 (S3-compatible, and Cloudflare is already in
 * the stack) and change one line in `index.ts`. Nothing else in the codebase
 * knows where bytes are kept — which is the point of the interface.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ALLOWED_CONTENT_TYPES, EXTENSIONS, type AllowedContentType } from "./content-type.js";

/** sha256, lowercase hex — the shape of every key in this module. */
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface StoredFile {
  readonly sha256: string;
  readonly size: number;
  readonly contentType: AllowedContentType;
}

export interface FileStore {
  /**
   * Store the bytes and return their address.
   *
   * Idempotent by construction: the same bytes produce the same key, so a
   * repeat call is a no-op that returns the same answer. `created` says which
   * happened — useful for logs and for the caller to know it did not just pay
   * for storage twice, never for correctness.
   */
  put(bytes: Buffer, contentType: AllowedContentType): Promise<StoredFile & { created: boolean }>;
  /** The bytes, or `undefined` when nothing is stored under that hash. */
  get(sha256: string): Promise<{ bytes: Buffer; contentType: AllowedContentType } | undefined>;
  /** Total bytes held, for the quota check. */
  totalBytes(): Promise<number>;
}

/**
 * Refused rather than stored. Carries the HTTP status so the route does not
 * have to re-derive it from the message.
 */
export class FileStoreError extends Error {
  constructor(
    readonly code: "store-full",
    message: string,
  ) {
    super(message);
    this.name = "FileStoreError";
  }
}

/** The sha256 of these bytes, as lowercase hex. */
export const hashBytes = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Two levels of 2 hex characters, then the full hash:
 *
 *   ab/cd/abcd…ef.png
 *
 * A single flat directory with tens of thousands of entries is slow to list on
 * most filesystems and unpleasant to look at over SSH when something has gone
 * wrong. Fanning out by the first four characters keeps any one directory
 * small. The full hash stays in the filename so a file found by itself is
 * still self-identifying.
 */
export const pathForHash = (root: string, sha256: string, extension: string): string =>
  join(root, sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${extension}`);

export interface LocalFileStoreOptions {
  /** Directory that holds the tree. Created on first write. */
  readonly root: string;
  /**
   * Hard ceiling on everything stored, in bytes.
   *
   * This is what bounds growth in the absence of a sweeper. Anyone with a
   * wallet signature can upload, and a wallet keypair is free to generate, so
   * per-address limits alone do not bound anything — the ceiling does. Hitting
   * it is a 507 and an operator problem, which is the right place for it to
   * surface: better a loud refusal than a full disk taking Postgres down with
   * it.
   */
  readonly maxTotalBytes: number;
}

export class LocalFileStore implements FileStore {
  readonly #root: string;
  readonly #maxTotalBytes: number;
  /**
   * Cached total, so the quota check is not a directory walk per upload.
   * `undefined` until the first walk; kept current by `put`, which is the only
   * thing in this process that adds bytes.
   */
  #cachedTotal: number | undefined;

  constructor(options: LocalFileStoreOptions) {
    this.#root = options.root;
    this.#maxTotalBytes = options.maxTotalBytes;
  }

  async put(
    bytes: Buffer,
    contentType: AllowedContentType,
  ): Promise<StoredFile & { created: boolean }> {
    const sha256 = hashBytes(bytes);
    const path = pathForHash(this.#root, sha256, EXTENSIONS[contentType]);

    // Already held. Return before the quota check on purpose: re-uploading a
    // file we already have adds nothing, and refusing it once the store is
    // full would be a confusing way to say "this is already stored".
    if (await exists(path)) {
      return { sha256, size: bytes.length, contentType, created: false };
    }

    const total = await this.totalBytes();
    if (total + bytes.length > this.#maxTotalBytes) {
      throw new FileStoreError(
        "store-full",
        `the file store is full (${total} of ${this.#maxTotalBytes} bytes used). ` +
          `Raise STERUN_FILES_MAX_BYTES or free space — see be/OPERATIONS.md.`,
      );
    }

    await mkdir(dirname(path), { recursive: true });
    // `flag: "wx"` — fail if it appeared between the check above and now.
    // Two uploads of the same file racing is not an error worth surfacing:
    // whoever lost has exactly the bytes they wanted already on disk.
    try {
      await writeFile(path, bytes, { flag: "wx" });
      this.#cachedTotal = total + bytes.length;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      return { sha256, size: bytes.length, contentType, created: false };
    }

    return { sha256, size: bytes.length, contentType, created: true };
  }

  async get(
    sha256: string,
  ): Promise<{ bytes: Buffer; contentType: AllowedContentType } | undefined> {
    // Guard before touching the filesystem. The hash reaches here from a URL
    // path, and a value that is not 64 hex characters has no business being
    // joined onto a path at all — this is what stops `../../etc/passwd` from
    // ever becoming a filename, rather than any sanitising of the input.
    if (!SHA256_PATTERN.test(sha256)) return undefined;

    for (const contentType of ALLOWED_CONTENT_TYPES) {
      const path = pathForHash(this.#root, sha256, EXTENSIONS[contentType]);
      try {
        return { bytes: await readFile(path), contentType };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
    }
    return undefined;
  }

  async totalBytes(): Promise<number> {
    if (this.#cachedTotal !== undefined) return this.#cachedTotal;
    this.#cachedTotal = await walkSize(this.#root);
    return this.#cachedTotal;
  }
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/** Sum of every regular file under `dir`. A missing directory is 0, not an error. */
async function walkSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await walkSize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}
