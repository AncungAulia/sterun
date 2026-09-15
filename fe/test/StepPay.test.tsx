/**
 * Step 3: the review, and the panel that takes money (mockup block 3).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useSusdBalance", () => ({
  useSusdBalance: vi.fn(),
  susdKey: (address: string | null) => ["susd-balance", address],
}));
vi.mock("@/modules/entry/component/GetTestSusd", () => ({
  GetTestSusd: () => <button type="button">Get test sUSD</button>,
}));

import { useSusdBalance } from "@/hooks/useSusdBalance";
import type { SusdBalance } from "@/lib/susd";
import type { JoinedAddOn } from "@/modules/event-detail/component/TabAddOns";
import { buildBasket } from "@/modules/entry/basket";
import { PayPanel, StepPay } from "@/modules/entry/component/StepPay";
import type { RunnerDetails } from "@/modules/entry/details";
import type { SterunAddOn, SterunCategory } from "@sterunxyz/sdk";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";

const row = (addonId: number, code: string, priceStroops: bigint): SterunAddOn => ({
  eventId: 2,
  addonId,
  code,
  priceStroops,
  quota: 10,
  reservedCount: 0,
  unitsLeft: 10,
});

const joined: JoinedAddOn[] = [
  {
    item: {
      name: "Event jersey",
      includedIn: ["10K"],
      sizes: [
        { label: "M", code: "EVENT_JERSEY_M" },
        { label: "L", code: "EVENT_JERSEY_L" },
      ],
    },
    rows: [row(0, "EVENT_JERSEY_M", 0n), row(1, "EVENT_JERSEY_L", 0n)],
  },
  { item: { name: "Finisher medal", includedIn: ["10K"], code: "MEDAL" }, rows: [row(2, "MEDAL", 0n)] },
  { item: { name: "Towel", includedIn: ["10K"], code: "TOWEL" }, rows: [row(3, "TOWEL", 50_000_000n)] },
  { item: { name: "Cap", includedIn: ["10K"], code: "CAP" }, rows: [row(4, "CAP", 30_000_000n)] },
];

const tenK: SterunCategory = {
  eventId: 2,
  categoryId: 0,
  code: "10K",
  distanceM: 10_000,
  quota: 300,
  enteredCount: 10,
  priceStroops: 250_000_000n,
  slotsLeft: 290,
};

const basket = buildBasket(joined, "10K");
const selection = { sizes: { "Event jersey": 1 }, extras: [3] };

const details: RunnerDetails = {
  name: "Sari Wulandari",
  idType: "national_id_card",
  idNumber: "3471014501900001",
  bibName: "SARI",
  email: "sari@example.com",
  phone: "+6281234567890",
  gender: "female",
  dateOfBirth: "1990-01-05",
  emergencyName: "Budi",
  emergencyPhone: "+6281298765432",
};

/** The value beside a label in a review list. */
function valueOf(region: HTMLElement, label: string): string {
  return within(region).getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? "";
}

function balance(data: SusdBalance | undefined, isPending = false) {
  vi.mocked(useSusdBalance).mockReturnValue({ data, isPending } as never);
}

beforeEach(() => {
  vi.mocked(useSusdBalance).mockReset();
  balance({ kind: "balance", stroops: 1_000_000_000n });
});

describe("StepPay", () => {
  it("reviews the distance, the race pack and the add-ons", () => {
    render(<StepPay category={tenK} basket={basket} selection={selection} details={details} onEdit={vi.fn()} />);
    const pack = screen.getByRole("region", { name: "Distance & race pack" });

    expect(valueOf(pack, "Distance")).toBe("10K");
    expect(valueOf(pack, "Event jersey")).toBe("L");
    expect(valueOf(pack, "Finisher medal")).toBe("Included");
    expect(valueOf(pack, "Towel")).toBe("Added");
    expect(within(pack).queryByText("Cap")).not.toBeInTheDocument();
  });

  it("reviews the details, with the identity number partly hidden", () => {
    render(<StepPay category={tenK} basket={basket} selection={selection} details={details} onEdit={vi.fn()} />);
    const you = screen.getByRole("region", { name: "Your details" });

    expect(valueOf(you, "Full name")).toBe("Sari Wulandari");
    expect(valueOf(you, "National ID card")).toBe("•••• •••• •••• 0001");
    expect(valueOf(you, "Gender, date of birth")).toBe("Female, Jan 5, 1990");
    expect(valueOf(you, "Name on bib")).toBe("SARI");
    expect(valueOf(you, "Email")).toBe("sari@example.com");
    expect(valueOf(you, "Phone")).toMatch(/^\+62 812/);
    expect(valueOf(you, "Emergency contact")).toMatch(/^Budi, \+62 812/);

    expect(screen.queryByText(/3471014501900001/)).not.toBeInTheDocument();
  });

  it("sends each Edit back to its step", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<StepPay category={tenK} basket={basket} selection={selection} details={details} onEdit={onEdit} />);

    await user.click(screen.getByRole("button", { name: "Edit distance and race pack" }));
    expect(onEdit).toHaveBeenLastCalledWith("distance");

    await user.click(screen.getByRole("button", { name: "Edit your details" }));
    expect(onEdit).toHaveBeenLastCalledWith("details");
  });
});

describe("PayPanel", () => {
  it("puts the non-refundable notice directly above the button that takes money", () => {
    render(<PayPanel runner={RUNNER} total={300_000_000n} busy={false} onPay={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Sign and pay sUSD 30" });
    expect(button).toBeEnabled();
    expect(button.previousElementSibling).toHaveAttribute("role", "note");
    expect(button.nextElementSibling).toHaveTextContent("Your wallet will ask you three times.");
  });

  it("pays when pressed", async () => {
    const user = userEvent.setup();
    const onPay = vi.fn();
    render(<PayPanel runner={RUNNER} total={300_000_000n} busy={false} onPay={onPay} />);
    await user.click(screen.getByRole("button", { name: "Sign and pay sUSD 30" }));
    expect(onPay).toHaveBeenCalledTimes(1);
  });

  it("says what is needed, offers test sUSD, and keeps paying shut when short", () => {
    balance({ kind: "balance", stroops: 20_000_000n });
    render(<PayPanel runner={RUNNER} total={300_000_000n} busy={false} onPay={vi.fn()} />);

    expect(screen.getByText("You need 30 sUSD to enter")).toBeInTheDocument();
    expect(screen.getByText("This wallet has 2 sUSD.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get test sUSD" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign and pay sUSD 30" })).toBeDisabled();
  });

  it("says the wallet holds no sUSD yet when it cannot hold any", () => {
    balance({ kind: "no-trustline" });
    render(<PayPanel runner={RUNNER} total={300_000_000n} busy={false} onPay={vi.fn()} />);
    expect(screen.getByText("This wallet has no sUSD yet.")).toBeInTheDocument();
  });

  it("waits for the balance before allowing payment", () => {
    balance(undefined, true);
    render(<PayPanel runner={RUNNER} total={300_000_000n} busy={false} onPay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sign and pay sUSD 30" })).toBeDisabled();
  });

  it("asks nothing about money for a free entry", () => {
    balance(undefined, true);
    render(<PayPanel runner={RUNNER} total={0n} busy={false} onPay={vi.fn()} />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign and enter" })).toBeEnabled();
    expect(vi.mocked(useSusdBalance)).toHaveBeenCalledWith(null);
  });

  it("cannot be pressed again while an attempt runs", () => {
    render(<PayPanel runner={RUNNER} total={300_000_000n} busy onPay={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sign and pay sUSD 30" })).toBeDisabled();
  });
});
