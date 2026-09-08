import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
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

/** Fill everything step one insists on, then move to the distances. */
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
  // Distinct days, because the form refuses a schedule that cannot happen:
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

/** Fill the one distance the wizard starts with, then move to the review. */
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

/**
 * Everything up to the review screen, with the file publishing cleanly.
 *
 * Add-ons are skipped by default: an empty race pack is a normal way to finish,
 * and the tests that care about add-ons fill them in themselves.
 */
async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await fillDetails(user);
  await fillDistances(user);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
}

/**
 * Add one item on the add-ons step. The name control is a combobox that also
 * accepts things it has never heard of, so both paths are exercised: a preset
 * is chosen from the list, anything else is added from the row at the bottom.
 */
async function fillAddOn(
  user: ReturnType<typeof userEvent.setup>,
  { name = "Event jersey", tick = "10K" }: { name?: string; tick?: string | null } = {},
) {
  await user.click(screen.getByRole("button", { name: /add an item/i }));
  await user.click(screen.getByRole("combobox", { name: "Item" }));
  await user.type(screen.getByPlaceholderText(/search or type your own/i), name);
  await user.click(await screen.findByRole("option", { name: new RegExp(name, "i") }));
  if (tick) await user.click(screen.getByRole("checkbox", { name: tick }));
}

/**
 * Press Create event and confirm in the dialog.
 *
 * The dialog is the whole point of the second press: it is where the number of
 * wallet prompts is stated, and a run this irreversible should not start on one
 * click at the bottom of a long page.
 */
