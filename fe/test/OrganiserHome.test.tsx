import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganiserHome } from "@/modules/organiser/OrganiserHome";
import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/events";
import type { EventStatus, SterunCategory, SterunEvent } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());
/* The organiser allowlist (STE-36). Allowed unless a test says otherwise. */
const isOrganiser = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));
vi.mock("@/lib/sterun", () => ({ readClient: { isOrganiser } }));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const SOMEONE_ELSE = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function summary(
  eventId: number,
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [],
): EventSummary {
  return {
    event: {
      eventId,
      organiser: ORGANISER,
      name: `Jakarta Marathon ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: 1_790_548_200n,
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories,
  };
}

function category(categoryId: number, overrides: Partial<SterunCategory> = {}): SterunCategory {
  const quota = overrides.quota ?? 300;
  const enteredCount = overrides.enteredCount ?? 180;
  return {
    eventId: 0,
    categoryId,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 250_000_000n,
    slotsLeft: quota - enteredCount,
    ...overrides,
  };
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<OrganiserHome />, { wrapper: Wrapper });
}

/** A read the test settles on purpose, so React Query is not left mid-flight. */
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return {
    promise,
    settle: async (value: unknown) => {
      resolve(value);
      await act(async () => {
        await promise;
      });
    },
  };
}

beforeEach(() => {
  listEvents.mockReset();
  isOrganiser.mockReset();
  isOrganiser.mockResolvedValue(true);
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

describe("OrganiserHome", () => {
  describe("positive", () => {
    it("lists the races this wallet organises and nobody else's", async () => {
      // The registry has no "events by organiser" view, so the page reads every
      // event and keeps its own. A race from another wallet showing up here
      // would read as one this organiser can manage, and they cannot.
      listEvents.mockResolvedValue({
        events: [summary(0), summary(1, { organiser: SOMEONE_ELSE, name: "Not Mine 10K" })],
        unreadable: [],
      });

      renderHome();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByText("Not Mine 10K")).not.toBeInTheDocument();
    });

    it("links each race to its event page", async () => {
      listEvents.mockResolvedValue({ events: [summary(4)], unreadable: [] });

      renderHome();

      const link = await screen.findByRole("link", { name: /Jakarta Marathon 4/ });
      expect(link).toHaveAttribute("href", "/events/4");
    });

    it("shows how full each distance is", async () => {
      listEvents.mockResolvedValue({
        events: [
          summary(0, {}, [
            category(0),
            category(1, { code: "5K", quota: 100, enteredCount: 100 }),
          ]),
        ],
        unreadable: [],
      });

      renderHome();

      const card = await screen.findByRole("link", { name: /Jakarta Marathon 0/ });
      expect(within(card).getByText("180 of 300 entered")).toBeInTheDocument();
      expect(within(card).getByText("100 of 100 entered")).toBeInTheDocument();
    });

    it("shows the status of every race, including one not open yet", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, { status: "Draft" }), summary(1, { status: "Open" })],
        unreadable: [],
      });

      renderHome();

      expect(await screen.findByText("Draft")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("offers to create a race when the wallet is allowed to publish", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome();

      const create = await screen.findByRole("link", { name: "Create event" });
      expect(create).toHaveAttribute("href", "/org/new");
    });
  });

  describe("edge", () => {
    it("shows a loading state before the first read comes back", async () => {
      const pending = deferred();
      listEvents.mockReturnValue(pending.promise);

      renderHome();

      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.queryByText(/not created a race/i)).not.toBeInTheDocument();
      await pending.settle({ events: [], unreadable: [] });
    });

    it("says so when this wallet has not created a race", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      renderHome();

      expect(await screen.findByText("You have not created a race yet")).toBeInTheDocument();
    });

    it("treats a registry full of other people's races as empty for this wallet", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, { organiser: SOMEONE_ELSE })],
        unreadable: [],
      });

      renderHome();

      expect(await screen.findByText("You have not created a race yet")).toBeInTheDocument();
    });

    it("shows a race that has no distances yet", async () => {
      // A run stopped after create_event leaves exactly this behind, and it is
      // the race an organiser most needs to find again.
      listEvents.mockResolvedValue({ events: [summary(0, { status: "Draft" })], unreadable: [] });

      renderHome();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.getByText("No distances yet.")).toBeInTheDocument();
    });

    it("warns that a race of theirs may be missing when some could not be loaded", async () => {
      // Whose they were is exactly what could not be read, so the page cannot
      // say "none of these were yours".
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [3, 4] });

      renderHome();

      expect(await screen.findByText(/may be missing from this list/i)).toBeInTheDocument();
    });

    it("says nothing about missing races when every one of them was read", async () => {
      // A warning that shows when it does not apply is how warnings stop being
      // read at all.
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome();

      await screen.findByText("Jakarta Marathon 0");
      expect(screen.queryByText(/may be missing from this list/i)).not.toBeInTheDocument();
    });

    it("does not offer Create event before the allowlist has answered", async () => {
      // Drawing the button and then taking it away is worse than a moment
      // without it.
      const pending = deferred();
      isOrganiser.mockReturnValue(pending.promise as Promise<boolean>);
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome();

      await screen.findByText("Jakarta Marathon 0");
      expect(screen.queryByRole("link", { name: "Create event" })).not.toBeInTheDocument();
      await pending.settle(true);
      expect(await screen.findByRole("link", { name: "Create event" })).toBeInTheDocument();
    });

    it("still offers Create event when the allowlist cannot be asked", async () => {
      // A node that failed to answer is not a refusal. The wizard lets the
      // wallet through on the same terms, and the contract still refuses on its
      // own before anything is signed.
      isOrganiser.mockRejectedValue(new Error("rpc unreachable"));
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome();

      expect(await screen.findByRole("link", { name: "Create event" })).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("asks for a wallet before showing anything", async () => {
      useWallet.setState({ address: null, isRestoring: false });

      renderHome();

      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
      expect(listEvents).not.toHaveBeenCalled();
    });

    it("keeps an organiser taken off the allowlist in charge of the races they run", async () => {
      // The allowlist gates create_event and nothing else. Hiding their races
      // would lock them out of something the contract still lets them do.
      isOrganiser.mockResolvedValue(false);
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome();

      expect(await screen.findByText(/cannot publish new races/i)).toBeInTheDocument();
      expect(screen.getByText(ORGANISER)).toBeInTheDocument();
      expect(screen.getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Create event" })).not.toBeInTheDocument();
    });

    it("reports a failed read as an error with a way out, never as no races", async () => {
      listEvents.mockRejectedValue(new Error("rpc unreachable"));
      renderHome();

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("You have not created a race yet")).not.toBeInTheDocument();

      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      await userEvent.click(screen.getByRole("button", { name: /try again/i }));

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
