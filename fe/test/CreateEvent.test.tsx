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
/*
 * Mocked rather than left to run. The real hook fetches the backend index, and
 * `NEXT_PUBLIC_API_URL` in vitest.config.ts is the live API: left alone, every
 * test in this file would put a request on the network, and typescript.yml is
 * built so that a testnet or a VPS being down cannot turn CI red.
 */
const existingNames = vi.hoisted(() => vi.fn(() => [] as string[]));
/* The organiser allowlist (STE-36). Allowed unless a test says otherwise. */
const isOrganiser = vi.hoisted(() => vi.fn(async () => true));
const uploadEventFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sterun", () => ({
  readClient: { createEvent, addCategory, setEventStatus, isOrganiser },
}));
vi.mock("@/hooks/useExistingEventNames", () => ({ useExistingEventNames: existingNames }));
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
 *
 * Raised again when the terms step landed: every walk through the wizard grew
 * another render and another click, which was enough to push the longest tests
 * past twenty seconds on a loaded machine.
 */
vi.setConfig({ testTimeout: 40_000 });

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
  // The allowlist is read before the form is drawn (STE-36), so the first
  // field is not there on the first tick any more.
  await user.type(await screen.findByLabelText(/Event name/), name);

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
  {
    code = "10K",
    price = "25",
    terms,
  }: { code?: string; price?: string; terms?: string } = {},
) {
  await user.type(screen.getByLabelText(/^Code/), code);
  await user.type(screen.getByLabelText(/Distance in kilometres/), "10");
  await user.type(screen.getByLabelText(/Maximum entries/), "300");
  if (price) await user.type(screen.getByLabelText(/Entry fee in sUSD/), price);
  await user.clear(screen.getByLabelText(/Start time/));
  await user.type(screen.getByLabelText(/Start time/), "06:00");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await passTerms(user, terms);
}

/**
 * Walk through the terms step, optionally leaving some behind.
 *
 * Its own helper rather than another click inside `fillDistances`, because
 * "the rules are optional and Continue never refuses" is a claim worth being
 * able to point at, and the tests that care about the terms need to type into
 * it rather than pass through.
 */
