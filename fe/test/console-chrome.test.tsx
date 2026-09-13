/**
 * Who renders the site header, now that the root layout no longer does.
 *
 * The console draws the wordmark and the wallet in its own rail, so a site
 * header above it printed both of them twice within about sixty pixels. That is
 * the bug this file guards, and it is guarded at the layout level because that
 * is where the decision now lives: `(browse)` and the wizard render `SiteFrame`,
 * the `(console)` group does not. Nothing here asserts on a class or a colour,
 * only on how many of each thing a person can see.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BrowseLayout from "../app/(browse)/layout";
import ConsoleLayout from "../app/(organiser)/org/(console)/layout";
import NewEventLayout from "../app/(organiser)/org/new/layout";
import { shortAddress } from "@/utils/format";

const ADDRESS = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const SHORT = shortAddress(ADDRESS);

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/org" }));

let wallet = {
  address: ADDRESS as string | null,
  isRestoring: false,
  isConnecting: false,
  error: null as string | null,
  connect: vi.fn(),
  disconnect: vi.fn(),
};
vi.mock("@/hooks/useWallet", () => ({ useWallet: () => wallet }));

beforeEach(() => {
  listEvents.mockResolvedValue({ events: [], unreadable: [] });
  wallet = {
    address: ADDRESS,
    isRestoring: false,
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
});

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("the console owns its chrome", () => {
  describe("negative", () => {
    it("renders no site header over a console page", async () => {
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      expect(await screen.findByText("dashboard")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Sterun home" })).not.toBeInTheDocument();
    });

    it("shows the wordmark once and the wallet once", async () => {
      // The bug in a sentence: STERUN twice and the same address twice, one
      // copy from the site header and one from the rail.
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByText("dashboard");

      expect(screen.getAllByText("STERUN")).toHaveLength(1);
      expect(screen.getAllByText(SHORT)).toHaveLength(1);
    });
  });

  describe("positive", () => {
    it("still gives the console its rail", async () => {
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      expect(
        await screen.findByRole("navigation", { name: "Organiser console" }),
      ).toBeInTheDocument();
    });

    it("puts the page in a main landmark, with the rail outside it", async () => {
      // SiteFrame gives every other route one. Without it here the console was
      // the only part of the app whose navigation a screen reader could not
      // skip, and the rail is exactly the thing worth skipping.
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByText("dashboard");

      const main = screen.getByRole("main");
      expect(within(main).getByText("dashboard")).toBeInTheDocument();
      expect(
        within(main).queryByRole("navigation", { name: "Organiser console" }),
      ).not.toBeInTheDocument();
    });

    it("offers the way back to the public site", async () => {
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByText("dashboard");

      expect(screen.getByRole("link", { name: "STERUN" })).toHaveAttribute("href", "/");
    });
  });

  describe("edge", () => {
    it("draws neither chrome while the wallet is still restoring", async () => {
      // Not an empty console and not a connect prompt: a rail listing nobody's
      // races would be a claim the app cannot make yet.
      wallet = { ...wallet, address: null, isRestoring: true };
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Organiser console" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Sterun home" })).not.toBeInTheDocument();
    });
  });
});

describe("the public pages and the wizard keep the site header", () => {
  describe("positive", () => {
    it("gives a browse page the header and its content", () => {
      render(<BrowseLayout><p>directory</p></BrowseLayout>, { wrapper: Wrapper });

      expect(screen.getByRole("link", { name: "Sterun home" })).toBeInTheDocument();
      expect(screen.getByText("directory")).toBeInTheDocument();
    });

    it("gives the wizard the same header", () => {
      render(<NewEventLayout><p>step one</p></NewEventLayout>, { wrapper: Wrapper });

      expect(screen.getByRole("link", { name: "Sterun home" })).toBeInTheDocument();
      expect(screen.getByText("step one")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("gates the wizard itself, now that the page no longer does", () => {
      // CreateEvent used to carry its own WalletGate and the console group took
      // over the gating for its routes only. If this layout had not picked the
      // wizard's up, /org/new would draw six steps for a wallet that is not
      // there, and CreateGate would render a blank page rather than an ask.
      wallet = { ...wallet, address: null };
      render(<NewEventLayout><p>step one</p></NewEventLayout>, { wrapper: Wrapper });

      // Scoped to the page: the site header carries a connect button of its
      // own, as it did before any of this, so an unscoped query finds two.
      const main = screen.getByRole("main");
      expect(within(main).getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
      expect(screen.queryByText("step one")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("gives the wizard no rail", () => {
      // Six steps that end in signing. Permanent navigation beside them is a
      // way out of a half-finished race at every moment, and a second one next
      // to the step's own way back.
      render(<NewEventLayout><p>step one</p></NewEventLayout>, { wrapper: Wrapper });

      expect(screen.queryByRole("navigation", { name: "Organiser console" })).not.toBeInTheDocument();
      expect(screen.queryByText("STERUN")).not.toBeInTheDocument();
    });
  });
});
