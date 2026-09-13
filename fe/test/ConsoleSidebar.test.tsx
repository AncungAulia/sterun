import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConsoleSidebar } from "@/modules/organiser/component/ConsoleSidebar";
import type { EventSummary } from "@/lib/events";
import type { EventStatus, SterunEvent } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
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

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
  render(<ConsoleSidebar address={address} />, { wrapper: Wrapper });
  await waitFor(() => expect(listEvents).toHaveBeenCalled());
  /*
    And then wait for that read to have SETTLED, which is the half that was
    missing. The rail deliberately renders the same whether the read failed or
    returned nothing, so there is no appearance or disappearance on screen to
    wait for, and every assertion below would otherwise run against the pending
    render. Awaiting the mock's own promise inside `act` is deterministic where
    a DOM query cannot be.
  */
  await act(async () => {
    await listEvents.mock.results.at(-1)?.value?.catch(() => {});
  });
}

beforeEach(() => {
  pathname = "/org";
});

describe("ConsoleSidebar", () => {
  describe("positive", () => {
    it("offers Dashboard and Events", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      await renderRail();

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /events/i })).toBeInTheDocument();
    });

    it("lists this wallet's races under Events once it is expanded", async () => {
      listEvents.mockResolvedValue({ events: [summary(1), summary(2)], unreadable: [] });

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /events/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Race 2" })).toBeInTheDocument();
    });

    it("offers the way back to the public site", async () => {
      // There is no site header over the console, so if the rail does not
      // carry this link there is no way out of /org but the address bar.
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      await renderRail();

      expect(screen.getByRole("link", { name: "STERUN" })).toHaveAttribute("href", "/");
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
      await userEvent.click(screen.getByRole("button", { name: /events/i }));

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
    it("still offers Events when the chain cannot be read", async () => {
      // The rail is navigation. A node that will not answer must not remove the
      // way back to the dashboard.
      listEvents.mockRejectedValue(new Error("rpc down"));

      await renderRail();

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /events/i })).toBeInTheDocument();
    });

    it("opens onto nothing when the chain cannot be read", async () => {
      // Empty, not absent. They look the same on screen and they are not the
      // same claim: absent would mean the expander itself had been taken away.
      listEvents.mockRejectedValue(new Error("rpc down"));

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /events/i }));

      const nav = screen.getByRole("navigation", { name: "Organiser console" });
      expect(within(nav).getByRole("list")).toBeEmptyDOMElement();
    });

    it("lets a hand on the expander beat the path", async () => {
      // Inside a race the path opens it; somebody who shuts it has said what
      // they want, and the rail must not reopen it under them.
      listEvents.mockResolvedValue({ events: [summary(1)], unreadable: [] });
      pathname = "/org/events/1";

      await renderRail();
      await userEvent.click(screen.getByRole("button", { name: /events/i }));

      expect(screen.queryByRole("link", { name: "Race 1" })).not.toBeInTheDocument();
    });
  });
});
