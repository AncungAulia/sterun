/**
 * The proof block, with `verify` and this device's stored entry mocked. The
 * details typed are vector ph-01's, so the fingerprint sent to `verify` is
 * asserted against the frozen expected hash rather than against this code.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chain/sterun", () => ({ readClient: { verify } }));

const readEntry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entry-store", () => ({ readEntry }));

import { ProveRecord } from "@/modules/profile/components/ProveRecord";

// docs/specs/vectors/participant_hash.json, ph-01-ascii-plain.
const PH01 = {
  name: "Budi Santoso",
  nationalId: "3174012509900001",
  contact: "+6281234567890",
  code: "a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e",
  hash: "11b4bbdb068b470aa79124846c6684b70ad0e5d7b5f7d74fe88cdc9fafdec8fe",
};

async function open() {
  render(<ProveRecord tokenId={7} />);
  await userEvent.click(screen.getByRole("button", { name: "Prove this record is yours" }));
}

async function fill({ name = PH01.name, id = PH01.nationalId, contact = PH01.contact, code = PH01.code } = {}) {
  await userEvent.type(screen.getByLabelText("Full name"), name);
  await userEvent.type(screen.getByLabelText("National ID number"), id);
  await userEvent.type(screen.getByLabelText("Emergency contact number"), contact);
  await userEvent.click(screen.getByLabelText("Receipt code"));
  await userEvent.paste(code);
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  verify.mockReset();
  readEntry.mockReset();
  readEntry.mockResolvedValue(undefined);
});

describe("closed", () => {
  it("is one link on the card until asked", () => {
    render(<ProveRecord tokenId={7} />);
    expect(screen.getByRole("button", { name: "Prove this record is yours" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(readEntry).not.toHaveBeenCalled();
  });
});

describe("filling it in", () => {
  it("says what stays on the device before the first field", async () => {
    await open();
    const promise = screen.getByText(/What you type stays on this device/);
    const firstField = screen.getByLabelText("Full name");
    expect(promise.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("will not check until all four are filled in", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Check this record" })).toBeDisabled();
    await fill({ code: "" });
    expect(screen.getByRole("button", { name: "Check this record" })).toBeDisabled();
  });

  it("shows the fingerprint that will be checked, once everything is filled in", async () => {
    await open();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "See what is checked" }));
    await waitFor(() => expect(screen.getByLabelText("Fingerprint")).toHaveTextContent(PH01.hash));
  });

  it("offers the receipt code this device saved when the entry was made here", async () => {
    readEntry.mockResolvedValue({ salt: PH01.code });
    await open();

    await userEvent.click(await screen.findByRole("button", { name: "Use the receipt code saved on this device" }));
    expect(field("Receipt code").value).toBe(PH01.code);
    expect(readEntry).toHaveBeenCalledWith(7);
  });

  it("does not offer one on a device that did not enter", async () => {
    await open();
    await waitFor(() => expect(readEntry).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /saved on this device/ })).not.toBeInTheDocument();
  });

  it("names a receipt code that is not whole, and checks nothing", async () => {
    await open();
    await fill({ code: PH01.code.slice(0, 40) });
    await userEvent.click(screen.getByRole("button", { name: "Check this record" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The receipt code is 64 characters.");
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("checking", () => {
  it("sends only the fingerprint, says it matches, and clears what was typed", async () => {
    verify.mockResolvedValue(true);
    await open();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Check this record" }));

    expect(await screen.findByText("This record belongs to that person")).toBeInTheDocument();
    expect(verify).toHaveBeenCalledWith(7, PH01.hash);
    expect(verify.mock.calls[0]!.join(" ")).not.toContain(PH01.name);
    expect(screen.getByText("What was typed has been cleared.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Check another" }));
    expect(field("Full name").value).toBe("");
    expect(field("Receipt code").value).toBe("");
  });

  it("names the two likely causes of no match, capitals first, and accuses nobody", async () => {
    verify.mockResolvedValue(false);
    await open();
    await fill({ name: "budi santoso" });
    await userEvent.click(screen.getByRole("button", { name: "Check this record" }));

    expect(await screen.findByText("No match")).toBeInTheDocument();
    // The bold lead is a span inside its paragraph; the three paragraphs share a box.
    const causes = screen.getByText(/Most likely the name/).closest("p")!.parentElement!;
    expect(causes).toHaveTextContent("Capitals count");
    expect(causes).toHaveTextContent("It does not say the record is fake.");
    expect(causes.textContent!.indexOf("name")).toBeLessThan(causes.textContent!.indexOf("receipt code"));

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(field("Full name").value).toBe("");
  });

  it("keeps what was typed when it could not ask, so trying again needs no retyping", async () => {
    verify.mockRejectedValue(new Error("rpc down"));
    await open();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Check this record" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not check just now.");
    expect(field("Full name").value).toBe(PH01.name);

    verify.mockResolvedValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Check this record" }));
    expect(await screen.findByText("This record belongs to that person")).toBeInTheDocument();
  });

  it("forgets everything when closed", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Full name"), PH01.name);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Prove this record is yours" }));

    expect(field("Full name").value).toBe("");
  });

  it("never writes what was typed into the address bar", async () => {
    verify.mockResolvedValue(true);
    const before = window.location.href;
    await open();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Check this record" }));
    await screen.findByText("This record belongs to that person");

    expect(window.location.href).toBe(before);
    expect(window.location.href).not.toContain(PH01.code);
  });
});
