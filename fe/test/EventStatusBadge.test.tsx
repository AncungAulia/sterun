import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { EVENT_STATUSES } from "@sterun/sdk";

describe("EventStatusBadge", () => {
  describe("positive", () => {
    it("names the status it was given", () => {
      render(<EventStatusBadge status="Open" />);

      expect(screen.getByText("Open")).toBeInTheDocument();
    });

    it("renders every status the contract can hold", () => {
      // The lifecycle is frozen at four states (INTERFACE.md §1.2). A badge
      // that only knows three would render a blank chip on a real event.
      for (const status of EVENT_STATUSES) {
        const { unmount } = render(<EventStatusBadge status={status} />);
        expect(screen.getByText(status)).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("edge", () => {
    it("marks Open apart from every other status", () => {
      // "Open means you can enter" is the one distinction the directory has to
      // make at a glance, so the three others must not share its treatment.
      const { container: open } = render(<EventStatusBadge status="Open" />);
      const openClass = open.firstElementChild?.className ?? "";

      for (const status of ["Draft", "Closed", "Completed"] as const) {
        const { container } = render(<EventStatusBadge status={status} />);
        expect(container.firstElementChild?.className).not.toBe(openClass);
      }
    });

    it("carries the status as data, so it can be found without reading colour", () => {
      render(<EventStatusBadge status="Completed" />);

      expect(screen.getByText("Completed")).toHaveAttribute("data-status", "Completed");
    });
  });
});
