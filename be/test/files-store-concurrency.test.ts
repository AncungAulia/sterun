/**
 * The file store's running total under concurrent uploads.
 *
 * The store keeps a cached byte total so the ceiling check does not walk the
 * disk on every upload. It used to write `total + bytes` using the `total` it
 * read before awaiting the write, so two uploads racing both started from the
 * same number and the second erased the first from the count — an undercount
 * that grows with every race, until the ceiling no longer bounds anything.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFileStore } from "../src/files/store.js";

/** Distinct bytes per size, so every file has its own hash and its own path. */
const file = (size: number): Buffer => Buffer.alloc(size, size % 251);

describe("LocalFileStore total under concurrent uploads", () => {
  it("counts every file when uploads race", async () => {
    const root = await mkdtemp(join(tmpdir(), "sterun-files-race-"));
    try {
      const store = new LocalFileStore({ root, maxTotalBytes: 10_000_000 });
      const files = [101, 202, 303, 404, 505].map(file);

      await Promise.all(files.map((bytes) => store.put(bytes, "image/png")));

      const expected = files.reduce((sum, bytes) => sum + bytes.length, 0);
      expect(await store.totalBytes()).toBe(expected);
      // And the cache agrees with what a fresh walk of the disk finds.
      expect(await new LocalFileStore({ root, maxTotalBytes: 10_000_000 }).totalBytes()).toBe(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
