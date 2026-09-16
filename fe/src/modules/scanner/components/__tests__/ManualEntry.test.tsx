import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ManualEntry } from "@/modules/scanner/components/ManualEntry";

describe("ManualEntry", () => {
  it("checks six characters and a bib, keeping the leading zero as text", async () => {
    const onCheck = vi.fn();
    render(<ManualEntry onCheck={onCheck} onBack={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Six-digit code"), "079663");
    await userEvent.type(screen.getByLabelText("Bib number"), "128");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(onCheck).toHaveBeenCalledWith({ code: "079663", bibNo: 128 });
  });

  it("will not check five characters", async () => {
    const onCheck = vi.fn();
    render(<ManualEntry onCheck={onCheck} />);

    await userEvent.type(screen.getByLabelText("Six-digit code"), "79663");
    await userEvent.type(screen.getByLabelText("Bib number"), "128");

    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("will not check without a bib", async () => {
    render(<ManualEntry onCheck={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Six-digit code"), "079663");
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
  });

  it("keeps every digit of a code pasted with a space in it, and nothing else", async () => {
    render(<ManualEntry onCheck={vi.fn()} />);
    const code = screen.getByLabelText("Six-digit code");

    await userEvent.click(code);
    await userEvent.paste("079 663");
    expect(code).toHaveValue("079663");

    await userEvent.type(code, "9");
    expect(code).toHaveValue("079663");
  });

  it("says why the camera is not an option, and offers no way back to it", () => {
    render(<ManualEntry onCheck={vi.fn()} reason="This phone has no camera this page can use." />);

    expect(screen.getByText("This phone has no camera this page can use.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to camera" })).not.toBeInTheDocument();
  });

  it("goes back to the camera when there is one", async () => {
    const onBack = vi.fn();
    render(<ManualEntry onCheck={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "Back to camera" }));
    expect(onBack).toHaveBeenCalled();
  });
});
