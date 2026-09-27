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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BrowseLayout from "../app/(browse)/layout";
import ConsoleLayout from "../app/(organiser)/org/(console)/layout";
import NewEventLayout from "../app/(organiser)/org/new/layout";
import BrowseNotFound from "../app/(browse)/not-found";
import ConsoleNotFound from "../app/(organiser)/org/(console)/not-found";
import NotFound from "../app/not-found";
import { ConsoleHeader } from "@/modules/organiser/shared/components/ConsoleHeader";
import { shortAddress } from "@/utils/format";

const ADDRESS = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const SHORT = shortAddress(ADDRESS);

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/event/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event/events")>()),
  listEvents,
}));
/* The site header reads the search from the address (2026-09-23), so every
   layout that draws it needs the router mocked, not only the console's rail. */
vi.mock("next/navigation", () => ({
  usePathname: () => "/org",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

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

    it("shows the wallet once and no wordmark the console does not own", async () => {
      // The bug in a sentence: the wordmark twice and the same address twice,
      // one copy from the site header and one from the rail.
      //
      // The console now draws the mark at two breakpoints, in the rail and in
      // the phone-width bar, and only ever one of them is on screen: the bar is
      // `md:hidden` and the rail is `hidden md:block`. jsdom applies no CSS, so
      // it sees both, and counting them here would be counting something no
      // person ever sees. What is still worth counting is the address, which
      // has exactly one home, and the site header's own link, which must not
      // be over these pages at all.
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByText("dashboard");

      expect(screen.getAllByText(SHORT)).toHaveLength(1);
      expect(screen.queryByRole("link", { name: "Sterun home" })).not.toBeInTheDocument();
      for (const home of screen.getAllByRole("link", { name: "Sterun" })) {
        expect(home).toHaveAttribute("href", "/");
      }
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

      expect(screen.getAllByRole("link", { name: "Sterun" })[0]).toHaveAttribute("href", "/");
    });
  });

  describe("without a wallet", () => {
    it("still carries the wordmark and the landmark on the connect screen", () => {
      // The first screen a new organiser ever sees. It used to be a card
      // floating on an empty page: no way back to the site, no landmark, in
      // the one state where nobody has any reason to trust the page yet.
      wallet = { ...wallet, address: null };
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      expect(screen.getByRole("link", { name: "Sterun" })).toHaveAttribute("href", "/");
      const main = screen.getByRole("main");
      expect(within(main).getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    });

    it("draws no rail and no page for a wallet that is not there", () => {
      wallet = { ...wallet, address: null };
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      expect(screen.queryByRole("navigation", { name: "Organiser console" })).not.toBeInTheDocument();
      expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
    });

    it("offers no second wordmark, because there is still no site header", () => {
      wallet = { ...wallet, address: null };
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      // One frame, one mark: the connect screen has no rail and therefore no
      // second breakpoint to draw for.
      expect(screen.getAllByRole("link", { name: "Sterun" })).toHaveLength(1);
      expect(screen.queryByRole("link", { name: "Sterun home" })).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("keeps the chrome while the wallet is still restoring", () => {
      // Not an empty console and not a connect prompt: a rail listing nobody's
      // races would be a claim the app cannot make yet, and neither would the
      // ask, because this wallet may be about to come back. What does not
      // depend on the answer, the way out and the landmark, stays put rather
      // than appearing a moment later.
      wallet = { ...wallet, address: null, isRestoring: true };
      render(<ConsoleLayout><p>dashboard</p></ConsoleLayout>, { wrapper: Wrapper });

      expect(screen.getByRole("link", { name: "Sterun" })).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument();
      expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Organiser console" })).not.toBeInTheDocument();
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
      expect(screen.queryByRole("link", { name: "Sterun" })).not.toBeInTheDocument();
    });
  });
});

describe("the page nobody meant to open", () => {
  describe("positive", () => {
    it("keeps the header, the landmark and a way back", () => {
      // An unmatched URL renders at the ROOT boundary, which is in none of the
      // route groups and therefore has no chrome of its own since the header
      // moved down into them. Without app/not-found.tsx the one page somebody
      // reaches purely by accident was the one page with no way out.
      render(<NotFound />, { wrapper: Wrapper });

      expect(screen.getByRole("link", { name: "Sterun home" })).toBeInTheDocument();
      expect(screen.getByRole("main")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Browse races" })).toHaveAttribute("href", "/");
    });
  });

  describe("negative", () => {
    it("draws no second header when it lands inside a group that has one", () => {
      // Measured in a browser first: /events/banana rendered the root page
      // inside (browse)'s layout and printed two lockups and two <main>
      // elements, which is precisely the defect this task set out to remove.
      render(
        <BrowseLayout>
          <BrowseNotFound />
        </BrowseLayout>,
        { wrapper: Wrapper },
      );

      expect(screen.getAllByRole("link", { name: "Sterun home" })).toHaveLength(1);
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Browse races" })).toBeInTheDocument();
    });
  });
});

/**
 * The rail at phone width, where it is a drawer rather than a rail.
 *
 * Nothing here asserts on a width, and it could not: jsdom has no layout, so an
 * element's size and a media query are both fiction in it. What IS real is the
 * branch `useIsMobile` takes, which reads `window.innerWidth`, so these force
 * that one number and then ask only what is in the document. The proof that
 * 375px of viewport no longer holds 543px of page is a browser measurement and
 * belongs in the report, not here.
 */
describe("the console at phone width", () => {
  const WIDE = window.innerWidth;

  function setWidth(px: number) {
    Object.defineProperty(window, "innerWidth", { value: px, configurable: true });
  }

  afterEach(() => setWidth(WIDE));

  describe("positive", () => {
    it("puts the rail behind a menu button instead of beside the page", async () => {
      // The whole reason for the change: a 208px rail on a 375px screen left
      // the dashboard 167px and scrolled the page sideways.
      setWidth(390);
      // A real page header, because that is where the phone's menu button
      // lives now: the dark bar above the page that used to carry it is gone.
      render(<ConsoleLayout><ConsoleHeader title="Dashboard" /></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByRole("heading", { name: "Dashboard" });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("navigation", { name: "Organiser console" }),
      ).not.toBeInTheDocument();
    });

    it("opens onto the same two items", async () => {
      setWidth(390);
      // A real page header, because that is where the phone's menu button
      // lives now: the dark bar above the page that used to carry it is gone.
      render(<ConsoleLayout><ConsoleHeader title="Dashboard" /></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByRole("heading", { name: "Dashboard" });

      await userEvent.click(await screen.findByRole("button", { name: "Menu" }));

      const nav = await screen.findByRole("navigation", { name: "Organiser console" });
      expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: /races/i })).toBeInTheDocument();
    });

    it("keeps the way out of the console one press away, in the drawer", async () => {
      // There is no bar above the page now, so the wordmark lives in the
      // drawer with the rest of the navigation, one press behind Menu.
      setWidth(390);
      // A real page header, because that is where the phone's menu button
      // lives now: the dark bar above the page that used to carry it is gone.
      render(<ConsoleLayout><ConsoleHeader title="Dashboard" /></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByRole("heading", { name: "Dashboard" });

      await userEvent.click(await screen.findByRole("button", { name: "Menu" }));
      const home = await screen.findAllByRole("link", { name: "Sterun" });
      expect(home.length).toBeGreaterThan(0);
      for (const link of home) expect(link).toHaveAttribute("href", "/");
    });
  });

  describe("negative", () => {
    it("closes the drawer when a destination is chosen", async () => {
      // A navigation drawer left open over the page you have just asked for
      // reads as "the link did nothing", and on a phone it covers the answer.
      setWidth(390);
      // A real page header, because that is where the phone's menu button
      // lives now: the dark bar above the page that used to carry it is gone.
      render(<ConsoleLayout><ConsoleHeader title="Dashboard" /></ConsoleLayout>, { wrapper: Wrapper });
      await screen.findByRole("heading", { name: "Dashboard" });

      await userEvent.click(await screen.findByRole("button", { name: "Menu" }));
      const nav = await screen.findByRole("navigation", { name: "Organiser console" });
      await userEvent.click(within(nav).getByRole("link", { name: "Dashboard" }));

      await waitFor(() =>
        expect(
          screen.queryByRole("navigation", { name: "Organiser console" }),
        ).not.toBeInTheDocument(),
      );
    });
  });
});

describe("a race id the console cannot find", () => {
  describe("negative", () => {
    it("draws no site header over the rail and only one landmark", async () => {
      // notFound() from /org/events/banana lands INSIDE the console layout,
      // which has already drawn the rail and the <main>. The root not-found
      // would add the site header and a second <main> on top of both.
      render(
        <ConsoleLayout>
          <ConsoleNotFound />
        </ConsoleLayout>,
        { wrapper: Wrapper },
      );

      expect(await screen.findByRole("link", { name: "Browse races" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Sterun home" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("main")).toHaveLength(1);
    });
  });
});
