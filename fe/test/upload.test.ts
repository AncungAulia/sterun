/**
 * Uploading the event details file to the backend (`POST /events/files`).
 *
 * Two things make this worth its own test file rather than a few lines in
 * `api.test.ts`. It is the first place the app authenticates as the organiser,
 * so the challenge -> sign -> headers order has to be pinned; and its result
 * goes straight into `create_event`'s `metadata_hash`, which cannot be changed
 * afterwards, so the guard against uploading one thing and committing another
 * is the point of the module.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { uploadEventFile } from "@/lib/upload";

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const SHA = "a".repeat(64);
const BYTES = new TextEncoder().encode('{"name":"Jakarta Run"}\n');

/**
 * One fetch stub answering both calls the flow makes, in order: the challenge
 * and then the upload. Keyed by url rather than call count so a test that adds
 * a request does not silently shift the assertions of another.
 */
function stubApi(upload: { status?: number; body?: unknown } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/challenge")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ nonce: "nonce-from-server", expires_at: "2026-09-08T00:02:00Z" }),
      };
    }
    const status = upload.status ?? 201;
    return {
      ok: status < 400,
      status,
      json: async () =>
        upload.body ?? {
          url: `https://api-sterun.jameshub.fun/files/${SHA}.json`,
          sha256: SHA,
          size: BYTES.length,
          content_type: "application/json",
          created: true,
        },
    };
  });
  vi.stubGlobal("fetch", fetcher);
  return { calls, fetcher };
}

const sign = vi.fn(async () => "c2lnbmF0dXJl");

afterEach(() => {
  vi.unstubAllGlobals();
  sign.mockClear();
  sign.mockImplementation(async () => "c2lnbmF0dXJl");
});

describe("uploadEventFile", () => {
  describe("positive", () => {
    it("signs the nonce the server issued, not one of its own", async () => {
      // A nonce is single-use and bound to an address. Signing anything else is
      // an unknown-nonce the organiser cannot act on.
      stubApi();

      await uploadEventFile({ bytes: BYTES, contentType: "application/json", address: ADDRESS, sign });

      expect(sign).toHaveBeenCalledWith("nonce-from-server", { address: ADDRESS });
    });

    it("sends the address, the nonce and the signature with the bytes", async () => {
      const { calls } = stubApi();

      await uploadEventFile({ bytes: BYTES, contentType: "application/json", address: ADDRESS, sign });

      const upload = calls.find((c) => c.url.endsWith("/events/files"));
      expect(upload?.init.headers).toMatchObject({
        "x-sterun-address": ADDRESS,
        "x-sterun-nonce": "nonce-from-server",
        "x-sterun-signature": "c2lnbmF0dXJl",
        "content-type": "application/json",
      });
      expect(upload?.init.body).toBe(BYTES);
    });

    it("returns the url and the hash the chain will record", async () => {
      stubApi();

      const stored = await uploadEventFile({
        bytes: BYTES,
        contentType: "application/json",
        address: ADDRESS,
        sign,
      });

      expect(stored).toMatchObject({
        url: `https://api-sterun.jameshub.fun/files/${SHA}.json`,
        sha256: SHA,
        created: true,
      });
    });

    it("reports bytes that were already stored as not newly created", async () => {
      // Re-uploading the same document is a 201 with created:false, not an
      // error. The step should say "already published", not imply work happened.
      stubApi({
        body: {
          url: `https://api-sterun.jameshub.fun/files/${SHA}.json`,
          sha256: SHA,
          size: BYTES.length,
          content_type: "application/json",
          created: false,
        },
      });

      const stored = await uploadEventFile({
        bytes: BYTES,
        contentType: "application/json",
        address: ADDRESS,
        sign,
      });

      expect(stored.created).toBe(false);
    });
  });

  describe("edge", () => {
    it("refuses a stored hash that is not the one we are about to commit", async () => {
      // The store is content-addressed, so these can only differ if the bytes
      // changed on the way — an encoding slip, a proxy rewriting a body. On
      // chain that is unfixable: `create_event` has no `update_event`, and the
      // event page would read "the document has been changed" forever.
      stubApi({
        body: {
          url: `https://api-sterun.jameshub.fun/files/${"b".repeat(64)}.json`,
          sha256: "b".repeat(64),
          size: BYTES.length,
          content_type: "application/json",
          created: true,
        },
      });

      await expect(
        uploadEventFile({
          bytes: BYTES,
          contentType: "application/json",
          address: ADDRESS,
          expectedSha256: SHA,
          sign,
        }),
      ).rejects.toThrow(/different file/i);
    });
  });

  describe("negative", () => {
    it("does not upload anything when the wallet refuses to sign", async () => {
      // Bytes sent without a signature are a 401 that spends the organiser's
      // upload rate limit for nothing.
      const { calls } = stubApi();
      sign.mockRejectedValue(new Error("User declined"));

      await expect(
        uploadEventFile({ bytes: BYTES, contentType: "application/json", address: ADDRESS, sign }),
      ).rejects.toThrow("User declined");

      expect(calls.some((c) => c.url.endsWith("/events/files"))).toBe(false);
    });

    it("carries the backend's refusal code, so the step can explain the file", async () => {
      stubApi({
        status: 415,
        body: { error: "unsupported-file-type", message: "SVG is not accepted" },
      });

      await expect(
        uploadEventFile({ bytes: BYTES, contentType: "image/svg+xml", address: ADDRESS, sign }),
      ).rejects.toMatchObject({ code: "unsupported-file-type", status: 415 });
    });

    it("is an ApiError when the store is full, not a crash", async () => {
      // 507 means "nothing is broken, there is no room" (be/src/routes/files.ts)
      // and the organiser should be told to try again, not to fix their file.
      stubApi({ status: 507, body: { error: "store-full", message: "no room" } });

      await expect(
        uploadEventFile({ bytes: BYTES, contentType: "application/json", address: ADDRESS, sign }),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });
});
