import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";

function respond(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const fetcher = vi.fn(async () => ({
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  describe("positive", () => {
    it("calls the configured backend", async () => {
      const fetcher = respond({ scanners: [] });

      await apiFetch("/events/0/scanners");

      expect(fetcher).toHaveBeenCalledWith(
        "https://api-sterun.jameshub.fun/events/0/scanners",
        expect.anything(),
      );
    });

    it("returns the parsed body", async () => {
      respond({ scanners: [{ address: "GA", added_ledger: 1 }] });

      const body = await apiFetch<{ scanners: unknown[] }>("/events/0/scanners");

      expect(body.scanners).toHaveLength(1);
    });
  });

  describe("negative", () => {
    it("turns a backend error into one carrying its code", async () => {
      // The API answers with {error, message} everywhere (be/CLAUDE.md), and a
      // caller that wants to treat not_indexed differently from a 500 needs the
      // code rather than a sentence to match on.
      respond({ error: "not_indexed", message: "no such event in the index" }, {
        ok: false,
        status: 404,
      });

      await expect(apiFetch("/events/99/scanners")).rejects.toMatchObject({
        code: "not_indexed",
        status: 404,
      });
    });

    it("never puts the server's own sentence on screen", async () => {
      // The backend writes `message` for whoever reads a log. Passing it
      // through is how a page ends up telling a runner about a row that failed
      // to insert, so the code is kept and the sentence is ours.
      respond({ error: "not_indexed", message: "no such event in the index" }, {
        ok: false,
        status: 404,
      });

      await expect(apiFetch("/events/99/scanners")).rejects.toThrowError(
        "Something went wrong on our side. Please try again.",
      );
    });

    it("is still an Error, so nothing has to special-case it", async () => {
      respond({ error: "boom", message: "went wrong" }, { ok: false, status: 500 });

      await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    });

    it("survives an error body that is not the documented shape", async () => {
      // A proxy in front of the API can return HTML, and a client that assumes
      // JSON turns a 502 into a parse error nobody can act on.
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError("Unexpected token <");
          },
          text: async () => "<html>bad gateway</html>",
        })),
      );

      await expect(apiFetch("/x")).rejects.toMatchObject({ status: 502 });
    });
  });
});
