import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordResults } from "../components/RecordResults";
import { ResultsProvider } from "../components/ResultsContext";
import { ResultsTab } from "../components/ResultsTab";
import type { ResultsReview, ReviewedRow } from "../lib/results-preview";
import type { EventSummary } from "@/lib/event/events";

const preview = vi.hoisted(() => vi.fn());
vi.mock("../lib/results-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/results-preview")>()),
  previewResults: preview,
}));

const records = vi.hoisted(() => ({ value: [] as unknown[], failed: false }));
vi.mock("@/modules/organiser/shared/hooks/useRaceRecords", () => ({
  useRaceRecords: () => new Map([[3, records.value]]),
  useRaceRecordsFailed: () => records.failed,
}));

const write = vi.hoisted(() => vi.fn());
vi.mock("@/modules/organiser/shared/hooks/useOrganiser", () => ({
  useRecordResults: () => ({ write }),
}));
vi.mock("@/lib/wallet/kit", () => ({ signMessage: vi.fn(async () => "sig") }));
vi.mock("@/hooks/useWallet", () => ({
  useWallet: (select?: (state: { address: string }) => unknown) =>
    select ? select({ address: "GA5V" }) : { address: "GA5V" },
}));
const recordOf = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chain/sterun", () => ({ readClient: { recordOf } }));

const summary = {
  event: { eventId: 3, name: "Merdeka Run 2026", status: "Closed" },
  categories: [
    { categoryId: 0, code: "10K", quota: 10, enteredCount: 4 },
    { categoryId: 1, code: "5K", quota: 10, enteredCount: 2 },
  ],
} as unknown as EventSummary;

function row(overrides: Partial<ReviewedRow> = {}): ReviewedRow {
  return {
    line: 2,
    bibNo: 1,
    categoryId: 0,
    finishTimeS: 3161,
    kind: "timed",
    tokenId: 1,
    state: "RacepackClaimed",
    anomalies: [],
    ...overrides,
  };
}

function review(rows: ReviewedRow[]): ResultsReview {
  const publishable = rows.filter((entry) => entry.anomalies.length === 0);
  return {
    rows,
    publishable,
    counts: { total: rows.length, publishable: publishable.length },
  } as unknown as ResultsReview;
}

function Screen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <ResultsProvider>
      <RecordResults eventId={3} />
      <ResultsTab summary={summary} />
    </ResultsProvider>,
    { wrapper: Wrapper },
  );
}

async function upload(rows: ReviewedRow[]): Promise<void> {
  preview.mockResolvedValue(review(rows));
  Screen();
  const file = new File(["bib,time\n1,52:41\n"], "merdeka-finish.csv", { type: "text/csv" });
  await userEvent.upload(screen.getByLabelText("Choose a results file"), file);
  await screen.findByRole("searchbox", { name: "Search a bib number" });
}

beforeEach(() => {
  vi.clearAllMocks();
  records.value = [];
  records.failed = false;
  write.mockResolvedValue(undefined);
});

describe("ResultsTab", () => {
  describe("positive", () => {
    it("asks for the file and nothing else, before one is chosen", () => {
      Screen();

      expect(screen.getByText("Drop the timing file here")).toBeInTheDocument();
      // The signing button belongs to the header, and there is nothing to sign.
      expect(screen.queryByRole("button", { name: /Sign and record/ })).not.toBeInTheDocument();
    });

    it("counts what will be published on the button, not what is in the file", async () => {
      await upload([
        row({ tokenId: 1, bibNo: 1 }),
        row({ tokenId: 2, bibNo: 2, kind: "untimed", finishTimeS: null }),
        row({
          line: 4,
          bibNo: 3,
          tokenId: null,
          anomalies: [{ kind: "unknown_bib", reason: "Bib 3 is not in this race.", severity: "reverts" }],
        }),
      ]);

      expect(screen.getByRole("button", { name: "Sign and record 2 results" })).toBeInTheDocument();
      expect(screen.getByText("1 row is being left out.")).toBeInTheDocument();
      expect(screen.getByText(/Bib 3 is not in this race/)).toBeInTheDocument();
    });

    it("records in batches and says the results are permanent before signing", async () => {
      await upload([row({ tokenId: 1 }), row({ tokenId: 2, bibNo: 2 })]);

      await userEvent.click(screen.getByRole("button", { name: "Sign and record 2 results" }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(/cannot be changed, corrected or removed/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Your wallet will ask you once/)).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith({
        eventId: 3,
        results: [
          { tokenId: 1, kind: "timed", finishTimeS: 3161 },
          { tokenId: 2, kind: "timed", finishTimeS: 3161 },
        ],
      });
      expect(await within(dialog).findByText("2 results recorded")).toBeInTheDocument();
    });

    it("shows what is already on chain when no file is open", () => {
      records.value = [
        { tokenId: 1, bibNo: 1, categoryId: 0, state: "Finished", finishTimeS: 3161 },
        { tokenId: 2, bibNo: 2, categoryId: 1, state: "Finished", finishTimeS: null },
        { tokenId: 3, bibNo: 3, categoryId: 0, state: "Dnf", finishTimeS: null },
      ];

      Screen();

      expect(screen.getByText("Results recorded")).toBeInTheDocument();
      expect(screen.getByText("52:41")).toBeInTheDocument();
      // Never a zero: a finish with no official time is a result of its own.
      expect(screen.getByText("No official time")).toBeInTheDocument();
      expect(screen.getByText("Did not finish")).toBeInTheDocument();
      // And another file can still be uploaded for the runners with no result.
      expect(screen.getByText("Drop the timing file here")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("offers no way to sign a file whose every row was held", async () => {
      await upload([
        row({
          tokenId: null,
          anomalies: [
            { kind: "ambiguous_bib", reason: "Bib 1 exists in both 10K and 5K.", severity: "wrong" },
          ],
        }),
      ]);

      expect(screen.queryByRole("button", { name: /Sign and record/ })).not.toBeInTheDocument();
      expect(screen.getByText("1 row is being left out.")).toBeInTheDocument();
    });

    it("says nothing was recorded when the only batch is declined", async () => {
      // One batch here, so the failure is the whole run. What it must never do
      // is claim something landed, and it must not offer to "try again" over a
      // run that might have. Partial landing across batches is covered in
      // `useResultsRun.test.tsx`, where a plan can hold more than one.
      await upload([row({ tokenId: 1 }), row({ tokenId: 2, bibNo: 2 })]);
      write.mockRejectedValueOnce(new Error("User declined the transaction"));
      recordOf.mockResolvedValue({ state: "RacepackClaimed" });

      await userEvent.click(screen.getByRole("button", { name: "Sign and record 2 results" }));
      const dialog = screen.getByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));

      expect(await within(dialog).findByText("Nothing was recorded")).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    });

    it("says it could not look rather than that the race has no results", () => {
      records.failed = true;

      Screen();

      expect(screen.getByText("We could not load this race's results")).toBeInTheDocument();
      expect(screen.queryByText("Results recorded")).not.toBeInTheDocument();
    });
  });
});
