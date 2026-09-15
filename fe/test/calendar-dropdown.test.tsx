/**
 * The calendar's month and year dropdowns, inside the date popover.
 *
 * Found in the browser (Ancung, 2026-09-15): the dropdowns could not be
 * pressed. They could, but opening one moved focus into a list portalled
 * outside the popover, the popover closed, and the list went with it.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DateTimeField } from "@/components/elements/DateTimeField";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <DateTimeField
      id="dob"
      label="Date of birth"
      dateOnly
      value={value}
      onChange={setValue}
      startMonth={new Date(1900, 0, 1)}
      endMonth={new Date(2026, 8, 15)}
    />
  );
}

describe("the calendar's month and year dropdowns", () => {
  it("are shadcn selects, not the browser's own list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /date of birth/i }));

    expect(screen.getByRole("combobox", { name: "Choose the Month" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose the Year" })).toBeInTheDocument();
    expect(document.querySelector("select")).toBeNull();
  });

  it("keep the calendar open while a list is open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /date of birth/i }));

    await user.click(screen.getByRole("combobox", { name: "Choose the Month" }));

    expect(screen.getAllByRole("option")).toHaveLength(12);
    // `hidden`: an open Select marks everything outside its list aria-hidden,
    // so the calendar is still there, only out of the accessibility tree.
    expect(screen.getByRole("grid", { hidden: true })).toBeInTheDocument();
  });

  it("move the calendar to the chosen month and year", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /date of birth/i }));

    await user.click(screen.getByRole("combobox", { name: "Choose the Year" }));
    await user.click(screen.getByRole("option", { name: "1990" }));
    await user.click(screen.getByRole("combobox", { name: "Choose the Month" }));
    await user.click(screen.getByRole("option", { name: "Jan" }));

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose the Month" })).toHaveTextContent("Jan");
    expect(screen.getByRole("combobox", { name: "Choose the Year" })).toHaveTextContent("1990");
  });
});
