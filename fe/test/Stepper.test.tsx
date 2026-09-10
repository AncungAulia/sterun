import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stepper } from "@/components/elements/Stepper";

const STEPS = [
  { id: "details", label: "Details" },
  { id: "document", label: "Document" },
  { id: "create", label: "Create" },
] as const;

describe("Stepper", () => {
  describe("positive", () => {
    it("names every step", () => {
      render(<Stepper steps={STEPS} current="document" />);

      for (const step of STEPS) {
        expect(screen.getByText(step.label)).toBeInTheDocument();
      }
    });

    it("marks the current step for assistive technology, not just in colour", () => {
      render(<Stepper steps={STEPS} current="document" />);

      const current = screen.getByText("Document").closest("[aria-current='step']");
      expect(current).not.toBeNull();
      expect(within(current as HTMLElement).getByText("current step")).toBeInTheDocument();
    });

    it("says which steps are already done", () => {
      render(<Stepper steps={STEPS} current="create" />);

      const details = screen.getByText("Details").parentElement as HTMLElement;
      expect(within(details).getByText("completed")).toBeInTheDocument();
    });

    it("says which steps have not started", () => {
      render(<Stepper steps={STEPS} current="details" />);

      const create = screen.getByText("Create").parentElement as HTMLElement;
      expect(within(create).getByText("not started")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("marks exactly one step as current", () => {
      const { container } = render(<Stepper steps={STEPS} current="document" />);

      expect(container.querySelectorAll("[aria-current='step']")).toHaveLength(1);
    });

    it("shows a number for a step not yet done, and a tick for one that is", () => {
      render(<Stepper steps={STEPS} current="create" />);

      // The third step is current, so it still shows its number.
      expect(screen.getByText("3")).toBeInTheDocument();
      // The first two are done, so their numbers are gone.
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });

    it("marks nothing as done on the first step", () => {
      render(<Stepper steps={STEPS} current="details" />);

      expect(screen.queryByText("completed")).not.toBeInTheDocument();
    });
  });
});
