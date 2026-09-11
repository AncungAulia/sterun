import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PosterFrame } from "@/modules/directory/component/PosterFrame";

const POSTER = "https://files.test/poster.jpg";

describe("PosterFrame", () => {
  describe("positive", () => {
    it("shows the whole poster over a blurred copy of itself", () => {
      const { container } = render(<PosterFrame posterUrl={POSTER} loading={false} sizes="100vw" />);

      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(2);
      images.forEach((image) => expect(image.getAttribute("src")).toBe(POSTER));
      expect(images[1]).toHaveClass("object-contain");
      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });

    it("draws what it is given on top of the picture", () => {
      render(
        <PosterFrame posterUrl={POSTER} loading={false} sizes="100vw">
          <span>Open</span>
        </PosterFrame>,
      );

      expect(screen.getByText("Open")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("stays blank while the document is on its way", () => {
      const { container } = render(<PosterFrame posterUrl={null} loading sizes="100vw" />);

      expect(container.querySelector("img")).toBeNull();
      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("says No image when the race has no poster", () => {
      render(<PosterFrame posterUrl={null} loading={false} sizes="100vw" />);

      expect(screen.getByText("No image")).toBeInTheDocument();
    });

    it("falls back to No image when the poster fails to load", () => {
      const { container } = render(<PosterFrame posterUrl={POSTER} loading={false} sizes="100vw" />);

      fireEvent.error(container.querySelectorAll("img")[1]);

      expect(screen.getByText("No image")).toBeInTheDocument();
      expect(container.querySelector("img")).toBeNull();
    });
  });
});
