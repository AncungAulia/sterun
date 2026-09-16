/**
 * A phone number that always leaves the field in E.164.
 *
 * Not cosmetic: the emergency phone is hashed, and norm_contact strips spaces
 * and punctuation but never adds a country code, so `0812 3456 7890` and
 * `+62 812 3456 7890` would be one phone and two hashes (be/CLAUDE.md, STE-47).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PhoneField } from "@/modules/entry/components/PhoneField";

/** Holds the value the way the form does, and reports every change. */
function Harness({ onValue, defaultCountry = "ID" }: { onValue: (value: string) => void; defaultCountry?: "ID" | "SG" }) {
  const [value, setValue] = useState("");
  return (
    <PhoneField
      id="runner-phone"
      label="Phone"
      value={value}
      defaultCountry={defaultCountry}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

describe("PhoneField", () => {
  it("emits E.164 as a national number is typed", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.type(screen.getByLabelText("Phone"), "81234567890");

    expect(onValue).toHaveBeenLastCalledWith("+6281234567890");
  });

  it("drops the local leading zero rather than keeping it in the number", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.type(screen.getByLabelText("Phone"), "081234567890");

    expect(onValue).toHaveBeenLastCalledWith("+6281234567890");
  });

  it("starts on the country it is given", () => {
    render(<Harness onValue={vi.fn()} defaultCountry="SG" />);
    expect(screen.getByRole("combobox", { name: /country/i })).toHaveTextContent("+65");
  });

  it("changes the calling code through the country picker", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.click(screen.getByRole("combobox", { name: /country/i }));
    await user.type(screen.getByPlaceholderText("Search country"), "Singapore");
    await user.click(screen.getByRole("option", { name: /Singapore/ }));
    await user.type(screen.getByLabelText("Phone"), "81234567");

    expect(onValue).toHaveBeenLastCalledWith("+6581234567");
  });

  it("reports an emptied field as an empty string, not undefined", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    const input = screen.getByLabelText("Phone");
    await user.type(input, "81234567890");
    await user.clear(input);

    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("shows its error in place of the hint", () => {
    render(
      <PhoneField
        id="runner-phone"
        label="Phone"
        value=""
        defaultCountry="ID"
        onChange={() => {}}
        error="This phone number looks incomplete."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("This phone number looks incomplete.");
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true");
  });
});
