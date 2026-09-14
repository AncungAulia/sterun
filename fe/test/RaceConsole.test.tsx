import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { useWallet } from "@/hooks/useWallet";
import { RaceConsole } from "@/modules/organiser/RaceConsole";
import { NeedsProvider } from "@/modules/organiser/component/NeedsContext";
import type { Need } from "@/modules/organiser/needs";
import type { RaceTab } from "@/modules/organiser/race-tab";
import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({
  getEvent: vi.fn(),
  listCategories: vi.fn(),
  listAddOns: vi.fn(),
  setEventStatus: vi.fn(),
  addScanner: vi.fn(),
  removeScanner: vi.fn(),
}));
vi.mock("@/lib/sterun", () => ({ readClient }));
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

function event(overrides: Partial<SterunEvent> = {}): SterunEvent {
  return {
    eventId: 4,
    organiser: ORGANISER,
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 1_790_548_200n,
    status: "Open",
    ...overrides,
  };
}

function category(overrides: Partial<SterunCategory> = {}): SterunCategory {
  return {
    eventId: 4,
    categoryId: 0,
    code: "5K",
    distanceM: 5_000,
    quota: 200,
    enteredCount: 120,
    priceStroops: 100_000_000n,
    slotsLeft: 80,
    ...overrides,
  };
}

function need(overrides: Partial<Need> = {}): Need {
  return {
    kind: "scanner",
    eventId: 4,
    eventName: "Fun Run Sleman",
    urgent: true,
    title: "Add a scanner - Fun Run Sleman",
    detail: "Runs in 3 days. Nobody can check runners in.",
    action: "Add a scanner",
    href: "/org/events/4?tab=scanners",
    ...overrides,
  };
}

function renderRace(tab: RaceTab = "overview", needs: Need[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <SidebarProvider>
      <NeedsProvider needs={needs}>
        <RaceConsole eventId={4} tab={tab} />
      </NeedsProvider>
    </SidebarProvider>,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  for (const fn of Object.values(readClient)) fn.mockReset();
  readClient.getEvent.mockResolvedValue(event());
  readClient.listCategories.mockResolvedValue([category()]);
  readClient.listAddOns.mockResolvedValue([]);
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

describe("RaceConsole", () => {
  describe("positive", () => {
    it("titles the page with the race and marks the tab being read", async () => {
      renderRace("scanners");

      expect(await screen.findByRole("heading", { name: /Fun Run Sleman/ })).toBeInTheDocument();
      const tabs = screen.getByRole("navigation", { name: "Race sections" });
      const links = within(tabs).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Overview", "Entries", "Scanners"]);
      expect(within(tabs).getByRole("link", { name: "Scanners" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(within(tabs).getByRole("link", { name: "Overview" })).not.toHaveAttribute(
        "aria-current",
      );
    });

    it("interrupts for this race's own urgent need", async () => {
      renderRace("overview", [need()]);

      expect(await screen.findByRole("note")).toHaveTextContent("Nobody can check runners in.");
    });
  });

  describe("negative", () => {
    it("does not offer to manage a race another wallet created", async () => {
      // Anyone can read a race; only its organiser can change it. Tabs full of
      // buttons that all fail would be worse than saying so once.
      readClient.getEvent.mockResolvedValue(event({ organiser: SOMEONE_ELSE }));
      renderRace();

      const page = await screen.findByRole("alertdialog", {
        name: "This race isn't yours to manage",
      });
      expect(page).toHaveAccessibleDescription(
        "It was created by another wallet, and only that wallet can manage it.",
      );
      // A page of its own: no race header, no tabs, no status action.
      expect(screen.queryByRole("navigation", { name: "Race sections" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /Fun Run Sleman/ })).not.toBeInTheDocument();
      // Exactly one way out, to the races that are this wallet's.
      const links = within(page).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName("Go to your races");
      expect(links[0]).toHaveAttribute("href", "/org");
    });

    it("does not interrupt for another race's need", async () => {
      renderRace("overview", [
        need({ eventId: 9, eventName: "Another race", href: "/org/events/9?tab=scanners" }),
      ]);

      await screen.findByRole("heading", { name: /Fun Run Sleman/ });
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("says the race could not be loaded rather than drawing an empty one", async () => {
      readClient.getEvent.mockRejectedValue(new Error("node down"));
      renderRace();

      expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this race");
    });
  });
});
