import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { EventSummary } from "@/lib/events";
import { EntriesTab } from "@/modules/organiser/component/EntriesTab";
import type { SterunAddOn } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({ listAddOns: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const WALLET_A = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const WALLET_B = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

const SUMMARY: EventSummary = {
  event: {
    eventId: 4,
    organiser: WALLET_A,
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
      code: "5K",
      distanceM: 5_000,
      quota: 100,
      enteredCount: 1,
      priceStroops: 0n,
      slotsLeft: 99,
    },
    {
      eventId: 4,
      categoryId: 1,
      code: "10K",
      distanceM: 10_000,
      quota: 100,
      enteredCount: 1,
      priceStroops: 0n,
      slotsLeft: 99,
    },
  ],
};

const JERSEY: SterunAddOn = {
  eventId: 4,
  addonId: 0,
  code: "JERSEY_L",
  priceStroops: 0n,
  quota: 50,
  reservedCount: 1,
  unitsLeft: 49,
};

function row(overrides: Record<string, unknown>) {
  return {
    token_id: 1,
    event_id: 4,
    category_id: 0,
    bib_no: 1,
    runner_address: WALLET_A,
    state: "Entered",
    entered_at: "1700000000",
    claimed_at: null,
    finish_time_s: null,
    result_at: null,
    ...overrides,
  };
}

const ROWS = [
  row({ token_id: 1, bib_no: 12, category_id: 0, runner_address: WALLET_A }),
  row({
    token_id: 2,
    bib_no: 7,
    category_id: 1,
    runner_address: WALLET_B,
    state: "RacepackClaimed",
    claimed_at: "1700000500",
    entered_at: "1700000100",
  }),
];

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<EntriesTab summary={SUMMARY} />, { wrapper: Wrapper });
}

async function bodyRows() {
  const table = await screen.findByRole("table");
  return within(table).getAllByRole("row").slice(1);
}

beforeEach(() => {
  readClient.listAddOns.mockReset();
  readClient.listAddOns.mockResolvedValue([JERSEY]);
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ records: ROWS, count: ROWS.length });
});

describe("EntriesTab", () => {
  describe("positive", () => {
    it("lists every entry with the columns from the design", async () => {
      renderTab();

      const table = await screen.findByRole("table");
      const heads = within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent);
      expect(heads).toEqual(["Wallet", "Bib", "Distance", "Entered", "Status"]);
      expect(await bodyRows()).toHaveLength(2);
      expect(screen.getByText("2 entries")).toBeInTheDocument();
    });

    it("finds a runner by bib and narrows by status", async () => {
      renderTab();
      await screen.findByRole("table");

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Search a bib number or a wallet" }),
        "12",
      );
      expect(await bodyRows()).toHaveLength(1);
      expect(screen.getByText("1 entry")).toBeInTheDocument();

      await userEvent.clear(screen.getByRole("searchbox"));
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "collected");
      const rows = await bodyRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Pack collected");
    });

    it("draws the Add-ons column once the index sends what each runner bought", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        records: [row({ addon_ids: [0] }), row({ token_id: 2, bib_no: 2, addon_ids: [] })],
        count: 2,
      });
      renderTab();

      const table = await screen.findByRole("table");
      expect(within(table).getByRole("columnheader", { name: "Add-ons" })).toBeInTheDocument();
      expect(await within(table).findByText("JERSEY_L")).toBeInTheDocument();
      expect(within(table).getByText("None")).toBeInTheDocument();
      expect(screen.getByText("Add-ons to hand out")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("never offers to search by name", async () => {
      renderTab();
      await screen.findByRole("table");
      expect(screen.queryByPlaceholderText(/name/i)).not.toBeInTheDocument();
    });

    it("draws no Add-ons column and no guessed count before the index sends add-ons", async () => {
      renderTab();
      const table = await screen.findByRole("table");
      expect(
        within(table).queryByRole("columnheader", { name: "Add-ons" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Add-ons to hand out")).not.toBeInTheDocument();
      expect(screen.getByText("Add-ons sold")).toBeInTheDocument();
    });

    it("says the entries could not be loaded rather than showing an empty race", async () => {
      vi.mocked(apiFetch).mockImplementation(async () => {
        throw new Error("down");
      });
      renderTab();
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the entries");
      expect(screen.queryByText("Nobody has entered yet")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("tells a search that matched nothing apart from an empty race", async () => {
      renderTab();
      await screen.findByRole("table");
      await userEvent.type(screen.getByRole("searchbox"), "999");
      expect(await screen.findByText("No entries match")).toBeInTheDocument();
    });

    it("says nobody has entered a race with no entries", async () => {
      vi.mocked(apiFetch).mockResolvedValue({ records: [], count: 0 });
      renderTab();
      expect(await screen.findByText("Nobody has entered yet")).toBeInTheDocument();
    });
  });
});
