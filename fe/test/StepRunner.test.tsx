/**
 * Step 2: the runner's details. Errors follow the wizard's split: empty
 * fields wait for Continue, impossible values show as soon as they exist.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { StepRunner } from "@/modules/entry/component/StepRunner";
import { EMPTY_DETAILS, type RunnerDetails } from "@/modules/entry/details";

const TODAY = "2026-09-15";

/**
 * A required field's label reads "Full name*required": the red star, then the
 * word a screen reader says instead of "asterisk" (elements/Field.tsx).
 */
const required = (label: string) => new RegExp(`^${label}\\*required$`);

function Harness({
  initial = EMPTY_DETAILS,
  showMissing = false,
  onDetails = () => {},
}: {
  initial?: RunnerDetails;
  showMissing?: boolean;
  onDetails?: (details: RunnerDetails) => void;
}) {
  const [details, setDetails] = useState(initial);
  return (
    <StepRunner
      details={details}
      today={TODAY}
      showMissing={showMissing}
      defaultCountry="ID"
      onChange={(next) => {
        setDetails(next);
        onDetails(next);
      }}
    />
  );
}

describe("StepRunner", () => {
  it("asks for every field the vault needs", () => {
    render(<Harness />);
    for (const label of ["Full name", "Document number", "Name on your bib", "Email", "Phone"]) {
      expect(screen.getByLabelText(required(label))).toBeInTheDocument();
    }
    expect(screen.getByRole("combobox", { name: /^Identity document/ })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Gender" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /date of birth/i })).toBeInTheDocument();

    const emergency = screen.getByRole("region", { name: "Emergency contact" });
    expect(within(emergency).getByLabelText(required("Their name"))).toBeInTheDocument();
    expect(within(emergency).getByLabelText(required("Their phone"))).toBeInTheDocument();

    // The mockup's three cards (block 2).
    expect(within(screen.getByRole("region", { name: "About you" })).getByLabelText(required("Full name"))).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Contact" })).getByLabelText(required("Email"))).toBeInTheDocument();
  });

  it("stars every field, since every one is required", () => {
    render(<Harness />);
    // Ten fields: name, document type, number, gender, date of birth, bib name,
    // email, phone, and the emergency contact's name and phone.
    expect(screen.getAllByText("*")).toHaveLength(10);
  });

  it("shows no error on an untouched form", () => {
    render(<Harness />);
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("lists what is missing once Continue has been pressed", () => {
    render(<Harness showMissing />);
    expect(screen.getByText("Enter your full name.")).toBeInTheDocument();
    expect(screen.getByText("Pick the type of ID you will bring.")).toBeInTheDocument();
    expect(screen.getByText("Add a phone number.")).toBeInTheDocument();
  });

  it("says a bib name is too long as soon as it is", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText(required("Name on your bib")), "ABCDEFGHIJKLMNOPQ");
    expect(screen.getByText("A bib fits 16 characters at most.")).toBeInTheDocument();
  });

  it("counts the characters on the bib", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText(required("Name on your bib")), "SARI");
    expect(screen.getByText("4/16")).toBeInTheDocument();
  });

  it("refuses a date of birth in the future without waiting for Continue", () => {
    render(<Harness initial={{ ...EMPTY_DETAILS, dateOfBirth: "2030-01-01" }} />);
    expect(screen.getByText("Check your date of birth.")).toBeInTheDocument();
  });

  it("refuses the runner's own phone as the emergency contact", () => {
    render(
      <Harness
        initial={{ ...EMPTY_DETAILS, phone: "+6281234567890", emergencyPhone: "+6281234567890" }}
      />,
    );
    expect(
      screen.getByText("Use someone else's number, so we can reach them if something happens to you."),
    ).toBeInTheDocument();
  });

  it("reports each field through onChange", async () => {
    const user = userEvent.setup();
    const onDetails = vi.fn();
    render(<Harness onDetails={onDetails} />);

    await user.type(screen.getByLabelText(required("Full name")), "S");
    expect(onDetails).toHaveBeenLastCalledWith(expect.objectContaining({ name: "S" }));

    await user.click(screen.getByRole("radio", { name: "Female" }));
    expect(onDetails).toHaveBeenLastCalledWith(expect.objectContaining({ gender: "female" }));

    await user.click(screen.getByRole("combobox", { name: /^Identity document/ }));
    await user.click(await screen.findByRole("option", { name: "Passport" }));
    expect(onDetails).toHaveBeenLastCalledWith(expect.objectContaining({ idType: "passport" }));
  });
});
