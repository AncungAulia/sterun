import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateEvent } from "@/modules/organiser/CreateEvent";
import { useWallet } from "@/hooks/useWallet";

const createEvent = vi.hoisted(() => vi.fn(async () => ({ value: 4, txHash: "tx1", ledger: 1 })));
const addCategory = vi.hoisted(() => vi.fn(async () => ({ value: 0, txHash: "tx2", ledger: 1 })));
const setEventStatus = vi.hoisted(() =>
  vi.fn(async () => ({ value: undefined, txHash: "tx3", ledger: 1 })),
);
const fetchEventMetadata = vi.hoisted(() => vi.fn());
const uploadEventFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sterun", () => ({ readClient: { createEvent, addCategory, setEventStatus } }));
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  fetchEventMetadata,
}));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(async (xdr: string) => ({ signedTxXdr: xdr })),
  signMessage: vi.fn(async () => "c2ln"),
  walletErrorMessage: (e: unknown) => String(e),
}));
vi.mock("@/lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload")>()),
  uploadEventFile,
}));

/**
 * These drive the whole wizard through real clicks, and filling the details
 * step alone now opens and closes three calendars. That is comfortably over
 * vitest's five second default once the suite runs files in parallel, and a
 * timeout there says nothing about the code.
 */
vi.setConfig({ testTimeout: 20_000 });

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { user: userEvent.setup(), ...render(<CreateEvent />, { wrapper: Wrapper }) };
}

