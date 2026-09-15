import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { ConsoleSidebar } from "@/modules/organiser/component/ConsoleSidebar";
import type { EventSummary } from "@/lib/event/events";
import type { EventStatus, SterunEvent } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/event/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event/events")>()),
  listEvents,
}));

/*
  The path is what the rail reads to decide where you are, so the tests have to
  be able to move it. It was a constant "/org", which meant the two facts the
  path drives, whether Events starts open and which race is marked, had no test
  that could see them at all.
*/
let pathname = "/org";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

/* The rail takes the action rather than reaching for the wallet itself, so
   this file never has to load the Stellar Wallets Kit. */
const onDisconnect = vi.fn();

const MINE = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const THEIRS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function summary(eventId: number, overrides: Partial<SterunEvent> = {}): EventSummary {
  return {
    event: {
      eventId,
      organiser: MINE,
      name: `Race ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: 1_790_548_200n,
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories: [],
  };
}

/*
  `SidebarProvider` is not decoration here: `ConsoleSidebar` is a shadcn
  `Sidebar` now, and `useSidebar()` throws without it. Wrapping it in the test
  is wrapping it the way the route does, since `ConsoleFrame` is the only thing
  that renders this component.
*/
function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SidebarProvider>{children}</SidebarProvider>
    </QueryClientProvider>
  );
}

/**
 * Renders, and waits for the read to have been asked for.
 *
 * Not decoration. Without this the assertions ran before a mocked rejection had
 * reached React Query, so the edge case below passed against a rail that
 * replaced itself with an error message on a failed read: the very thing it
 * exists to forbid. A test that cannot see the failure it is named after is
 * worse than no test, because it is counted.
 */
async function renderRail(address = MINE) {
  render(<ConsoleSidebar address={address} onDisconnect={onDisconnect} />, {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(listEvents).toHaveBeenCalled());
  /*
    And then wait for that read to have SETTLED, which is the half that was
    missing. The rail deliberately renders the same whether the read failed or
    returned nothing, so there is no appearance or disappearance on screen to
    wait for, and every assertion below would otherwise run against the pending
    render. Awaiting the mock's own promise inside `act` is deterministic where
    a DOM query cannot be.
  */
  const read = listEvents.mock.results.at(-1)?.value;
  // Loudly, not with an optional call. `?.catch()` on something that is not a
  // promise does nothing and says nothing, which is precisely how the waiting
  // below would be hollowed out again without a single test turning red.
  expect(read).toBeInstanceOf(Promise);
  await act(async () => {
    await (read as Promise<unknown>).catch(() => {});
  });
}

beforeEach(() => {
  pathname = "/org";
});

describe("ConsoleSidebar", () => {
  describe("positive", () => {
    it("offers Dashboard and Races", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      await renderRail();

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /races/i })).toBeInTheDocument();
    });

    it("lists this wallet's races under Races once it is expanded", async () => {
      listEvents.mockResolvedValue({ events: [summary(1), summary(2)], unreadable: [] });

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /races/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Race 2" })).toBeInTheDocument();
    });

    it("offers the way back to the public site, as the brand mark", async () => {
      // There is no site header over the console, so if the rail does not
      // carry this link there is no way out of /org but the address bar.
      //
      // The link holds two images, the lockup and the mark on its own, and CSS
      // shows whichever fits the rail's width. jsdom applies no CSS, so both
      // are present here and neither can be asserted as "the visible one":
      // what this checks is that both files are the white variants the ink
      // rail needs, and that the link is named once, out of band, so its name
      // cannot change with the rail's state.
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      await renderRail();

      const home = screen.getByRole("link", { name: "Sterun" });
      expect(home).toHaveAttribute("href", "/");

      const sources = [...home.querySelectorAll("img")].map((img) => img.getAttribute("src"));
      expect(sources.some((src) => src?.includes("sterun-lockup-white.svg"))).toBe(true);
      expect(sources.some((src) => src?.includes("sterun-logo-white.svg"))).toBe(true);
      expect(sources.every((src) => src?.includes("white"))).toBe(true);
    });

    it("is already open inside a race, with nothing clicked", async () => {
      // The rail lives in a layout so that it does NOT remount between console
      // pages, which is exactly why this cannot be a `useState` seed: read once
      // on a hard load, it left Events shut for somebody who clicked through
      // from the dashboard.
      listEvents.mockResolvedValue({ events: [summary(1)], unreadable: [] });
      pathname = "/org/events/1";

      await renderRail();

      expect(await screen.findByRole("link", { name: "Race 1" })).toBeInTheDocument();
    });

    it("marks the race you are on", async () => {
      listEvents.mockResolvedValue({ events: [summary(1), summary(2)], unreadable: [] });
      pathname = "/org/events/1";

      await renderRail();

      expect(await screen.findByRole("link", { name: "Race 1" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: "Race 2" })).not.toHaveAttribute("aria-current");
    });

    it("still marks the race from one of its own tabs", async () => {
      // Entries, scanners and results sit under the race. An exact match marks
      // nothing on any of them, and says so to nobody.
      listEvents.mockResolvedValue({ events: [summary(1)], unreadable: [] });
      pathname = "/org/events/1/entries";

      await renderRail();

      expect(await screen.findByRole("link", { name: "Race 1" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  describe("negative", () => {
    it("does not list races another wallet organises", async () => {
      listEvents.mockResolvedValue({
        events: [summary(1), summary(2, { organiser: THEIRS })],
        unreadable: [],
      });

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /races/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Race 2" })).not.toBeInTheDocument();
    });

    it("does not let race 3 be marked by race 30", async () => {
      // The prefix match needs the separator. Without it every race whose id
      // starts with another's digits marks two rows at once.
      listEvents.mockResolvedValue({ events: [summary(3), summary(30)], unreadable: [] });
      pathname = "/org/events/30";

      await renderRail();

      expect(await screen.findByRole("link", { name: "Race 3" })).not.toHaveAttribute(
        "aria-current",
      );
      expect(screen.getByRole("link", { name: "Race 30" })).toHaveAttribute("aria-current", "page");
    });

    it("does not mark Dashboard from a page merely underneath /org", async () => {
      // Dashboard stays an exact match on purpose: a prefix there lights it up
      // on the wizard and on every race.
      listEvents.mockResolvedValue({ events: [], unreadable: [] });
      pathname = "/org/new";

      await renderRail();

      expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    });
  });

  describe("edge", () => {
    it("still offers Races when the chain cannot be read", async () => {
      // The rail is navigation. A node that will not answer must not remove the
      // way back to the dashboard.
      listEvents.mockRejectedValue(new Error("rpc down"));

      await renderRail();

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /races/i })).toBeInTheDocument();
    });

    it("opens onto nothing when the chain cannot be read", async () => {
      // Empty, not absent. They look the same on screen and they are not the
      // same claim: absent would mean the expander itself had been taken away.
      listEvents.mockRejectedValue(new Error("rpc down"));

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /races/i }));

      // Two lists: the rail's own menu, and the expander's, which is the one
      // that has to be present and empty. Asserting on both counts is what
      // keeps this honest, since an expander that had been removed entirely
      // would leave exactly one list and nothing to look empty.
      const nav = screen.getByRole("navigation", { name: "Organiser console" });
      const lists = within(nav).getAllByRole("list");
      expect(lists).toHaveLength(2);
      expect(lists[1]).toBeEmptyDOMElement();
    });

    it("lets a hand on the expander beat the path", async () => {
      // Inside a race the path opens it; somebody who shuts it has said what
      // they want, and the rail must not reopen it under them.
      listEvents.mockResolvedValue({ events: [summary(1)], unreadable: [] });
      pathname = "/org/events/1";

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /races/i }));

      expect(screen.queryByRole("link", { name: "Race 1" })).not.toBeInTheDocument();
    });
  });
});

describe("the rail's own toggle", () => {
  function rail() {
    return document.querySelector('[data-slot="sidebar"][data-state]');
  }

  describe("positive", () => {
    it("folds from its own header and opens again from the mark", async () => {
      // The toggle moved out of the page header into the rail it folds
      // (Ancung, 2026-09-14). Folded, the mark itself becomes the way back.
      listEvents.mockResolvedValue({ events: [], unreadable: [] });
      await renderRail();

      expect(rail()).toHaveAttribute("data-state", "expanded");
      await userEvent.click(screen.getByRole("button", { name: "Collapse the menu" }));
      expect(rail()).toHaveAttribute("data-state", "collapsed");

      await userEvent.click(screen.getByRole("button", { name: "Expand the menu" }));
      expect(rail()).toHaveAttribute("data-state", "expanded");
    });
  });

  describe("negative", () => {
    it("keeps the way home in the header when the rail is folded", async () => {
      // The button that opens a folded rail covers the mark on screen, but the
      // link stays in the document, so a keyboard still reaches the public site.
      listEvents.mockResolvedValue({ events: [], unreadable: [] });
      await renderRail();

      await userEvent.click(screen.getByRole("button", { name: "Collapse the menu" }));
      expect(screen.getByRole("link", { name: "Sterun" })).toHaveAttribute("href", "/");
    });
  });
});
