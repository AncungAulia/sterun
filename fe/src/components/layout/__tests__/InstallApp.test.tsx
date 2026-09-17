import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallApp } from "@/components/layout/InstallApp";

/** A `beforeinstallprompt` as Chrome fires one, with the two parts we use. */
function offerInstall() {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  window.dispatchEvent(event);
  return event;
}

function userAgent(value: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
}

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  localStorage.clear();
  // jsdom has no matchMedia, and "is it already installed" asks it.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InstallApp", () => {
  describe("positive", () => {
    it("offers the browser's own install dialog once the browser says it can", async () => {
      render(<InstallApp what="pass" />);
      expect(screen.queryByRole("button", { name: "Add to home screen" })).not.toBeInTheDocument();

      const event = offerInstall();

      const button = await screen.findByRole("button", { name: "Add to home screen" });
      await userEvent.click(button);

      expect(event.prompt).toHaveBeenCalledTimes(1);
      // Spent: the browser fires the event once, so the offer goes with it.
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Add to home screen" })).not.toBeInTheDocument(),
      );
    });

    it("tells an iPhone where its own button is, since there is no event there", async () => {
      userAgent(IPHONE_SAFARI);
      render(<InstallApp what="pass" />);

      expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
      expect(screen.getByText(/Share/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add to home screen" })).not.toBeInTheDocument();
    });

    it("says what it is for, in the words of the screen it is on", async () => {
      const { unmount } = render(<InstallApp what="pass" />);
      offerInstall();
      expect(await screen.findByText(/Keep this pass on your home screen/)).toBeInTheDocument();
      unmount();

      render(<InstallApp what="desk" />);
      offerInstall();
      expect(await screen.findByText(/Keep the desk on your home screen/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("draws nothing at all where installing is not offered", () => {
      // Desktop Firefox: no event, not iOS. A button that cannot install is
      // worse than no button.
      const { container } = render(<InstallApp what="desk" />);
      expect(container).toBeEmptyDOMElement();
    });

    it("stays gone once it has been dismissed, on this device", async () => {
      const { unmount } = render(<InstallApp what="pass" />);
      offerInstall();

      await userEvent.click(await screen.findByRole("button", { name: "Hide this" }));
      expect(screen.queryByText(/home screen/)).not.toBeInTheDocument();
      unmount();

      render(<InstallApp what="pass" />);
      offerInstall();
      await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
    });

    it("draws nothing in an installed copy, which is the thing it asks for", async () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      );
      render(<InstallApp what="pass" />);
      offerInstall();

      await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
    });

    it("survives a browser that refuses to answer about storage", async () => {
      // Private mode throws on access rather than returning null.
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("access denied");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("access denied");
      });

      render(<InstallApp what="pass" />);
      offerInstall();
      await userEvent.click(await screen.findByRole("button", { name: "Hide this" }));

      expect(screen.queryByText(/home screen/)).not.toBeInTheDocument();
    });
  });
});
