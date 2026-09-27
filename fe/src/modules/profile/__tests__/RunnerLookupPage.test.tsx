import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const wallet = vi.hoisted(() => ({ address: null as string | null }));
vi.mock("@/hooks/useWallet", () => ({
  useWallet: (select: (state: typeof wallet) => unknown) => select(wallet),
}));

import { RunnerLookupPage } from "@/modules/profile/RunnerLookupPage";

const VALID = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";

beforeEach(() => {
  push.mockReset();
  wallet.address = null;
});

describe("RunnerLookupPage", () => {
  it("opens the record of a pasted address, trimmed", async () => {
    render(<RunnerLookupPage />);

    await userEvent.click(screen.getByLabelText("Stellar address"));
    await userEvent.paste(`  ${VALID}\n`);
    await userEvent.click(screen.getByRole("button", { name: "Open race record" }));

    expect(push).toHaveBeenCalledWith(`/runner/${VALID}`);
  });

  it("answers a typo here, and goes nowhere", async () => {
    render(<RunnerLookupPage />);

    await userEvent.type(screen.getByLabelText("Stellar address"), "GABC");
    await userEvent.click(screen.getByRole("button", { name: "Open race record" }));

    expect(screen.getByRole("alert")).toHaveTextContent("That is not a Stellar address.");
    expect(push).not.toHaveBeenCalled();
  });

  it("offers a connected wallet its own record", async () => {
    wallet.address = VALID;
    render(<RunnerLookupPage />);

    await userEvent.click(screen.getByRole("button", { name: "Open my race record" }));
    expect(push).toHaveBeenCalledWith(`/runner/${VALID}`);
  });
});
