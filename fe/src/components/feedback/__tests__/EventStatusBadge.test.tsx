import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventStatusBadge } from "@/components/feedback/EventStatusBadge";
import { EVENT_STATUSES } from "@sterunxyz/sdk";

describe("EventStatusBadge", () => {
  describe("positive", () => {
    it("names the status it was given", () => {
      render(<EventStatusBadge status="Open" />);

      expect(screen.getByText("Open for entry")).toBeInTheDocument();
    });

    it("renders every status the contract can hold", () => {
      // The lifecycle is five states since contracts v2 added Cancelled
      // (INTERFACE.md §1.2). A badge that only knows four would render a blank
      // chip on a real event, so this walks whatever the SDK currently holds
      // rather than a list written out here that can fall behind it.
      //
      // It matches on `data-status`, not on the words: the words are a product
      // decision that has already changed once (Draft → "Not open yet") and
      // this test is about coverage, not copy.
      for (const status of EVENT_STATUSES) {
        const { container, unmount } = render(<EventStatusBadge status={status} />);
        expect(container.querySelector(`[data-status="${status}"]`)).not.toBeNull();
        expect(container.textContent?.trim()).not.toBe("");
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

      for (const status of ["Draft", "Closed", "Completed", "Cancelled"] as const) {
        const { container } = render(<EventStatusBadge status={status} />);
        expect(container.firstElementChild?.className).not.toBe(openClass);
      }
    });

    it("keeps Closed and Cancelled apart, because one of them still has a race", () => {
      // The costly confusion is not Open-vs-anything, it is a runner reading
      // "the race is off" as "entries are shut" or the reverse. They shared a
      // tone when Cancelled first landed; this is what stops that coming back.
      const { container: closed } = render(<EventStatusBadge status="Closed" />);
      const { container: cancelled } = render(<EventStatusBadge status="Cancelled" />);

      expect(cancelled.firstElementChild?.className).not.toBe(
        closed.firstElementChild?.className,
      );
    });

    it("keeps Draft and Closed apart, because they point opposite ways in time", () => {
      // Both are grey on purpose — nothing is wrong in either — so the only
      // thing separating "not yet" from "no longer" is outline against filled.
      const { container: draft } = render(<EventStatusBadge status="Draft" />);
      const { container: closed } = render(<EventStatusBadge status="Closed" />);

      expect(draft.firstElementChild?.className).not.toBe(
        closed.firstElementChild?.className,
      );
    });

    it("carries the status as data, so it can be found without reading colour", () => {
      render(<EventStatusBadge status="Completed" />);

      expect(screen.getByText("Finished")).toHaveAttribute("data-status", "Completed");
    });

    it("never prints the word Draft", () => {
      // The contract's vocabulary stays in `data-status`; the chip is read by
      // an organiser who has not drafted anything.
      const { container } = render(<EventStatusBadge status="Draft" />);

      expect(container.textContent).not.toMatch(/draft/i);
      expect(container.querySelector('[data-status="Draft"]')).not.toBeNull();
    });
  });
});
