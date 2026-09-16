/**
 * Registration only. What the service worker actually caches is a claim no
 * jsdom test can make honestly: the real check is a phone in airplane mode.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfflineReady } from "@/modules/pass/components/OfflineReady";

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
});

function withServiceWorker(register: () => Promise<unknown>) {
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
}

describe("OfflineReady", () => {
  it("registers the worker for the pass, and only for the pass", async () => {
    const register = vi.fn(async () => ({}));
    withServiceWorker(register);

    render(<OfflineReady />);

    await waitFor(() => expect(register).toHaveBeenCalledWith("/pass-sw.js", { scope: "/pass" }));
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

  it("keeps the pass usable when registering fails", async () => {
    const register = vi.fn(async () => Promise.reject(new Error("insecure origin")));
    withServiceWorker(register);

    // A pass that did not cache still works for as long as it is open, which is
    // the whole of a visit to a pickup desk. Failing loudly here would put an
    // error over a screen that is working.
    expect(() => render(<OfflineReady />)).not.toThrow();
    await waitFor(() => expect(register).toHaveBeenCalled());
  });
});
