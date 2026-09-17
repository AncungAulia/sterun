import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api/client";
import type { EventSummary } from "@/lib/event/events";
import { OverviewTab } from "@/modules/organiser/race/components/OverviewTab";
import type { SterunAddOn } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({ listAddOns: vi.fn() }));
vi.mock("@/lib/chain/sterun", () => ({ readClient }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}));

const RUNNER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

const SUMMARY: EventSummary = {
  event: {
    eventId: 4,
    organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 4_000_000_000n,
    status: "Open",
  },
  categories: [
    {
      eventId: 4,
      categoryId: 0,
      code: "10K",
      distanceM: 10_000,
      quota: 200,
      enteredCount: 2,
      priceStroops: 100_000_000n,
      slotsLeft: 198,
    },
  ],
};

const JERSEY: SterunAddOn = {
  eventId: 4,
  addonId: 0,
  code: "JERSEY_M",
  priceStroops: 50_000_000n,
  quota: 3,
  reservedCount: 3,
  unitsLeft: 0,
};

function row(overrides: Record<string, unknown>) {
  return {
    token_id: 1,
    event_id: 4,
    category_id: 0,
    bib_no: 7,
    runner_address: RUNNER,
    state: "Entered",
    entered_at: "1700000000",
    claimed_at: null,
    finish_time_s: null,
    result_at: null,
    ...overrides,
  };
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<OverviewTab summary={SUMMARY} />, { wrapper: Wrapper });
}

beforeEach(() => {
  readClient.listAddOns.mockReset();
  readClient.listAddOns.mockResolvedValue([JERSEY]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({
    records: [
      row({ token_id: 1, bib_no: 7, state: "RacepackClaimed", claimed_at: "1700000500" }),
      row({ token_id: 2, bib_no: 8, entered_at: "1700000100" }),
    ],
    count: 2,
  });
});

describe("OverviewTab", () => {
  describe("positive", () => {
    it("fills the three cards from the chain and the index", async () => {
      renderTab();

      expect(screen.getByText("Entries").parentElement).toHaveTextContent(/2\s*of 200/);
      // 2 x 10 sUSD in fees plus 3 x 5 sUSD in jerseys.
      expect(await screen.findByText(/^35/)).toBeInTheDocument();
      expect(
        await screen.findByText((_, el) => el?.textContent === "1of 2" && el.tagName === "P"),
      ).toBeInTheDocument();
    });

    it("lists what happened, newest first", async () => {
      renderTab();

      // The wallet names a row, not the bib (Ancung, 2026-09-17).
      const items = await screen.findAllByRole("listitem", { name: /^G/ });
      expect(items[0]).toHaveAccessibleName(/collected their race pack$/);
      expect(items[1]).toHaveAccessibleName(/entered the 10K$/);
    });

    it("marks a sold-out add-on", async () => {
      renderTab();
      expect(await screen.findByText("Sold out")).toBeInTheDocument();
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says the index did not answer instead of reporting zero", async () => {
      vi.mocked(apiFetch).mockImplementation(async () => {
        throw new Error("down");
      });
      renderTab();

      expect(await screen.findByText("Activity could not be loaded")).toBeInTheDocument();
      expect(screen.getByText("Race packs collected").parentElement).toHaveTextContent(
        "Not loaded",
      );
    });
  });

  describe("edge", () => {
    it("writes an untimed finish as no official time, never as zero", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        records: [
          row({
            state: "Finished",
            claimed_at: "1700000500",
            finish_time_s: null,
            result_at: "1700009000",
          }),
        ],
        count: 1,
      });
      renderTab();

      expect(
        await screen.findByRole("listitem", { name: /finished the 10K with no official time$/ }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
    });

    it("says a race sells no add-ons when it sells none", async () => {
      readClient.listAddOns.mockResolvedValue([]);
      renderTab();
      expect(await screen.findByText("No add-ons")).toBeInTheDocument();
    });

    it("does not claim a failure while the index is still answering", () => {
      vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
      renderTab();
      expect(screen.queryByText("Activity could not be loaded")).not.toBeInTheDocument();
      expect(screen.getByRole("status", { name: "Loading activity" })).toBeInTheDocument();
    });
  });
});
