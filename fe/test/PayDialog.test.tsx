/**
 * The Sign and pay dialog, one test per state (mockup block 4 and the spec's
 * failure table). The attempt is a plain object here: `useEntryAttempt` is
 * tested on its own, and this file is about what each state says.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/entry/component/GetTestSusd", () => ({
  GetTestSusd: () => <button type="button">Get test sUSD</button>,
}));

import type { AttemptState } from "@/modules/entry/attempt";
import { PayDialog, type PayDialogProps } from "@/modules/entry/component/PayDialog";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const submitted = {
  participantId: "p",
  participantHash: "a".repeat(64),
  salt: "b".repeat(64),
  totpSecret: "c".repeat(64),
};

const RUNNING: AttemptState["phase"][] = ["confirming-identity", "paying", "checking"];

function renderDialog(state: AttemptState, overrides: Partial<PayDialogProps> = {}) {
  const props: PayDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    raceName: "Borobudur Marathon",
    eventId: 2,
    runner: RUNNER,
    total: 300_000_000n,
    attempt: {
      state,
      running: RUNNING.includes(state.phase),
      start: vi.fn(),
      checkAgain: vi.fn(),
    },
    onChangeDistance: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<PayDialog {...props} />);
  return props;
}

describe("while it runs", () => {
  it("names the race and says the wallet asks twice", () => {
    renderDialog({ phase: "confirming-identity" });
    expect(screen.getByRole("heading", { name: "Entering Borobudur Marathon" })).toBeInTheDocument();
    expect(screen.getByText("Your wallet will ask you twice.")).toBeInTheDocument();
  });

  it("asks for the first approval before the payment, and nothing after it", () => {
    renderDialog({ phase: "confirming-identity" });
    const steps = screen.getAllByRole("listitem");
    // The backend links the details from the chain (STE-59): no third step.
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent("Confirm it's you");
    expect(steps[0]).toHaveTextContent("Check your wallet.");
    expect(steps[1]).toHaveTextContent("Pay sUSD 30 and enter");
    expect(steps[1]).not.toHaveTextContent("Check your wallet.");
  });

  it("marks the first approval done while paying", () => {
    renderDialog({ phase: "paying", submitted });
    const steps = screen.getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent("Signed. Your details are saved securely.");
    expect(steps[1]).toHaveTextContent("Check your wallet.");
  });

  it("says Enter the race, not pay, for a free entry", () => {
    renderDialog({ phase: "paying", submitted }, { total: 0n });
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("Enter the race");
  });

  it("cannot be closed while it runs", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ phase: "paying", submitted });
    await user.keyboard("{Escape}");
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});

describe("no answer", () => {
  it("checks on its own and says how long", () => {
    renderDialog({ phase: "checking", submitted });
    expect(screen.getByRole("heading", { name: "Checking whether your entry went through" })).toBeInTheDocument();
    expect(screen.getByText("This can take up to half a minute. Please keep this page open.")).toBeInTheDocument();
  });

  it("says it did not go through and nothing was charged, with a retry", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ phase: "not-through", submitted });

    expect(screen.getByRole("heading", { name: "Your entry didn't go through" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was charged. Your details are still here, so you can try again.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.attempt.start).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers only Check again when the check itself failed", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ phase: "check-failed", submitted });

    expect(screen.getByRole("heading", { name: "We couldn't check your entry" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your internet connection dropped. Before paying again, reconnect and tap Check again, so you are not charged twice.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(props.attempt.checkAgain).toHaveBeenCalledTimes(1);
  });

  it("never says the entry may have gone through", () => {
    for (const phase of ["checking", "not-through", "check-failed"] as const) {
      const { unmount } = render(
        <PayDialog
          open
          onOpenChange={() => {}}
          raceName="Borobudur Marathon"
          eventId={2}
          runner={RUNNER}
          total={300_000_000n}
          attempt={{ state: { phase, submitted }, running: phase === "checking", start: () => {}, checkAgain: () => {} }}
          onChangeDistance={() => {}}
          onDone={() => {}}
        />,
      );
      expect(document.body).not.toHaveTextContent(/may have gone through|may already/i);
      unmount();
    }
  });
});

describe("a refusal", () => {
  it("repeats the declined step when tried again", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ phase: "failed", submitted, failure: { kind: "declined" } });
    expect(screen.getByRole("heading", { name: "You declined in your wallet" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was charged.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.attempt.start).toHaveBeenCalledTimes(1);
  });

  it("says how much more is needed and offers test sUSD", () => {
    renderDialog({ phase: "failed", submitted, failure: { kind: "short", needed: 50_000_000n } });
    expect(screen.getByRole("heading", { name: "You need 5 more sUSD to enter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get test sUSD" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("sends a sold-out distance back to step 1", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ phase: "failed", submitted, failure: { kind: "sold-out" } });
    expect(screen.getByRole("heading", { name: "This distance just sold out" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose another distance" }));
    expect(props.onChangeDistance).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("names the item that sold out and sends the runner back to change it", async () => {
    const user = userEvent.setup();
    const props = renderDialog({
      phase: "failed",
      submitted,
      failure: { kind: "add-on-sold-out", names: ["Event jersey"] },
    });
    expect(screen.getByRole("heading", { name: "Event jersey just sold out" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change your race pack" }));
    expect(props.onChangeDistance).toHaveBeenCalledTimes(1);
  });

  it("sends a closed race back to the race page", () => {
    renderDialog({ phase: "failed", submitted, failure: { kind: "closed" } });
    expect(screen.getByRole("heading", { name: "Entries for this race have closed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the race" })).toHaveAttribute("href", "/events/2");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: "other", message: "Something went wrong. Please try again." } as const],
    [{ kind: "submit-failed", message: "Check your date of birth." } as const],
  ])("shows the sentence for %o with a retry", (failure) => {
    renderDialog({ phase: "failed", submitted, failure });
    expect(screen.getByRole("heading", { name: "Your entry didn't go through" })).toBeInTheDocument();
    expect(screen.getByText(failure.message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("entered", () => {
  it("hands the token on", async () => {
    const props = renderDialog({ phase: "entered", tokenId: 7 });
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith(7));
  });
});