async function passTerms(user: ReturnType<typeof userEvent.setup>, terms?: string) {
  // By role, not by label: `Help` gives its button the field's own label as an
  // accessible name, so getByLabelText matches the textarea and the info
  // button both.
  if (terms) await user.type(screen.getByRole("textbox", { name: /rules of your race/i }), terms);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

/**
 * Render, and wait for the allowlist check to let the form through (STE-36).
 *
 * The tests that want to see the form all go through here. The ones that want
 * to see it withheld call `renderWizard` directly.
 */
async function renderForm() {
  const rendered = renderWizard();
  await screen.findByLabelText(/Event name/);
  return rendered;
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
  {
    name = "Event jersey",
    tick = "10K",
    kind = "included",
    price,
    stock = "200",
  }: {
    name?: string;
    tick?: string | null;
    kind?: "included" | "extra";
    price?: string;
    stock?: string;
  } = {},
) {
  // Two lists now, and which button is pressed decides which one this lands
  // in: what the entry fee covers, or what is sold on top of it.
  const add = kind === "included" ? /add something included/i : /add something to sell/i;
  await user.click(screen.getByRole("button", { name: add }));
  await user.click(screen.getByRole("combobox", { name: "Item" }));
  await user.type(screen.getByPlaceholderText(/search or type your own/i), name);
  await user.click(await screen.findByRole("option", { name: new RegExp(name, "i") }));
  if (tick) await user.click(screen.getByRole("checkbox", { name: tick }));

  if (kind === "extra") {
    // By role: `Help` names its button "About price in sUSD", which a loose
    // label regex matches just as happily as the field itself.
    await user.type(screen.getByRole("textbox", { name: /price in sUSD/i }), price ?? "30");
  }

  /*
    Stock is not optional any more: the contract refuses a quota of zero, so
    every row has to carry a number. A sized item carries one per size, because
    each size is its own add-on.
  */
  const sizeStocks = screen.queryAllByLabelText(/size \d+ stock/i);
  if (sizeStocks.length > 0) {
    for (const field of sizeStocks) await user.type(field, stock);
  } else {
    await user.type(screen.getByRole("textbox", { name: /how many exist/i }), stock);
  }
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
  isOrganiser.mockResolvedValue(true);
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

afterEach(() => vi.useRealTimers());

describe("CreateEvent", () => {
  describe("the run of signatures", () => {
    it("lists every signature before asking for the first one", async () => {
      // The number cannot be reduced, so the only thing that makes it bearable
      // is not being surprised by it. Three fixed steps plus one distance.
      const { user } = await renderForm();
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
      const { user } = await renderForm();
      await reachReview(user);

      await user.click(screen.getByRole("button", { name: "Create event" }));
      await user.click(await screen.findByRole("button", { name: /not yet/i }));

      expect(uploadEventFile).not.toHaveBeenCalled();
      expect(createEvent).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
    });

    it("walks the whole run from one press, and ends with an open event", async () => {
      const { user } = await renderForm();
      await reachReview(user);

      await startRun(user);

      expect(await screen.findByText(/your race is live/i)).toBeInTheDocument();
      expect(uploadEventFile).toHaveBeenCalledTimes(1);
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(addCategory).toHaveBeenCalledTimes(1);
      expect(setEventStatus).toHaveBeenCalledWith(4, "Open", expect.anything());
      // The id is no longer written out in a sentence, so this is where it has
      // to be right: the one link out of the wizard has to reach the event the
      // run just created, not some other one.
      expect(screen.getByRole("link", { name: /open the event page/i })).toHaveAttribute(
        "href",
        "/events/4",
      );

      // The receipts used to live only in the run dialog, which this step
      // replaces the moment the run finishes. Losing them there meant the
      // proof went off screen before anybody could read it.
      const receipts = screen.getAllByRole("link", { name: /receipt/i });
      expect(receipts).toHaveLength(3);
      expect(receipts[0]).toHaveAttribute("href", expect.stringContaining("tx1"));
      expect(receipts[2]).toHaveAttribute("href", expect.stringContaining("tx3"));
    });

    it("records the address the store put the details file at", async () => {
      // The point of the whole endpoint: the organiser hosts nothing, and the
      // uri that lands on chain is one the store guarantees keeps serving the
      // same bytes.
      const { user } = await renderForm();
      await reachReview(user);

      await startRun(user);
      await screen.findByText(/your race is live/i);

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: expect.stringContaining("https://api-sterun.jameshub.fun/files/"),
          metadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        expect.anything(),
      );
    });

    it("signs the upload as the connected organiser", async () => {
      const { user } = await renderForm();
      await reachReview(user);

      await startRun(user);
      await screen.findByText(/your race is live/i);

      expect(uploadEventFile).toHaveBeenCalledWith(
        expect.objectContaining({ address: ORGANISER, contentType: "application/json" }),
      );
    });

    it("proves the file is really being served before anything is recorded", async () => {
      // Stored is not served. A hash committed for bytes nobody fetched leaves
      // the event page saying the details were altered, for the rest of the
      // event's life, with nothing anybody can do about it.
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "unavailable", reason: "404" });

      await startRun(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read back/i);
      expect(createEvent).not.toHaveBeenCalled();
    });

    it("passes the price through as stroops, not as a decimal", async () => {
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user, { price: "25.5" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });

      await startRun(user);
      await screen.findByText(/your race is live/i);

      expect(addCategory).toHaveBeenCalledWith(
        expect.objectContaining({ priceStroops: 255_000_000n, distanceM: 10_000, quota: 300 }),
        expect.anything(),
      );
    });

    it("puts the earliest wave on chain as the event start", async () => {
      // The event has one timestamp and the race has several. 06:00 on race day
      // in the browser's zone, which the frozen clock makes deterministic.
      const { user } = await renderForm();
      await reachReview(user);

      await startRun(user);
      await screen.findByText(/your race is live/i);

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
      const { user } = await renderForm();
      await reachReview(user);
      setEventStatus.mockRejectedValueOnce(new Error("User declined the request"));

      await startRun(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/declined/i);
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(addCategory).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Carry on" }));

      expect(await screen.findByText(/your race is live/i)).toBeInTheDocument();
      // The event and the distance were not signed a second time.
      expect(createEvent).toHaveBeenCalledTimes(1);
      expect(addCategory).toHaveBeenCalledTimes(1);
      expect(setEventStatus).toHaveBeenCalledTimes(2);
    });

    it("says nothing was created when it stops on the very first step", async () => {
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user);
      await user.click(screen.getByRole("button", { name: "Continue" }));
      uploadEventFile.mockRejectedValueOnce(new Error("User declined the request"));

      await startRun(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(/nothing has been created yet/i);
    });

    it("offers the way out only once publishing has actually failed", async () => {
      // Hosting the file yourself is a real escape hatch, since our backend
      // being down should not stop anybody creating an event. It is not a
      // choice worth putting in front of somebody who has no problem.
      const { user } = await renderForm();
      await reachReview(user);

      expect(screen.queryByLabelText("Published URL")).not.toBeInTheDocument();

      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);

      expect(await screen.findByLabelText("Published URL")).toBeInTheDocument();
    });

    it("never offers to create an event with no details at all", async () => {
      // It used to, next to hosting the file yourself, as though they were the
      // same kind of thing. They are not: skipping produces a page with no
      // poster, no location and no schedule, for ever, offered at the moment
      // somebody is annoyed enough to press anything.
      const { user } = await renderForm();
      await reachReview(user);
      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);
      await screen.findByRole("alert");

      expect(screen.queryByText(/without any details/i)).not.toBeInTheDocument();
      expect(createEvent).not.toHaveBeenCalled();
    });

    it("takes a document the organiser hosted and checked themselves", async () => {
      const { user } = await renderForm();
      await reachReview(user);
      uploadEventFile.mockRejectedValueOnce(new Error("The store is unreachable"));
      await startRun(user);
      await screen.findByLabelText("Published URL");

      await user.type(screen.getByLabelText("Published URL"), "https://example.test/event.json");
      await user.click(screen.getByRole("button", { name: "Check the published file" }));

      // A checked url satisfies that step, so the way out folds away and the
      // list above shows the first line as done.
      await waitFor(() => expect(screen.queryByLabelText("Published URL")).not.toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: "Carry on" }));

      await screen.findByText(/your race is live/i);
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ uri: "https://example.test/event.json" }),
        expect.anything(),
      );
      // The upload was not attempted a second time: that step is satisfied.
      expect(uploadEventFile).toHaveBeenCalledTimes(1);
    });

    it("refuses a hosted url that is serving different bytes", async () => {
      const { user } = await renderForm();
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
      const { user } = await renderForm();
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
      const { user } = await renderForm();
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
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user, { name: "Meal ticket" });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });

      await user.click(screen.getByRole("button", { name: /show the file we will publish/i }));

      expect(await screen.findByText(/"name": "Meal ticket"/)).toBeInTheDocument();
    });

    it("leaves a tumbler without one", async () => {
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user, { name: "Tumbler" });

      expect(screen.getByRole("checkbox", { name: /runners pick a size/i })).not.toBeChecked();
      expect(screen.queryByText("Size chart")).not.toBeInTheDocument();
    });

    it("refuses an item nobody would ever receive", async () => {
      // An add-on ticked against no distance is invisible to every runner, and
      // the document is permanent, so it is caught before it is frozen.
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user, { tick: null });

      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/tick at least one distance/i);
    });

    it("unticks a distance that was renamed after it was chosen", async () => {
      // Otherwise the document would name a distance nobody can enter, and
      // there is no editing it once it is published.
      const { user } = await renderForm();
      await fillDetails(user);
      await fillDistances(user);
      await fillAddOn(user);

      // Twice: the terms sit between the add-ons and the distances now.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.clear(screen.getByLabelText(/^Code/));
      await user.type(screen.getByLabelText(/^Code/), "10KM");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await passTerms(user);

      expect(screen.getByRole("checkbox", { name: "10KM" })).not.toBeChecked();
    });

    it("puts the terms in the file whose fingerprint goes on chain", async () => {
      // The whole reason the rules live here rather than on a page the
      // organiser hosts: covered by metadata_hash, so they cannot change after
      // somebody has agreed to them.
      const { user } = await renderForm();
      // Set here rather than leaned on from reachReview: this test walks the
      // wizard itself so it can stop at the terms step, so it owns the mock.
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await fillDetails(user);
      await fillDistances(user, { terms: "One ticket admits one runner." });
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await startRun(user);
      await screen.findByText(/your race is live/i);

      const [[uploaded]] = uploadEventFile.mock.calls;
      const published = JSON.parse(new TextDecoder().decode(uploaded.bytes));
      expect(published.terms).toBe("One ticket admits one runner.");
    });

    it("leaves the terms out entirely when the organiser skipped them", async () => {
      const { user } = await renderForm();
      await reachReview(user);
      await startRun(user);
      await screen.findByText(/your race is live/i);

      const [[uploaded]] = uploadEventFile.mock.calls;
      expect(JSON.parse(new TextDecoder().decode(uploaded.bytes))).not.toHaveProperty("terms");
    });

    it("carries on with nothing in the race pack, because that is a real race", async () => {
      const { user } = await renderForm();
      await reachReview(user);

      expect(screen.queryByText("What runners get")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
    });
  });

  describe("the review itself", () => {
    it("shows the race in words rather than as a file", async () => {
      const { user } = await renderForm();
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
      const { user } = await renderForm();
      await reachReview(user);

      await user.click(screen.getByRole("button", { name: /show the file we will publish/i }));

      expect(await screen.findByText(/"schedule"/)).toBeInTheDocument();
      expect(screen.getByText(/^Fingerprint /)).toBeInTheDocument();
    });

    it("stops offering Back once something has been signed", async () => {
      // The form no longer describes what exists. Editing it would silently
      // change the document whose fingerprint is already on chain.
      const { user } = await renderForm();
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

    it("refuses a wallet that is not on the organiser allowlist, before the form", async () => {
      // The contract refuses too, but it refuses at the end of the run, and by
      // then the first step has already uploaded the details file. Six forms
      // and a stored document to be told no.
      isOrganiser.mockResolvedValue(false);

      renderWizard();

      expect(await screen.findByText(/cannot publish races yet/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Event name/)).not.toBeInTheDocument();
    });

    it("shows the whole address on that screen, because it has to be copied", async () => {
      isOrganiser.mockResolvedValue(false);

      renderWizard();

      expect(await screen.findByText(ORGANISER)).toBeInTheDocument();
    });

    it("lets a wallet through when the allowlist could not be read at all", async () => {
      // Not being able to ask is not a refusal. The contract still refuses on
      // its own, in simulation, before anything is signed or paid, so the cost
      // of being wrong here is a clear error later. The cost of the opposite
      // is locking out an organiser because a public node was down.
      isOrganiser.mockRejectedValue(new Error("rpc unreachable"));

      renderWizard();

      expect(await screen.findByLabelText(/Event name/)).toBeInTheDocument();
      expect(screen.queryByText(/cannot publish races yet/i)).not.toBeInTheDocument();
    });

    it("says what is missing instead of disabling Continue", async () => {
      // A greyed out button with no reason is a dead end: you can see it, you
      // cannot tell what is wrong, and there is nothing to press to find out.
      const { user } = await renderForm();
      await screen.findByLabelText(/Event name/);

      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
      expect(screen.queryByText(/give the race a name/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText(/give the race a name/i)).toBeInTheDocument();
      // Still on step one.
      expect(screen.getByLabelText(/Event name/)).toBeInTheDocument();
    });

    it("names the race it thinks this one clashes with, while the name is typed", async () => {
      existingNames.mockReturnValue(["Lari Jateng 2026"]);
      const { user } = await renderForm();

      await user.type(screen.getByLabelText(/Event name/), "lari jateng 2026");

      // The existing name is quoted back rather than described, because
      // "that name is taken" leaves an organiser hunting for which race.
      expect(await screen.findByText(/Lari Jateng 2026/)).toBeInTheDocument();
    });

    it("lets a clashing name through, because two races may share one honestly", async () => {
      // Annual editions repeat their name, and two cities can hold a race
      // called the same thing. Blocking would stop the organiser who is right
      // along with the one who is confused, and the contract does not care.
      existingNames.mockReturnValue(["Lari Jateng 2026"]);
      const { user } = await renderForm();

      await user.type(screen.getByLabelText(/Event name/), "Lari Jateng 2026");

      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
      expect(screen.queryByText(/give the race a name/i)).not.toBeInTheDocument();
    });

    it("says nothing when the index knows no race by that name", async () => {
      existingNames.mockReturnValue(["Borobudur Marathon 2026"]);
      const { user } = await renderForm();

      await user.type(screen.getByLabelText(/Event name/), "Lari Jateng 2026");

      expect(screen.queryByText(/already on the public list/i)).not.toBeInTheDocument();
    });

    it("marks a backwards registration window as soon as both dates exist", async () => {
      // Nobody has pressed Continue here. Two dates that cannot both be true
      // are wrong the moment the second one is picked, and the organiser is
      // looking at both fields right now — later is after they moved on.
      const { user } = await renderForm();

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
      const { user } = await renderForm();

      await user.click(screen.getByRole("button", { name: "Registration opens date" }));
      await user.click(screen.getByRole("button", { name: /September 27th, 2026/ }));
      await user.click(screen.getByRole("button", { name: "Registration closes date" }));
      await user.click(screen.getByRole("button", { name: /September 8th, 2026/ }));

      await screen.findByText(/cannot close before they open/i);
      expect(screen.queryByText(/give the race a name/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/paste a google maps link/i)).not.toBeInTheDocument();
    });

    it("clears the clash the moment the dates make sense again", async () => {
      const { user } = await renderForm();

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
      const { user } = await renderForm();
      await user.type(screen.getByLabelText(/Event name/), "A race");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText(/paste a google maps link/i)).toBeInTheDocument();
    });

    it("refuses a distance code the contract would reject, without spending a signature", async () => {
      const { user } = await renderForm();
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
