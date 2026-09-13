import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConsoleSidebar } from "@/modules/organiser/component/ConsoleSidebar";
import type { EventSummary } from "@/lib/events";
import type { EventStatus, SterunEvent } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/org" }));

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

describe("ConsoleSidebar", () => {
  describe("positive", () => {
    it("offers Dashboard and Events", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });

      expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /events/i })).toBeInTheDocument();
    });

    it("lists this wallet's races under Events once it is expanded", async () => {
      listEvents.mockResolvedValue({ events: [summary(1), summary(2)], unreadable: [] });

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });
      await userEvent.click(await screen.findByRole("button", { name: /events/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Race 2" })).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("does not list races another wallet organises", async () => {
      listEvents.mockResolvedValue({
        events: [summary(1), summary(2, { organiser: THEIRS })],
        unreadable: [],
      });

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });
      await userEvent.click(await screen.findByRole("button", { name: /events/i }));

      expect(screen.getByRole("link", { name: "Race 1" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Race 2" })).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("still offers Events when the chain cannot be read", async () => {
      // The rail is navigation. A node that will not answer must not remove the
      // way back to the dashboard.
      listEvents.mockRejectedValue(new Error("rpc down"));

      render(<ConsoleSidebar address={MINE} />, { wrapper: Wrapper });

      expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /events/i })).toBeInTheDocument();
    });
  });
});
