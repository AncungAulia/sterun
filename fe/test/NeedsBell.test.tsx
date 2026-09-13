import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NeedsBell } from "@/modules/organiser/component/NeedsBell";
import { UrgentBanner } from "@/modules/organiser/component/UrgentBanner";
import type { Need } from "@/modules/organiser/needs";

function need(overrides: Partial<Need> = {}): Need {
  return {
    kind: "scanner",
    eventId: 1,
    eventName: "Fun Run Sleman",
    urgent: true,
    title: "Add a scanner - Fun Run Sleman",
    detail: "Runs in 3 days. Nobody can check runners in.",
    action: "Add a scanner",
    href: "/org/events/1?tab=scanners",
    ...overrides,
  };
}

describe("NeedsBell", () => {
  describe("positive", () => {
    it("counts what is waiting", () => {
      render(<NeedsBell needs={[need(), need({ eventId: 2, kind: "open", urgent: false })]} />);

      expect(screen.getByRole("button", { name: "2 things need you" })).toBeInTheDocument();
    });

    it("lists them once it is opened", async () => {
      render(<NeedsBell needs={[need()]} />);
      await userEvent.click(screen.getByRole("button", { name: "1 thing needs you" }));

      expect(screen.getByText("Add a scanner - Fun Run Sleman")).toBeInTheDocument();
      expect(screen.getByText("Runs in 3 days. Nobody can check runners in.")).toBeInTheDocument();
    });

    it("links each row to where the fix is", async () => {
      render(<NeedsBell needs={[need()]} />);
      await userEvent.click(screen.getByRole("button", { name: "1 thing needs you" }));

      expect(screen.getByRole("link", { name: /Add a scanner/ })).toHaveAttribute(
        "href",
        "/org/events/1?tab=scanners",
      );
    });
  });

  describe("negative", () => {
    it("says so plainly when nothing is waiting", async () => {
      render(<NeedsBell needs={[]} />);
      await userEvent.click(screen.getByRole("button", { name: "Nothing needs you" }));

      expect(screen.getByText("Nothing is waiting on you.")).toBeInTheDocument();
    });

    it("shows no count badge when nothing is waiting", () => {
      // A badge that is always there is furniture. The dot has to mean
      // something or it stops being read at all.
      const { container } = render(<NeedsBell needs={[]} />);

      expect(container.querySelector("[data-needs-count]")).toBeNull();
    });
  });

  describe("edge", () => {
    it("uses the singular for one thing", () => {
      render(<NeedsBell needs={[need()]} />);

      expect(screen.getByRole("button", { name: "1 thing needs you" })).toBeInTheDocument();
    });

    it("marks the urgent row apart from the rest", async () => {
      render(<NeedsBell needs={[need(), need({ eventId: 2, kind: "results", urgent: false })]} />);
      await userEvent.click(screen.getByRole("button", { name: "2 things need you" }));

      const rows = screen.getAllByRole("link");
      expect(rows[0]).toHaveAttribute("data-urgent", "true");
      expect(rows[1]).not.toHaveAttribute("data-urgent", "true");
    });
  });
});

describe("UrgentBanner", () => {
  describe("positive", () => {
    it("says which race and what is missing, with the way to fix it", () => {
      render(<UrgentBanner need={need()} />);

      expect(screen.getByText("Fun Run Sleman")).toBeInTheDocument();
      expect(screen.getByText(/Nobody can check runners in/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Add a scanner" })).toHaveAttribute(
        "href",
        "/org/events/1?tab=scanners",
      );
    });
  });

  describe("edge", () => {
    it("prints a race name with a hyphen in it whole", () => {
      // The banner never takes `title` apart on punctuation: a race is free to
      // have a hyphen in its name, and a banner that split on one would lose
      // half its sentence the day one does.
      render(<UrgentBanner need={need({ eventName: "Jogja - Sleman Relay" })} />);

      expect(screen.getByText("Jogja - Sleman Relay")).toBeInTheDocument();
    });
  });
});
