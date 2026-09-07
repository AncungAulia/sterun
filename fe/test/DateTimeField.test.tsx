import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateTimeField } from "@/components/elements/DateTimeField";

/** Rendered with real state, because half of what matters here is round trips. */
function Harness({ initial = "", warnIfPast = false }: { initial?: string; warnIfPast?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimeField
        id="starts-at"
        label="Gun start"
        value={value}
        onChange={setValue}
        warnIfPast={warnIfPast}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("DateTimeField", () => {
  describe("positive", () => {
    it("can still be typed into, calendar or not", async () => {
      // The calendar is an assist. A date field that can only be clicked is a
      // date field somebody on a keyboard cannot fill in.
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByLabelText("Gun start"), "2026-10-04T06:00");

      expect(screen.getByTestId("value")).toHaveTextContent("2026-10-04T06:00");
    });

    it("reads the moment back with its weekday", async () => {
      // A month typed wrong still looks plausible as digits. It stops looking
      // plausible when it names the wrong day of the week, and starts_at cannot
      // be corrected after create_event.
      render(<Harness initial="2026-10-04T06:00" />);

      expect(screen.getByText(/Sunday, October 4, 2026 at 06:00/)).toBeInTheDocument();
    });

    it("opens a calendar and takes the day that was clicked", async () => {
      const user = userEvent.setup();
      render(<Harness initial="2026-10-04T06:00" />);

      await user.click(screen.getByRole("button", { name: "Pick a date" }));
      await user.click(screen.getByRole("button", { name: "Thursday, October 15th, 2026" }));

      expect(screen.getByTestId("value")).toHaveTextContent("2026-10-15T06:00");
    });

    it("keeps the time when the day changes", async () => {
      // Resetting the hour on every day click would produce a plausible wrong
      // answer rather than an obvious one.
      const user = userEvent.setup();
      render(<Harness initial="2026-10-04T05:30" />);

      await user.click(screen.getByRole("button", { name: "Pick a date" }));
      await user.click(screen.getByRole("button", { name: "Tuesday, October 20th, 2026" }));

      expect(screen.getByTestId("value")).toHaveTextContent("2026-10-20T05:30");
    });

    it("keeps the day when the time changes", async () => {
      const user = userEvent.setup();
      render(<Harness initial="2026-10-04T06:00" />);

      await user.clear(screen.getByLabelText("Gun start time"));
      await user.type(screen.getByLabelText("Gun start time"), "07:45");

      expect(screen.getByTestId("value")).toHaveTextContent("2026-10-04T07:45");
    });

    it("closes the calendar once a day is chosen", async () => {
      const user = userEvent.setup();
      render(<Harness initial="2026-10-04T06:00" />);

      await user.click(screen.getByRole("button", { name: "Pick a date" }));
      await user.click(screen.getByRole("button", { name: "Thursday, October 15th, 2026" }));

      expect(screen.getByRole("button", { name: "Pick a date" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Thursday, October 15th, 2026" }),
      ).not.toBeInTheDocument();
    });

    it("labels every day with its full date, and says which one is chosen", async () => {
      // What a screen reader reads out. "15" on its own says nothing about
      // which month is on screen, and nothing about what is already selected.
      const user = userEvent.setup();
      render(<Harness initial="2026-10-04T06:00" />);

      await user.click(screen.getByRole("button", { name: "Pick a date" }));

      expect(
        screen.getByRole("button", { name: "Sunday, October 4th, 2026, selected" }),
      ).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("says nothing at all while it is empty", () => {
      render(<Harness />);

      expect(screen.queryByText(/at \d\d:\d\d/)).not.toBeInTheDocument();
    });

    it("says nothing for a half-typed value rather than guessing", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByLabelText("Gun start"), "2026-10");

      expect(screen.queryByText(/ at \d\d:\d\d/)).not.toBeInTheDocument();
    });

    it("warns when the moment has already passed", () => {
      vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
      render(<Harness initial="2026-10-04T06:00" warnIfPast />);

      expect(screen.getByText(/in the past/i)).toBeInTheDocument();
      vi.useRealTimers();
    });

    it("does not warn about the past where it makes no sense to", () => {
      // Registration opening in the past is completely normal.
      vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
      render(<Harness initial="2026-10-04T06:00" />);

      expect(screen.queryByText(/in the past/i)).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });
});
