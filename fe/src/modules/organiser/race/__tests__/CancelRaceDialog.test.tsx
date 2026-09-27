import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CancelRaceDialog } from "../components/CancelRaceDialog";
import type { EventSummary } from "@/lib/event/events";

const write = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/modules/organiser/shared/hooks/useOrganiser", () => ({
  useSetEventStatus: () => ({ write, phase: "idle", isBusy: false, error: null, reset: vi.fn() }),
}));
vi.mock("@/hooks/useEvents", () => ({
  eventKeys: { all: ["events"] },
  useEventAddOns: () => ({ data: [] }),
}));

function summary(entered: number): EventSummary {
  return {
    event: { eventId: 3, name: "TESTING LARI 3", status: "Open", organiser: "GA5V" },
    categories: [
      {
        categoryId: 0,
        eventId: 3,
        code: "10K",
        quota: 100,
        enteredCount: entered,
        slotsLeft: 100 - entered,
        // 10 sUSD in stroops.
        priceStroops: 100_000_000n,
      },
    ],
  } as unknown as EventSummary;
}

function draw(entered = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<CancelRaceDialog summary={summary(entered)} onClose={vi.fn()} />, {
    wrapper: Wrapper,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CancelRaceDialog", () => {
  describe("positive", () => {
    it("cancels once the name has been typed", async () => {
      draw();

      await userEvent.type(screen.getByLabelText("Type the race name to confirm"), "TESTING LARI 3");
      await userEvent.click(screen.getByRole("button", { name: "Cancel this race" }));

      expect(write).toHaveBeenCalledWith({ eventId: 3, status: "Cancelled" });
    });

    it("says what runners have paid, because nothing here can send it back", () => {
      draw(412);

      expect(
        screen.getByText(/412 runners have entered, and they have paid 4,120 sUSD/),
      ).toBeInTheDocument();
      expect(screen.getByText(/went straight to your wallet/)).toBeInTheDocument();
    });

    it("says plainly when nobody is owed anything", () => {
      draw(0);

      expect(screen.getByText("Nobody has entered this race.")).toBeInTheDocument();
      expect(screen.queryByText(/have paid/)).not.toBeInTheDocument();
    });

    it("never promises a delete", () => {
      draw();

      expect(screen.getByText(/The race page stays online/)).toBeInTheDocument();
      expect(screen.getByText(/drops off the directory by itself/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("will not cancel until the name matches exactly", async () => {
      draw();

      const confirm = screen.getByRole("button", { name: "Cancel this race" });
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByLabelText("Type the race name to confirm"), "TESTING LARI");
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByLabelText("Type the race name to confirm"), " 3");
      expect(confirm).toBeEnabled();
    });

    it("offers a way out that does not read as cancelling", () => {
      draw();

      // Two buttons both saying Cancel is how somebody presses the wrong one.
      expect(screen.getByRole("button", { name: "Keep the race" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    });
  });
});