/** Fill everything step one insists on, then move to the document step. */
async function fillDetails(user: ReturnType<typeof userEvent.setup>, name = "Jakarta Sunrise 10K") {
  await user.type(screen.getByLabelText(/Event name/), name);

  await user.click(screen.getByRole("combobox", { name: "Country" }));
  await user.click(await screen.findByRole("option", { name: "Indonesia" }));
  await user.click(screen.getByRole("combobox", { name: "Province" }));
  await user.click(await screen.findByRole("option", { name: "DKI Jakarta" }));
  await user.click(screen.getByRole("combobox", { name: "City" }));
  await user.click((await screen.findAllByRole("option"))[0]!);

  await user.type(
    screen.getByLabelText(/Google Maps link/),
    "https://www.google.com/maps/@-6.2185,106.8026,17z",
  );
  await user.type(screen.getByLabelText(/Description/), "Two laps of the park.");
  // Dates come from the calendar now, the way an organiser sets them. The clock
  // is frozen in beforeEach so the calendar always opens on the month these
  // clicks expect.
  // Distinct days, because the form now refuses a schedule that cannot happen:
  // entries open, then close, then the race is run.
  const days: [string, RegExp][] = [
    ["Registration opens date", /September 7th, 2026/],
    ["Registration closes date", /September 27th, 2026/],
    ["Race date date", /September 28th, 2026/],
  ];
  for (const [field, day] of days) {
    await user.click(screen.getByRole("button", { name: field }));
    await user.click(screen.getByRole("button", { name: day }));
  }
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

/** Fill the one distance the wizard starts with, then move to the file step. */
async function fillDistances(
  user: ReturnType<typeof userEvent.setup>,
  { code = "10K", price = "25" }: { code?: string; price?: string } = {},
) {
  await user.type(screen.getByLabelText(/^Code/), code);
  await user.type(screen.getByLabelText(/Distance in kilometres/), "10");
  await user.type(screen.getByLabelText(/Maximum entries/), "300");
  if (price) await user.type(screen.getByLabelText(/Entry fee in sUSD/), price);
  await user.clear(screen.getByLabelText(/Start time/));
  await user.type(screen.getByLabelText(/Start time/), "06:00");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-07T00:00:00Z"));
  vi.clearAllMocks();
  fetchEventMetadata.mockResolvedValue({ status: "unavailable", reason: "not reachable" });
  uploadEventFile.mockImplementation(async ({ expectedSha256 }: { expectedSha256?: string }) => ({
    url: `https://api-sterun.jameshub.fun/files/${expectedSha256}.json`,
    sha256: expectedSha256,
    size: 512,
    contentType: "application/json",
    created: true,
  }));
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

afterEach(() => vi.useRealTimers());

describe("CreateEvent", () => {
  describe("publishing the details file", () => {
    it("records the address the backend stored it at", async () => {
      // The point of the whole endpoint: the organiser hosts nothing, and the
      // uri that lands on chain is one the store guarantees keeps serving the
      // same bytes.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.click(screen.getByRole("button", { name: /publish the details file/i }));
      await screen.findByText("Published");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: expect.stringContaining("https://api-sterun.jameshub.fun/files/"),
          metadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        expect.anything(),
      );
    });

    it("signs as the connected organiser", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.click(screen.getByRole("button", { name: /publish the details file/i }));
      await screen.findByText("Published");

      expect(uploadEventFile).toHaveBeenCalledWith(
        expect.objectContaining({ address: ORGANISER, contentType: "application/json" }),
      );
    });

    it("still proves the file is really being served before trusting it", async () => {
      // Uploading is not the same as being readable. The check runs the same
      // code path the public event page uses, so a document that passes here
      // passes there.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.click(screen.getByRole("button", { name: /publish the details file/i }));
      await screen.findByText("Published");

      expect(fetchEventMetadata).toHaveBeenCalledWith(
        expect.stringContaining("/files/"),
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
    });

    it("leaves the step unpublished when the wallet is declined", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      uploadEventFile.mockRejectedValue(new Error("User declined the signature"));
      await user.click(screen.getByRole("button", { name: /publish the details file/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/declined/i);
      expect(screen.queryByText("Published")).toBeNull();
    });

  });

  describe("positive", () => {
    it("creates the event with the document it verified", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/e.json");
      await user.click(screen.getByRole("button", { name: /check the published file/i }));
      await screen.findByText("Checked");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jakarta Sunrise 10K",
          uri: "https://example.test/e.json",
          metadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        expect.anything(),
      );
    });

    it("walks through to an open event", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(await screen.findByText(/write that number down/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /add this distance/i }));
      await screen.findByText("Added");

      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(screen.getByRole("button", { name: "Open for entries" }));

      expect(await screen.findByText(/the event is open/i)).toBeInTheDocument();
      expect(setEventStatus).toHaveBeenCalledWith(4, "Open", expect.anything());
    });

    it("passes the price through as stroops, not as a decimal", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user, { code: "FUN5K", price: "15.5" });
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      await user.click(screen.getByRole("button", { name: /add this distance/i }));

      await screen.findByText("Added");
      expect(addCategory).toHaveBeenCalledWith(
        expect.objectContaining({ priceStroops: 155_000_000n, distanceM: 10_000 }),
        expect.anything(),
      );
    });

    it("puts the earliest wave on chain as the event start", async () => {
      // The event has one timestamp and a race has several. The earliest is the
      // only one that is true of the whole event.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      await screen.findByText(/write that number down/i);
      // The race date from fillDetails, at the one distance's start time.
      const expected = BigInt(Math.floor(new Date("2026-09-28T06:00").getTime() / 1000));
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ startsAt: expected }),
        expect.anything(),
      );
    });
  });

  describe("edge", () => {
    it("asks for a wallet before showing the wizard at all", () => {
      useWallet.setState({ address: null, isRestoring: false });

      renderWizard();

      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/Event name/)).not.toBeInTheDocument();
    });

    it("says what is missing instead of disabling Continue", async () => {
      // A greyed out button with no reason is a dead end: you can see it, you
      // cannot tell what is wrong, and there is nothing to press to find out.
      const { user } = renderWizard();

      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
      expect(screen.queryByText(/give the race a name/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText(/give the race a name/i)).toBeInTheDocument();
      // Still on step one.
      expect(screen.getByLabelText(/Event name/)).toBeInTheDocument();
    });

    it("insists on a maps link with a pin, because that is what places the race", async () => {
      const { user } = renderWizard();
      await user.type(screen.getByLabelText(/Event name/), "A race");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText(/paste a google maps link/i)).toBeInTheDocument();
    });

    it("will not create an event with an unverified document", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      // The URL is typed but never checked. Continuing here would commit a hash
      // for bytes nobody has fetched, and the hash cannot be changed later.
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/e.json");

      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("un-verifies the document when a detail changes after checking it", async () => {
      // The bytes are different now, so the URL that was checked a moment ago
      // serves something else. This is the mistake that would otherwise ship a
      // permanently broken event.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/e.json");
      await user.click(screen.getByRole("button", { name: /check the published file/i }));
      await screen.findByText("Checked");

      // Back to the details, which now sit two steps away. Each step is waited
      // for: clicking twice in a row races the render and lands both clicks on
      // the same button.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await screen.findByRole("heading", { name: "Distance categories" });
      await user.click(screen.getByRole("button", { name: "Back" }));
      await screen.findByRole("heading", { name: "The race" });

      await user.type(screen.getByLabelText("Venue"), "Somewhere else");

      await user.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByRole("heading", { name: "Distance categories" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByRole("heading", { name: /publish the event details/i });

      expect(screen.queryByText("Checked")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create without a document/i }),
      ).toBeInTheDocument();
    });

    it("creates an event with no document when told to", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ uri: "", metadataHash: "0".repeat(64) }),
        expect.anything(),
      );
    });

    it("will not open an event whose distances are not all on chain yet", async () => {
      // The event exists and one signature is still outstanding. Opening now
      // would put a race in front of people with a distance they cannot enter.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
      expect(screen.getByText(/add them all before opening/i)).toBeInTheDocument();
    });

    it("refuses a distance code the contract would reject, without spending a signature", async () => {
      // Symbol accepts letters, digits and underscore. A revert would cost a
      // wallet prompt and a wait to learn what a regex answers instantly.
      const { user } = renderWizard();
      await fillDetails(user);

      await user.type(screen.getByLabelText(/^Code/), "10 K!");
      await user.type(screen.getByLabelText(/Distance in kilometres/), "10");
      await user.type(screen.getByLabelText(/Maximum entries/), "300");
      await user.type(screen.getByLabelText(/Start time/), "06:00");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /letters, digits and underscores/i,
      );
      expect(createEvent).not.toHaveBeenCalled();
    });
  });

  describe("negative", () => {
    it("keeps a distance that is already on chain when the next one fails", async () => {
      // Those transactions have landed and cannot be undone, so a screen that
      // reset on failure would be lying about what is on chain.
      const { user } = renderWizard();
      await fillDetails(user);
      await user.type(screen.getByLabelText(/^Code/), "10K");
      await user.type(screen.getByLabelText(/Distance in kilometres/), "10");
      await user.type(screen.getByLabelText(/Maximum entries/), "300");
      await user.type(screen.getByLabelText(/Start time/), "06:00");
      await user.click(screen.getByRole("button", { name: /add another distance/i }));

      const codes = screen.getAllByLabelText(/^Code/);
      await user.type(codes[1]!, "FUN5K");
      await user.type(screen.getAllByLabelText(/Distance in kilometres/)[1]!, "5");
      await user.type(screen.getAllByLabelText(/Maximum entries/)[1]!, "100");
      await user.type(screen.getAllByLabelText(/Start time/)[1]!, "07:00");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      await user.click(screen.getByRole("button", { name: /add this distance/i }));
      await screen.findByText("Added");

      addCategory.mockRejectedValueOnce(new Error("user declined"));
      await user.click(screen.getByRole("button", { name: /add this distance/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/not added/i);
      expect(screen.getByText("Added")).toBeInTheDocument();
    });
  });
});
