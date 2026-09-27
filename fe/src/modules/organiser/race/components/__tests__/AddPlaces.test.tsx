import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/event/events";
import { AddPlaces } from "@/modules/organiser/race/components/AddPlaces";
import type { SterunCategory } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({ increaseQuota: vi.fn(), listCategories: vi.fn() }));
vi.mock("@/lib/chain/sterun", () => ({ readClient }));

const kit = vi.hoisted(() => ({ signMessage: vi.fn(), signTransaction: vi.fn() }));
vi.mock("@/lib/wallet/kit", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: kit.signTransaction,
  signMessage: kit.signMessage,
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

// The announcement text is hashed by stellar-sdk, which jsdom's Uint8Array
// breaks; its exact bytes are tested in lib/event and add-places-run instead.
const announcements = vi.hoisted(() => ({ publishAnnouncement: vi.fn() }));
vi.mock("@/lib/event/announcements", () => ({
  MAX_ANNOUNCEMENT_CHARS: 2000,
  announcementToSign: ({ body }: { body: string }) => `SIGN:${body}`,
  publishAnnouncement: announcements.publishAnnouncement,
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function category(overrides: Partial<SterunCategory> = {}): SterunCategory {
  return {
    eventId: 4,
    categoryId: 0,
    code: "10K",
    distanceM: 10_000,
    quota: 500,
    enteredCount: 500,
    priceStroops: 100_000_000n,
    slotsLeft: 0,
    ...overrides,
  };
}

function summary(
  status: EventSummary["event"]["status"],
  categories: SterunCategory[],
  startsAt = 4_000_000_000n,
): EventSummary {
  return {
    event: { eventId: 4, organiser: ORGANISER, name: "Merdeka Run", metadataHash: "a".repeat(64), uri: "", startsAt, status },
    categories,
  };
}

const TWO = [
  category(),
  category({ categoryId: 1, code: "5K", quota: 400, enteredCount: 312, slotsLeft: 88 }),
];

function renderIt(value: EventSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<AddPlaces summary={value} />, { wrapper: Wrapper });
}

async function openFor(code: string) {
  await userEvent.click(screen.getByRole("button", { name: "Add entries" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${code}`) }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
  kit.signMessage.mockResolvedValue("c2lnbmF0dXJl");
  readClient.increaseQuota.mockResolvedValue({ value: undefined, txHash: "ab", ledger: 1 });
  readClient.listCategories.mockResolvedValue(TWO);
  announcements.publishAnnouncement.mockResolvedValue({});
});

describe("AddPlaces", () => {
  describe("where it is offered", () => {
    it("is a menu of distances, each saying how full it is", async () => {
      renderIt(summary("Open", TWO));
      await userEvent.click(screen.getByRole("button", { name: "Add entries" }));

      const menu = await screen.findByRole("menu");
      expect(within(menu).getByText("Which distance?")).toBeInTheDocument();
      const [tenK, fiveK] = within(menu).getAllByRole("menuitem");
      expect(tenK).toHaveTextContent("10K");
      expect(tenK).toHaveTextContent("500 of 500");
      expect(tenK).toHaveTextContent("Full");
      expect(fiveK).toHaveTextContent("312 of 400");
      expect(fiveK).not.toHaveTextContent("Full");
    });

    it("opens the dialog straight away on a race with one distance", async () => {
      renderIt(summary("Closed", [category()]));
      await userEvent.click(screen.getByRole("button", { name: "Add entries" }));

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(await screen.findByRole("dialog")).toHaveTextContent("Add entries to 10K");
    });

    it("is not offered on a draft, a race that has run, or a race with no distances", () => {
      for (const value of [
        summary("Draft", TWO),
        summary("Completed", TWO),
        summary("Open", TWO, 1_000n),
        summary("Open", []),
      ]) {
        const { container, unmount } = renderIt(value);
        expect(container).toBeEmptyDOMElement();
        unmount();
      }
    });
  });

  describe("the form", () => {
    it("writes the announcement from the numbers and refuses a number that is not higher", async () => {
      renderIt(summary("Open", TWO));
      const dialog = await openFor("10K");
      const submit = within(dialog).getByRole("button", { name: "Add entries and announce" });

      expect(dialog).toHaveTextContent("Entries now500");
      expect(within(dialog).getByRole("note")).toHaveTextContent("Entries for 10K raised from 500 to ?");
      expect(submit).toBeDisabled();

      await userEvent.type(within(dialog).getByLabelText("New number of entries"), "500");
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Enter a number above 500. Entries cannot go down or stay the same.",
      );
      expect(submit).toBeDisabled();

      await userEvent.clear(within(dialog).getByLabelText("New number of entries"));
      await userEvent.type(within(dialog).getByLabelText("New number of entries"), "800");
      expect(within(dialog).getByRole("note")).toHaveTextContent("Entries for 10K raised from 500 to 800.");
      expect(dialog).toHaveTextContent("300 more entries. Bib numbers carry on from the last one.");
      expect(submit).toBeEnabled();
      expect(kit.signMessage).not.toHaveBeenCalled();
    });
  });

  describe("the run", () => {
    it("signs the sentence and the note, raises the quota, publishes, then says it is done", async () => {
      renderIt(summary("Open", TWO));
      const dialog = await openFor("10K");
      await userEvent.type(within(dialog).getByLabelText("New number of entries"), "800");
      await userEvent.type(within(dialog).getByLabelText("Add a note (optional)"), "Second batch.");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add entries and announce" }));

      expect(await screen.findByText("10K now has 800 entries")).toBeInTheDocument();
      const body = "Entries for 10K raised from 500 to 800.\n\nSecond batch.";
      expect(kit.signMessage).toHaveBeenCalledWith(`SIGN:${body}`, { address: ORGANISER });
      expect(readClient.increaseQuota).toHaveBeenCalledWith(
        { eventId: 4, categoryId: 0, newQuota: 800 },
        expect.objectContaining({ publicKey: ORGANISER }),
      );
      expect(announcements.publishAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 4, signer: ORGANISER, body, signature: "c2lnbmF0dXJl" }),
      );
      expect(screen.getByText("Runners can enter 10K again, and the announcement is on the race page.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "See the race page" })).toHaveAttribute("href", "/events/4");

      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("changes nothing when the announcement is declined, and can go back to the form", async () => {
      kit.signMessage.mockRejectedValue(new Error("User declined the request"));
      renderIt(summary("Open", TWO));
      const dialog = await openFor("5K");
      await userEvent.type(within(dialog).getByLabelText("New number of entries"), "600");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add entries and announce" }));

      expect(await screen.findByText("Entries not added")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("You declined this in your wallet. Nothing was sent.");
      expect(readClient.increaseQuota).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByLabelText("New number of entries")).toHaveValue("600");
    });

    it("once the entries landed, offers only Publish the announcement, and cannot be closed", async () => {
      announcements.publishAnnouncement
        .mockRejectedValueOnce(new ApiError(0, "unreachable", "Could not reach our server. Check your signal and try again."))
        .mockResolvedValueOnce({});
      renderIt(summary("Open", TWO));
      const dialog = await openFor("10K");
      await userEvent.type(within(dialog).getByLabelText("New number of entries"), "800");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add entries and announce" }));

      expect(await screen.findByText("Entries added, announcement not published")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reach our server");
      const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["Publish the announcement"]);

      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Publish the announcement" }));
      expect(await screen.findByText("10K now has 800 entries")).toBeInTheDocument();
      expect(readClient.increaseQuota).toHaveBeenCalledTimes(1);
      expect(kit.signMessage).toHaveBeenCalledTimes(1);
    });

    it("says the entries wait for reopening on a closed race", async () => {
      renderIt(summary("Closed", TWO));
      const dialog = await openFor("5K");
      await userEvent.type(within(dialog).getByLabelText("New number of entries"), "450");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add entries and announce" }));

      expect(await screen.findByText("5K now has 450 entries")).toBeInTheDocument();
      expect(screen.getByText(/Runners can enter 5K once you reopen entries/)).toBeInTheDocument();
    });
  });
});
