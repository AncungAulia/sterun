/**
 * Registration only. What the service worker actually caches is tested against
 * the worker file itself (test/offline-sw.test.ts); whether that survives a
 * phone in airplane mode is checked on the deployed build.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/pass/7" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { OfflineReady, offlineScopeOf } from "@/components/layout/OfflineReady";

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
  pathname.current = "/pass/7";
});

function withServiceWorker(
  register: () => Promise<unknown>,
  registrations: { active: { scriptURL: string } | null; unregister: () => Promise<boolean> }[] = [],
) {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register, getRegistrations: async () => registrations },
    configurable: true,
  });
}

describe("offlineScopeOf", () => {
  it("names the pass and the desk, and nothing else", () => {
    expect(offlineScopeOf("/pass/7")).toBe("/pass");
    expect(offlineScopeOf("/scan")).toBe("/scan");
    expect(offlineScopeOf("/scan/3")).toBe("/scan");
    expect(offlineScopeOf("/scan/3/flagged")).toBe("/scan");
    expect(offlineScopeOf("/")).toBeNull();
    expect(offlineScopeOf("/events/3")).toBeNull();
    expect(offlineScopeOf("/org")).toBeNull();
    expect(offlineScopeOf("/scanner-help")).toBeNull();
  });
});

describe("OfflineReady", () => {
  it("registers the worker for the pass, scoped to the pass", async () => {
    const register = vi.fn(async () => ({}));
    withServiceWorker(register);

    render(<OfflineReady />);

    await waitFor(() => expect(register).toHaveBeenCalledWith("/offline-sw.js", { scope: "/pass" }));
  });

  it("registers the same worker for the desk, scoped to the desk", async () => {
    pathname.current = "/scan/3";
    const register = vi.fn(async () => ({}));
    withServiceWorker(register);

    render(<OfflineReady />);

    await waitFor(() => expect(register).toHaveBeenCalledWith("/offline-sw.js", { scope: "/scan" }));
  });

  it("retires the pass's old worker, and leaves any other alone", async () => {
    const retired = { active: { scriptURL: "https://sterun.xyz/pass-sw.js" }, unregister: vi.fn(async () => true) };
    const current = { active: { scriptURL: "https://sterun.xyz/offline-sw.js" }, unregister: vi.fn(async () => true) };
    withServiceWorker(vi.fn(async () => ({})), [retired, current]);

    render(<OfflineReady />);

    await waitFor(() => expect(retired.unregister).toHaveBeenCalled());
    expect(current.unregister).not.toHaveBeenCalled();
  });

  it("renders nothing, so it can sit anywhere on the screen", () => {
    withServiceWorker(vi.fn(async () => ({})));
    const { container } = render(<OfflineReady />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing where the browser has no service workers", () => {
    const { container } = render(<OfflineReady />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the screen usable when registering fails", async () => {
    const register = vi.fn(async () => Promise.reject(new Error("insecure origin")));
    withServiceWorker(register);

    // A screen that did not cache still works for as long as it is open, which
    // is the whole of a visit to a pickup desk. Failing loudly here would put
    // an error over a screen that is working.
    expect(() => render(<OfflineReady />)).not.toThrow();
    await waitFor(() => expect(register).toHaveBeenCalled());
  });
});
