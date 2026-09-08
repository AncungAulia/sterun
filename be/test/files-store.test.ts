/**
 * The content-addressed store.
 *
 * The claim under test is the one the whole feature rests on: the key IS the
 * hash, so a URL cannot come to hold different bytes, and storing the same file
 * twice is the same file once.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FileStoreError,
  LocalFileStore,
  hashBytes,
  pathForHash,
} from "../src/files/store.js";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("some poster bytes"),
]);
const JSON_DOC = Buffer.from('{"name":"Borobudur 10K"}');

let root: string;
let store: LocalFileStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sterun-files-"));
  store = new LocalFileStore({ root, maxTotalBytes: 1024 * 1024 });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("positive", () => {
  it("stores a file under the sha256 of its bytes", async () => {
    const expected = createHash("sha256").update(PNG).digest("hex");
    const stored = await store.put(PNG, "image/png");

    expect(stored.sha256).toBe(expected);
    expect(stored.size).toBe(PNG.length);
    expect(stored.created).toBe(true);
  });

  it("reads back exactly the bytes that went in", async () => {
    const { sha256 } = await store.put(PNG, "image/png");
    const found = await store.get(sha256);

    expect(found?.bytes.equals(PNG)).toBe(true);
    expect(found?.contentType).toBe("image/png");
  });

  it("keeps two different files apart", async () => {
    const a = await store.put(PNG, "image/png");
    const b = await store.put(JSON_DOC, "application/json");

    expect(a.sha256).not.toBe(b.sha256);
    expect((await store.get(a.sha256))?.contentType).toBe("image/png");
    expect((await store.get(b.sha256))?.contentType).toBe("application/json");
  });

  it("fans the tree out by the first four hex characters", async () => {
    // Not cosmetic: one flat directory with tens of thousands of entries is
    // slow to list and miserable to inspect over SSH.
    const { sha256 } = await store.put(PNG, "image/png");
    const first = await readdir(root);
    expect(first).toEqual([sha256.slice(0, 2)]);
    const second = await readdir(join(root, sha256.slice(0, 2)));
    expect(second).toEqual([sha256.slice(2, 4)]);
  });

  it("counts what it holds", async () => {
    await store.put(PNG, "image/png");
    await store.put(JSON_DOC, "application/json");
    expect(await store.totalBytes()).toBe(PNG.length + JSON_DOC.length);
  });
});

describe("idempotence", () => {
  it("returns the same address for the same bytes, and says it created nothing", async () => {
    const first = await store.put(PNG, "image/png");
    const second = await store.put(PNG, "image/png");

    expect(second.sha256).toBe(first.sha256);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("does not store the same bytes twice", async () => {
    await store.put(PNG, "image/png");
    await store.put(PNG, "image/png");
    expect(await store.totalBytes()).toBe(PNG.length);
  });

  it("survives two concurrent uploads of the same file", async () => {
    // The window between "does it exist" and "write it" is real. Losing that
    // race is not an error: the loser's bytes are already on disk.
    const outcomes = await Promise.all([
      store.put(PNG, "image/png"),
      store.put(PNG, "image/png"),
      store.put(PNG, "image/png"),
    ]);

    const hashes = new Set(outcomes.map((o) => o.sha256));
    expect(hashes.size).toBe(1);
    expect(outcomes.filter((o) => o.created)).toHaveLength(1);
    expect(await store.totalBytes()).toBe(PNG.length);
  });

  it("still accepts a file it already holds when the store is otherwise full", async () => {
    // Refusing it would be a confusing way to say "already stored", and the
    // upload adds no bytes.
    const tight = new LocalFileStore({ root, maxTotalBytes: PNG.length });
    await tight.put(PNG, "image/png");
    await expect(tight.put(PNG, "image/png")).resolves.toMatchObject({ created: false });
  });
});

describe("negative", () => {
  it("answers undefined for a hash it does not hold", async () => {
    expect(await store.get("0".repeat(64))).toBeUndefined();
  });

  it("refuses a write that would exceed the ceiling", async () => {
    const tight = new LocalFileStore({ root, maxTotalBytes: 4 });
    await expect(tight.put(PNG, "image/png")).rejects.toThrow(FileStoreError);
  });

  it("names the knob to turn when it refuses", async () => {
    // An operator reading this line should not have to find the source.
    const tight = new LocalFileStore({ root, maxTotalBytes: 4 });
    await expect(tight.put(PNG, "image/png")).rejects.toThrow(/STERUN_FILES_MAX_BYTES/);
  });

  it.each([
    ["a path traversal", "../../../etc/passwd"],
    ["a traversal that ends in hex", "../".repeat(8) + "a".repeat(64)],
    ["an absolute path", "/etc/passwd"],
    ["uppercase hex", "A".repeat(64)],
    ["63 characters", "a".repeat(63)],
    ["65 characters", "a".repeat(65)],
    ["a null byte", `${"a".repeat(63)}\0`],
    ["empty", ""],
  ])("refuses to look up %s", async (_label, key) => {
    // The guard is the pattern test, not any sanitising: a value that is not
    // 64 hex characters never becomes part of a filename at all.
    expect(await store.get(key)).toBeUndefined();
  });

  it("cannot be made to read a file outside the root", async () => {
    // Proof rather than assertion: put a real file where a traversal would
    // land, then show the store still answers undefined.
    const outside = join(root, "..", `sterun-outside-${process.pid}.json`);
    await writeFile(outside, '{"secret":true}');
    try {
      expect(await store.get(`../sterun-outside-${process.pid}`)).toBeUndefined();
    } finally {
      await rm(outside, { force: true });
    }
  });
});

describe("edge", () => {
  it("reports zero for a directory that does not exist yet", async () => {
    const fresh = new LocalFileStore({
      root: join(root, "not-created-yet"),
      maxTotalBytes: 1024,
    });
    expect(await fresh.totalBytes()).toBe(0);
  });

  it("creates the tree on the first write rather than needing setup", async () => {
    const fresh = new LocalFileStore({
      root: join(root, "deep", "nested"),
      maxTotalBytes: 1024 * 1024,
    });
    await expect(fresh.put(JSON_DOC, "application/json")).resolves.toMatchObject({
      created: true,
    });
  });

  it("counts files already on disk when the process restarts", async () => {
    // The cached total starts empty; a restart must not forget what is stored,
    // or the ceiling would be meaningless after every deploy.
    const { sha256 } = await store.put(PNG, "image/png");
    const reopened = new LocalFileStore({ root, maxTotalBytes: 1024 * 1024 });

    expect(await reopened.totalBytes()).toBe(PNG.length);
    expect((await reopened.get(sha256))?.bytes.equals(PNG)).toBe(true);
  });

  it("accepts a file exactly at the ceiling", async () => {
    const exact = new LocalFileStore({ root, maxTotalBytes: PNG.length });
    await expect(exact.put(PNG, "image/png")).resolves.toMatchObject({ created: true });
  });

  it("refuses a file one byte over the ceiling", async () => {
    const tight = new LocalFileStore({ root, maxTotalBytes: PNG.length - 1 });
    await expect(tight.put(PNG, "image/png")).rejects.toThrow(FileStoreError);
  });

  it("ignores stray directories when summing", async () => {
    await mkdir(join(root, "ab", "cd"), { recursive: true });
    await store.put(PNG, "image/png");
    expect(await store.totalBytes()).toBe(PNG.length);
  });

  it("hashBytes and pathForHash agree with each other", async () => {
    const sha256 = hashBytes(PNG);
    expect(pathForHash(root, sha256, "png")).toBe(
      join(root, sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.png`),
    );
  });

  it("stores an empty-ish file without confusing it for absence", async () => {
    // `get` returns undefined for "not stored". A zero-length file would be
    // falsy in a sloppier implementation; here it must round-trip.
    const empty = Buffer.alloc(0);
    const { sha256 } = await store.put(empty, "application/json");
    const found = await store.get(sha256);
    expect(found).toBeDefined();
    expect(found?.bytes.length).toBe(0);
  });
});