async function startRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Create event" }));
  await user.click(await screen.findByRole("button", { name: /start signing/i }));
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
  describe("the run of signatures", () => {
    it("lists every signature before asking for the first one", async () => {
      // The number cannot be reduced, so the only thing that makes it bearable
      // is not being surprised by it. Three fixed steps plus one distance.
      const { user } = renderWizard();
      await reachReview(user);

      // Not on the page until it is asked for: it is the one thing here that
      // has to be read, and a block on a long page is read by nobody.
      expect(screen.queryByText(/takes 4 signatures/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(await screen.findByText(/takes 4 signatures/i)).toBeInTheDocument();
      expect(screen.getByText("Publish the event details")).toBeInTheDocument();
      expect(screen.getByText('Create "Jakarta Sunrise 10K"')).toBeInTheDocument();
      expect(screen.getByText("Add the 10K")).toBeInTheDocument();
      expect(screen.getByText("Open for entries")).toBeInTheDocument();
      // Opening it is not agreeing to it.
      expect(uploadEventFile).not.toHaveBeenCalled();
      expect(createEvent).not.toHaveBeenCalled();
    });

    it("signs nothing when the dialog is dismissed", async () => {
      // The second press is the consent. Backing out of it has to leave the
      // form exactly as it was.
      const { user } = renderWizard();
      await reachReview(user);

      await user.click(screen.getByRole("button", { name: "Create event" }));
      await user.click(await screen.findByRole("button", { name: /not yet/i }));

      expect(uploadEventFile).not.toHaveBeenCalled();
      expect(createEvent).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
    });

    it("walks the whole run from one press, and ends with an open event", async () => {
      const { user } = renderWizard();
      await reachReview(user);

      await startRun(user);

      expect(await screen.findByText(/the event is open/i)).toBeInTheDocument();
      expect(uploadEventFile).toHaveBeenCalledTimes(1);
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(addCategory).toHaveBeenCalledTimes(1);
      expect(setEventStatus).toHaveBeenCalledWith(4, "Open", expect.anything());
      expect(screen.getByText(/write down number/i)).toHaveTextContent("4");
    });

    it("records the address the store put the details file at", async () => {
      // The point of the whole endpoint: the organiser hosts nothing, and the
      // uri that lands on chain is one the store guarantees keeps serving the
      // same bytes.
      const { user } = renderWizard();
      await reachReview(user);

      await startRun(user);
      await screen.findByText(/the event is open/i);

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: expect.stringContaining("https://api-sterun.jameshub.fun/files/"),
          metadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        expect.anything(),
      );
    });

    it("signs the upload as the connected organiser", async () => {
      const { user } = renderWizard();
      await reachReview(user);

      await startRun(user);
      await screen.findByText(/the event is open/i);

      expect(uploadEventFile).toHaveBeenCalledWith(
        expect.objectContaining({ address: ORGANISER, contentType: "application/json" }),
      );
    });

    it("proves the file is really being served before anything is recorded", async () => {
      // Stored is not served. A hash committed for bytes nobody fetched leaves
      // the event page saying the details were altered, for the rest of the
      // event's life, with nothing anybody can do about it.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "unavailable", reason: "404" });

      await startRun(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read back/i);
      expect(createEvent).not.toHaveBeenCalled();
    });

    it("passes the price through as stroops, not as a decimal", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user, { price: "25.5" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });

      await startRun(user);
      await screen.findByText(/the event is open/i);

      expect(addCategory).toHaveBeenCalledWith(
        expect.objectContaining({ priceStroops: 255_000_000n, distanceM: 10_000, quota: 300 }),
        expect.anything(),
      );
    });

    it("puts the earliest wave on chain as the event start", async () => {
      // The event has one timestamp and the race has several. 06:00 on race day
      // in the browser's zone, which the frozen clock makes deterministic.
      const { user } = renderWizard();
      await reachReview(user);

      await startRun(user);
      await screen.findByText(/the event is open/i);

      const expected = BigInt(Math.floor(new Date("2026-09-28T06:00").getTime() / 1000));
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ startsAt: expected }),
        expect.anything(),
      );
    });
  });

  describe("when the run stops partway", () => {
    it("keeps what has landed and carries on from there", async () => {
      // Those transactions cannot be undone, so a screen that reset would be
      // lying about what exists. Carrying on must never repeat one.
      const { user } = renderWizard();
      await reachReview(user);
      setEventStatus.mockRejectedValueOnce(new Error("User declined the request"));

      await startRun(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/declined/i);
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(addCategory).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Carry on" }));

      expect(await screen.findByText(/the event is open/i)).toBeInTheDocument();
      // The event and the distance were not signed a second time.
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(addCategory).toHaveBeenCalledTimes(1);
      expect(setEventStatus).toHaveBeenCalledTimes(2);
    });

    it("says nothing was created when it stops on the very first step", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: "Continue" }));
      uploadEventFile.mockRejectedValueOnce(new Error("User declined the request"));

      await startRun(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/nothing has been created yet/i);
    });

    it("offers the ways out only once publishing has actually failed", async () => {
      // Hosting the file yourself is a real escape hatch, since our backend
      // being down should not stop anybody creating an event. It is not a
      // choice worth putting in front of somebody who has no problem.
      const { user } = renderWizard();
      await reachReview(user);

      expect(screen.queryByLabelText("Published URL")).not.toBeInTheDocument();

      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);

      expect(await screen.findByLabelText("Published URL")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create the event without any details/i }),
      ).toBeInTheDocument();
    });

    it("creates the event with no document when told to go on without one", async () => {
      const { user } = renderWizard();
      await reachReview(user);
      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: /create the event without any details/i }));
      await startRun(user);

      await screen.findByText(/the event is open/i);
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ uri: "", metadataHash: "0".repeat(64) }),
        expect.anything(),
      );
    });

    it("takes a document the organiser hosted and checked themselves", async () => {
      const { user } = renderWizard();
      await reachReview(user);
      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);
      await screen.findByLabelText("Published URL");

      await user.type(screen.getByLabelText("Published URL"), "https://example.test/event.json");
      await user.click(screen.getByRole("button", { name: "Check the published file" }));

      // A checked url satisfies that step, so the ways out fold away and the
      // list above shows the first line as done.
      await waitFor(() => expect(screen.queryByLabelText("Published URL")).not.toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: "Carry on" }));

      await screen.findByText(/the event is open/i);
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ uri: "https://example.test/event.json" }),
        expect.anything(),
      );
      // The upload was not attempted a second time: that step is satisfied.
      expect(uploadEventFile).toHaveBeenCalledTimes(1);
    });

    it("refuses a hosted url that is serving different bytes", async () => {
      const { user } = renderWizard();
      await reachReview(user);
      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);
      await screen.findByLabelText("Published URL");

      fetchEventMetadata.mockResolvedValue({ status: "modified", actualHash: "f".repeat(64) });
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/event.json");
      await user.click(screen.getByRole("button", { name: "Check the published file" }));

      expect(await screen.findByText(/showing a different file/i)).toBeInTheDocument();
      expect(screen.queryByText("Checked")).not.toBeInTheDocument();
    });
  });

  describe("what runners get", () => {
    it("writes an item into the document against the distances that include it", async () => {
      // The whole model in one assertion: an add-on is not a product with a
      // price, it is what a ticket already buys. `enter` moves one amount once,
      // so there is nowhere for a second charge to live.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user);
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });

      await user.click(screen.getByRole("button", { name: /show the file we will publish/i }));

      const file = await screen.findByText(/"add_ons"/);
      expect(file).toHaveTextContent(/"name": "Event jersey"/);
      expect(file).toHaveTextContent(/"included_in": \[\s*"10K"/);
    });

    it("seeds a size chart when the item is one people wear", async () => {
      // Picking a preset answers "does this have sizes" as well as naming it,
      // because the two are the same question and asking twice is friction.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user);

      expect(screen.getByRole("checkbox", { name: /runners pick a size/i })).toBeChecked();
      for (const label of ["S", "M", "L", "XL"]) {
        expect(screen.getByDisplayValue(label)).toBeInTheDocument();
      }
    });

    it("takes an item that is not on the list at all", async () => {
      // Races hand out things nobody could enumerate in advance. The control
      // offers suggestions; it never limits the answer.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user, { name: "Meal ticket" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });

      await user.click(screen.getByRole("button", { name: /show the file we will publish/i }));

      expect(await screen.findByText(/"name": "Meal ticket"/)).toBeInTheDocument();
    });

    it("leaves a tumbler without one", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user, { name: "Tumbler" });

      expect(screen.getByRole("checkbox", { name: /runners pick a size/i })).not.toBeChecked();
      expect(screen.queryByText("Size chart")).not.toBeInTheDocument();
    });

    it("refuses an item nobody would ever receive", async () => {
      // An add-on ticked against no distance is invisible to every runner, and
      // the document is permanent, so it is caught before it is frozen.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user, { tick: null });

      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/tick at least one distance/i);
    });

    it("unticks a distance that was renamed after it was chosen", async () => {
      // Otherwise the document would name a distance nobody can enter, and
      // there is no editing it once it is published.
      const { user } = renderWizard();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user);

      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.clear(screen.getByLabelText(/^Code/));
      await user.type(screen.getByLabelText(/^Code/), "10KM");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(screen.getByRole("checkbox", { name: "10KM" })).not.toBeChecked();
    });

    it("carries on with nothing in the race pack, because that is a real race", async () => {
      const { user } = renderWizard();
      await reachReview(user);

      expect(screen.queryByText("What runners get")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
    });
  });

  describe("the review itself", () => {
    it("shows the race in words rather than as a file", async () => {
      const { user } = renderWizard();
      await reachReview(user);

      expect(screen.getByText("Jakarta Sunrise 10K")).toBeInTheDocument();
      expect(screen.getByText("Two laps of the park.")).toBeInTheDocument();
      // The asset name comes from `formatPrice` and must not be added twice.
      expect(screen.getByRole("row", { name: /10K/ })).toHaveTextContent("sUSD 25");
      expect(screen.getByRole("row", { name: /10K/ })).not.toHaveTextContent("sUSD 25 sUSD");
      // The document is not on screen until it is asked for.
      expect(screen.queryByText(/"schedule"/)).not.toBeInTheDocument();
    });

    it("still hands over the exact bytes, for anybody who wants to check them", async () => {
      // The fingerprint of these bytes is what goes on chain, so somebody
      // checking our claim has to be able to see them.
      const { user } = renderWizard();
      await reachReview(user);

      await user.click(screen.getByRole("button", { name: /show the file we will publish/i }));

      expect(await screen.findByText(/"schedule"/)).toBeInTheDocument();
      expect(screen.getByText(/^Fingerprint /)).toBeInTheDocument();
    });

    it("stops offering Back once something has been signed", async () => {
      // The form no longer describes what exists. Editing it would silently
      // change the document whose fingerprint is already on chain.
      const { user } = renderWizard();
      await reachReview(user);
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

      setEventStatus.mockRejectedValueOnce(new Error("User declined the request"));
      await startRun(user);
      await screen.findByRole("alert");

      expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    });
  });

  describe("before any of that", () => {
    it("asks for a wallet before showing the form at all", async () => {
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

    it("marks a backwards registration window as soon as both dates exist", async () => {
      // Nobody has pressed Continue here. Two dates that cannot both be true
      // are wrong the moment the second one is picked, and the organiser is
      // looking at both fields right now — later is after they moved on.
      const { user } = renderWizard();

      await user.click(screen.getByRole("button", { name: "Registration opens date" }));
      await user.click(screen.getByRole("button", { name: /September 27th, 2026/ }));
      await user.click(screen.getByRole("button", { name: "Registration closes date" }));
      await user.click(screen.getByRole("button", { name: /September 8th, 2026/ }));

      expect(await screen.findByText(/cannot close before they open/i)).toBeInTheDocument();
    });

    it("leaves the fields that are merely empty alone until Continue", async () => {
      // The other half of the same decision. A form being filled in is not a
      // form being got wrong, and one that goes red under the cursor is one
      // people learn to read past.
      const { user } = renderWizard();

      await user.click(screen.getByRole("button", { name: "Registration opens date" }));
      await user.click(screen.getByRole("button", { name: /September 27th, 2026/ }));
      await user.click(screen.getByRole("button", { name: "Registration closes date" }));
      await user.click(screen.getByRole("button", { name: /September 8th, 2026/ }));

      await screen.findByText(/cannot close before they open/i);
      expect(screen.queryByText(/give the race a name/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/paste a google maps link/i)).not.toBeInTheDocument();
    });

    it("clears the clash the moment the dates make sense again", async () => {
      const { user } = renderWizard();

      await user.click(screen.getByRole("button", { name: "Registration opens date" }));
      await user.click(screen.getByRole("button", { name: /September 27th, 2026/ }));
      await user.click(screen.getByRole("button", { name: "Registration closes date" }));
      await user.click(screen.getByRole("button", { name: /September 8th, 2026/ }));
      await screen.findByText(/cannot close before they open/i);

      await user.click(screen.getByRole("button", { name: "Registration opens date" }));
      await user.click(screen.getByRole("button", { name: /September 7th, 2026/ }));

      expect(screen.queryByText(/cannot close before they open/i)).not.toBeInTheDocument();
    });

    it("insists on a maps link with a pin, because that is what places the race", async () => {
      const { user } = renderWizard();
      await user.type(screen.getByLabelText(/Event name/), "A race");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText(/paste a google maps link/i)).toBeInTheDocument();
    });

    it("refuses a distance code the contract would reject, without spending a signature", async () => {
      const { user } = renderWizard();
      await fillDetails(user);

      await user.type(screen.getByLabelText(/^Code/), "10 K");
      await user.type(screen.getByLabelText(/Distance in kilometres/), "10");
      await user.type(screen.getByLabelText(/Maximum entries/), "300");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      // The same words are in the field's hint, so the assertion is on the
      // one that is announced as a problem rather than on the text.
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /letters, digits and underscores/i,
      );
      await waitFor(() => expect(createEvent).not.toHaveBeenCalled());
    });
  });
});
