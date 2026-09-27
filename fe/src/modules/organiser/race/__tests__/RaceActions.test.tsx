import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RaceActions } from "../components/RaceActions";
import type { EventSummary } from "@/lib/event/events";

const NOW = 1_790_000_000n;

const closes = vi.hoisted(() => ({ value: null as bigint | null }));
vi.mock("@/hooks/useRegistrationCloses", () => ({
  useRegistrationCloses: () => ({ data: closes.value, isPending: false }),
  closesKeys: { one: (id: number) => ["registration-closes", id] },
}));
vi.mock("@/hooks/useNowSeconds", () => ({ useNowSeconds: () => NOW }));
vi.mock("@/hooks/useEventMetadata", () => ({ useEventMetadata: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEvents", () => ({
  eventKeys: { all: ["events"] },
  useEventAddOns: () => ({ data: [] }),
}));
vi.mock("@/lib/wallet/kit", () => ({ signMessage: vi.fn() }));
vi.mock("@/hooks/useWallet", () => ({
  useWallet: (select?: (state: { address: string }) => unknown) =>
    select ? select({ address: "GA5V" }) : { address: "GA5V" },
}));
vi.mock("@/modules/organiser/shared/hooks/useOrganiser", () => ({
  useSetEventStatus: () => ({ write: vi.fn(), phase: "idle", isBusy: false, error: null, reset: vi.fn() }),
  useSetRegistrationCloses: () => ({ write: vi.fn(), phase: "idle" }),
}));

function summary(overrides: Partial<EventSummary["event"]> = {}): EventSummary {
  return {
    event: {
      eventId: 3,
      name: "Merdeka Run 2026",
      status: "Open",
      startsAt: NOW + 2_000_000n,
      organiser: "GA5V",
      uri: "",
      metadataHash: "",
      ...overrides,
    },
    categories: [
      { categoryId: 0, eventId: 3, code: "10K", quota: 100, enteredCount: 88, slotsLeft: 12 },
      { categoryId: 1, eventId: 3, code: "5K", quota: 50, enteredCount: 50, slotsLeft: 0 },
    ],
  } as unknown as EventSummary;
}

function draw(event: Partial<EventSummary["event"]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<RaceActions summary={summary(event)} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  closes.value = null;
});

describe("RaceActions", () => {
  describe("positive", () => {
    it("puts everything behind one labelled menu on a live race", async () => {
      draw();

      // Nothing leads: none of these is what somebody opens the page to do.
      expect(screen.queryByRole("button", { name: "Add entries" })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Manage race" }));

      expect(await screen.findByRole("menuitem", { name: "Add entries" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Set closing date" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Close entries" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Cancel this race" })).toBeInTheDocument();
    });

    it("keeps one button on a draft, the one thing a draft exists for", async () => {
      draw({ status: "Draft" });

      expect(screen.getByRole("button", { name: "Open entries" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Manage race" }));
      expect(await screen.findByRole("menuitem", { name: "Cancel this race" })).toBeInTheDocument();
    });

    it("says Set on a race with no date and Change on one that has", async () => {
      closes.value = NOW + 100n;

      draw();
      await userEvent.click(screen.getByRole("button", { name: "Manage race" }));

      expect(await screen.findByRole("menuitem", { name: "Change closing date" })).toBeInTheDocument();
    });

    it("offers reopening on a closed race, from the same menu", async () => {
      draw({ status: "Closed" });

      await userEvent.click(screen.getByRole("button", { name: "Manage race" }));

      expect(await screen.findByRole("menuitem", { name: "Reopen entries" })).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("offers nothing at all on a race that is over", () => {
      draw({ status: "Completed" });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("offers nothing on a cancelled race either", () => {
      draw({ status: "Cancelled" });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
