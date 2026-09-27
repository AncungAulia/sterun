import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HeaderSearch } from "@/components/layout/HeaderSearch";

const push = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params.current,
}));

beforeEach(() => {
  push.mockReset();
  params.current = new URLSearchParams();
});

describe("HeaderSearch", () => {
  describe("positive", () => {
    it("puts the query in the address, so it works from any page and can be sent", async () => {
      render(<HeaderSearch />);

      await userEvent.type(screen.getByRole("searchbox", { name: "Search races" }), "jogja run{Enter}");

      expect(push).toHaveBeenCalledWith("/?q=jogja%20run");
    });

    it("says what is being searched when the address already carries one", () => {
      params.current = new URLSearchParams({ q: "borobudur" });

      render(<HeaderSearch />);

      expect(screen.getByRole("searchbox", { name: "Search races" })).toHaveValue("borobudur");
    });

    it("offers the words the search actually matches, and hides them once there is text", async () => {
      render(<HeaderSearch />);
      const rolled = screen.getByText("Search by").parentElement;
      expect(rolled?.textContent).toContain("race");
      expect(rolled?.textContent).toContain("venue");
      expect(rolled?.textContent).toContain("city");

      await userEvent.type(screen.getByRole("searchbox", { name: "Search races" }), "j");

      expect(screen.queryByText("Search by")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("goes back to the plain directory when the box is emptied", async () => {
      params.current = new URLSearchParams({ q: "jogja" });
      render(<HeaderSearch />);

      await userEvent.clear(screen.getByRole("searchbox", { name: "Search races" }));
      await userEvent.type(screen.getByRole("searchbox", { name: "Search races" }), "{Enter}");

      expect(push).toHaveBeenCalledWith("/");
    });

    it("does not navigate on every keystroke, which would fill the history", async () => {
      render(<HeaderSearch />);

      await userEvent.type(screen.getByRole("searchbox", { name: "Search races" }), "jogja");

      expect(push).not.toHaveBeenCalled();
    });
  });
});
