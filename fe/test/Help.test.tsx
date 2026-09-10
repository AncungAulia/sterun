import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/elements/Field";
import { Help } from "@/components/elements/Help";

describe("Help", () => {
  describe("positive", () => {
    it("keeps the explanation out of the way until it is asked for", async () => {
      // The whole point: a form where every field carries a paragraph is a form
      // people stop reading. What is not on screen cannot be skimmed past.
      const user = userEvent.setup();
      render(<Help label="Poster">It sits at the top of your event page.</Help>);

      expect(screen.queryByText(/sits at the top/i)).not.toBeInTheDocument();

      await user.hover(screen.getByRole("button", { name: /about poster/i }));

      expect(await screen.findByText(/sits at the top/i)).toBeInTheDocument();
    });

    it("opens on keyboard focus, not only on a hover", async () => {
      // A mouse is not the only way in, and an explanation nobody can reach
      // without one is an explanation half the users do not have.
      const user = userEvent.setup();
      render(<Help label="Waiver">This becomes the copy runners agreed to.</Help>);

      await user.tab();

      expect(screen.getByRole("button", { name: /about waiver/i })).toHaveFocus();
      expect(await screen.findByText(/copy runners agreed to/i)).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("names what it explains, so a form full of them is still navigable", () => {
      // "More information" nine times down one page tells a screen reader user
      // nothing about which field they are on.
      render(<Help label="Entry fee in sUSD">Paid in sUSD.</Help>);

      expect(screen.getByRole("button", { name: "About entry fee in susd" })).toBeInTheDocument();
    });

    it("adds nothing to a field that was not given any", () => {
      render(<Field id="name" label="Event name" value="" onChange={() => {}} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Event name")).toBeInTheDocument();
    });

    it("leaves the label still clickable to focus its own field", async () => {
      // The button lives beside the label rather than inside it. Inside, one
      // click would open the tooltip and move the caret at the same time.
      const user = userEvent.setup();
      render(
        <Field id="name" label="Event name" value="" onChange={() => {}} help="Cannot be renamed." />,
      );

      await user.click(screen.getByText("Event name"));

      expect(screen.getByLabelText("Event name")).toHaveFocus();
    });
  });
});
