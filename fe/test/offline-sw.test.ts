// @vitest-environment node
/**
 * The worker file itself, run in a sandbox with the two scopes it is
 * registered for. What it may cache is the claim that matters: the pass's
 * worker must never keep the desk, and neither may ever keep a race page, where
 * a stale copy could show a quota the chain no longer agrees with.
 *
 * Whether the cached copy is actually served in airplane mode is a phone test,
 * done on the deployed build.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(join(import.meta.dirname, "../public/offline-sw.js"), "utf8");

function workerFor(scope: string) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    registration: { scope: `https://sterun.xyz${scope}` },
    location: { origin: "https://sterun.xyz" },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: () => {},
  };
  const context = vm.createContext({ self, URL, caches: {}, fetch: () => Promise.reject(new Error("offline")) });
  // `export` is not valid in a classic worker script, so the two functions are
  // read back out of the sandbox after it runs.
  vm.runInContext(`${SOURCE}\n;globalThis.__probe = { cacheable, isStale, CACHE };`, context);
  return (context as { __probe: { cacheable: (r: unknown) => boolean; isStale: (k: string) => boolean; CACHE: string } })
    .__probe;
}

const get = (path: string, origin = "https://sterun.xyz") => ({ method: "GET", url: `${origin}${path}` });

describe("the pass's worker", () => {
  const worker = workerFor("/pass");

  it("keeps the pass and the build's assets", () => {
    expect(worker.cacheable(get("/pass/7"))).toBe(true);
    expect(worker.cacheable(get("/_next/static/chunks/app.js"))).toBe(true);
  });

  it("never keeps the desk, a race page, the directory or the console", () => {
    for (const path of ["/scan", "/scan/3", "/events/3", "/", "/org", "/passport"]) {
      expect(worker.cacheable(get(path)), path).toBe(false);
    }
  });

  it("never keeps anything but a GET from this origin", () => {
    expect(worker.cacheable({ method: "POST", url: "https://sterun.xyz/pass/7" })).toBe(false);
    expect(worker.cacheable(get("/pass/7", "https://api-sterun.jameshub.fun"))).toBe(false);
  });

  it("clears its own old caches and the one it had before the desk shared the file, never the desk's", () => {
    expect(worker.CACHE).toBe("sterun-offline-v1/pass");
    expect(worker.isStale("sterun-pass-v1")).toBe(true);
    expect(worker.isStale("sterun-offline-v0/pass")).toBe(true);
    expect(worker.isStale("sterun-offline-v1/pass")).toBe(false);
    expect(worker.isStale("sterun-offline-v1/scan")).toBe(false);
  });
});

describe("the desk's worker", () => {
  const worker = workerFor("/scan");

  it("keeps the desk, including a race's desk, and the build's assets", () => {
    expect(worker.cacheable(get("/scan"))).toBe(true);
    expect(worker.cacheable(get("/scan/3"))).toBe(true);
    expect(worker.cacheable(get("/_next/static/css/app.css"))).toBe(true);
  });

  it("never keeps the pass or a race page", () => {
    for (const path of ["/pass/7", "/events/3", "/", "/scanner-help"]) {
      expect(worker.cacheable(get(path)), path).toBe(false);
    }
  });

  it("never deletes the pass's cache", () => {
    expect(worker.isStale("sterun-pass-v1")).toBe(false);
    expect(worker.isStale("sterun-offline-v1/pass")).toBe(false);
  });
});
