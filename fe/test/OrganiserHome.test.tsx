import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganiserHome } from "@/modules/organiser/OrganiserHome";
import { NeedsProvider } from "@/modules/organiser/component/NeedsContext";
import type { Need } from "@/modules/organiser/needs";
import { WalletGate } from "@/components/layouts/WalletGate";
import { SidebarProvider } from "@/components/ui/sidebar";
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
/*
  The dashboard reads the index for each race's entries-per-day line, and
  `vitest.config.ts` points NEXT_PUBLIC_API_URL at the live API. A refusal
  rather than an empty answer, for two reasons: it is what a test must never
  do (reach the network), and it is also the state the page has to survive.
  A request that was never answered is silence, not a finding, so no need is
  invented from it and every row still draws.
*/
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(() => Promise.reject(new Error("the index is unreachable"))),
}));
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

/**
 * The page inside its gate, which is how the app draws it.
 *
 * `OrganiserHome` used to carry `WalletGate` itself. The console shell moved it
 * up to `app/(organiser)/org/layout.tsx`, so that every page under `/org` is
 * gated once rather than each remembering to. The gate is still what a wallet
 * meets before this page, so the test keeps asking for the page through it:
 * what changed is where the wrapper is written, not what is being tested.
 */
function renderHome(needs: Need[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  /*
    `SidebarProvider` because `ConsoleHeader` carries the rail's collapse
    button, and `useSidebar` throws outside the provider. The real route gets it
    from `ConsoleFrame`; rendering the page without it would be testing a tree
    the app never builds.
  */
  return render(
    <WalletGate>
      <SidebarProvider>
        <NeedsProvider needs={needs}>
          <OrganiserHome />
        </NeedsProvider>
      </SidebarProvider>
    </WalletGate>,
    { wrapper: Wrapper },
  );
}

/**
 * A need as `ConsoleFrame` would have handed it down. The page never builds
 * these itself, which is why the tests hand them in rather than arranging a
 * race that would produce one: `buildNeeds` has its own suite, and a dashboard
 * test that depended on the wall clock would go red on its own one morning.
 */
function need(overrides: Partial<Need> = {}): Need {
  return {
    kind: "scanner",
    eventId: 0,
    eventName: "Jakarta Marathon 0",
    urgent: true,
    title: "Add a scanner - Jakarta Marathon 0",
    detail: "Runs in 3 days. Nobody can check runners in.",
    action: "Add a scanner",
    href: "/org/events/0?tab=scanners",
    ...overrides,
  };
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

    it("links each race to the page where it is managed", async () => {
      // It used to link to the public event page, because the console had no
      // page of its own. The row is the way in to the race now, so pointing it
      // outwards would send an organiser to the one version of the race they
      // cannot change anything on.
      listEvents.mockResolvedValue({ events: [summary(4)], unreadable: [] });

      renderHome();

      // Two links per row since the action at the end became an icon: the name
      // and the icon, both named after the race so a screen reader is told
      // which race each one opens.
      const links = await screen.findAllByRole("link", { name: /Jakarta Marathon 4/ });
      expect(links).toHaveLength(2);
      for (const link of links) expect(link).toHaveAttribute("href", "/org/events/4");
    });

    it("puts every race in one table rather than a card each", async () => {
      // The question this page is opened with is comparative: which of my races
      // is behind. A grid of cards makes that a scroll.
      listEvents.mockResolvedValue({
        events: [summary(0), summary(1, { name: "Borobudur Trial" })],
        unreadable: [],
      });

      renderHome();

      const table = await screen.findByRole("table");
      expect(within(table).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(within(table).getByText("Borobudur Trial")).toBeInTheDocument();
    });

    it("shows how full each race is, every distance added together", async () => {
      // The per-distance breakdown moved into the race's own page. A dashboard
      // row answers "is this one behind", and a race with four distances would
      // otherwise be four lines tall in a table meant for comparing races.
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

      expect(await screen.findByText("280 / 400")).toBeInTheDocument();
    });

    it("totals the entries and the money across every race", async () => {
      // 180 at 25 sUSD plus 100 at 25 sUSD. The figure an organiser checks
      // first is what has actually come in.
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

      expect(await screen.findByText("280")).toBeInTheDocument();
      expect(screen.getByText("7,000")).toBeInTheDocument();
      expect(screen.getByText("sUSD")).toBeInTheDocument();
    });

    it("compares the races, under a title that is not Pace", async () => {
      // In a running product "pace" means minutes per kilometre, so a runner
      // glancing at this screen would read the chart as being about speed.
      listEvents.mockResolvedValue({ events: [summary(0, {}, [category(0)])], unreadable: [] });

      const { container } = renderHome();

      expect(await screen.findByText("Entries comparison")).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/pace/i);
    });

    it("ranks what is moving beside the comparison", async () => {
      listEvents.mockResolvedValue({ events: [summary(0, {}, [category(0)])], unreadable: [] });

      renderHome();

      expect(await screen.findByText("Trending entries")).toBeInTheDocument();
      // The index is refused in these tests, so there is nothing to rank, and
      // the panel says so rather than leaving an empty box on the page.
      expect(screen.getByText("No entries in the last 7 days")).toBeInTheDocument();
    });

    it("shows the status of every race, including one not open yet", async () => {
      // The attribute is what a stylesheet and a test match on, and the
      // sentence is what a person reads. Both are asserted, because the
      // attribute alone passed happily while the word "Draft" was on screen,
      // and "Draft" is the one status word this app never prints.
      listEvents.mockResolvedValue({
        events: [summary(0, { status: "Draft" }), summary(1, { status: "Open" })],
        unreadable: [],
      });

      const { container } = renderHome();

      await screen.findByText("Jakarta Marathon 0");
      expect(container.querySelector('[data-status="Draft"]')).not.toBeNull();
      expect(container.querySelector('[data-status="Open"]')).not.toBeNull();
      expect(screen.getByText("Not open yet")).toBeInTheDocument();
      expect(screen.getByText("Open for entry")).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/draft/i);
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
      // No categories means no places and none taken, and the row says exactly
      // that rather than dividing one by the other.
      expect(screen.getByText("0 / 0")).toBeInTheDocument();
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

  describe("the one thing that interrupts", () => {
    it("draws a banner for a race days away with nobody able to check runners in", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome([need()]);

      const banner = await screen.findByRole("note");
      expect(within(banner).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(within(banner).getByText(/Nobody can check runners in/)).toBeInTheDocument();
      expect(within(banner).getByRole("link", { name: "Add a scanner" })).toHaveAttribute(
        "href",
        "/org/events/0?tab=scanners",
      );
    });

    it("leaves everything else to the bell", async () => {
      // The banner fires for one case. A second kind of thing reaching it is
      // how an interruption turns into furniture nobody reads.
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderHome([need({ kind: "results", urgent: false, action: "Upload results" })]);

      await screen.findByText("Jakarta Marathon 0");
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("still draws every race when the index cannot be reached at all", async () => {
      // The chain says which races exist and how full they are; the index only
      // says when each entry arrived. Losing the second costs the line in each
      // row and nothing else, and the row must not go with it.
      listEvents.mockResolvedValue({ events: [summary(0, {}, [category(0)])], unreadable: [] });

      renderHome();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.getByText("180 / 300")).toBeInTheDocument();
      // A rule, not a line: no entries known is an absence, not a measurement.
      const spark = screen.getByRole("img", { name: /Entries over the last 14 days/ });
      expect(spark.querySelector("line")).not.toBeNull();
      expect(spark.querySelector("path")).toBeNull();
    });

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
