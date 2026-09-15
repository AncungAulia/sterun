import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

    it("fades the poster in once it has loaded", async () => {
      // jsdom has no layout or Tailwind CSS, so next/image's onLoad check warns about the frame's size.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { container } = render(<PosterFrame posterUrl={POSTER} loading={false} sizes="100vw" />);

      const front = container.querySelectorAll("img")[1];
      expect(front).toHaveClass("opacity-0");
      fireEvent.load(front);

      await waitFor(() => expect(front).toHaveClass("opacity-100"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('has "fill" and parent element with invalid "position"'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('has "fill" and a height value of 0'));
    });
  });

  describe("edge", () => {
    it("tries a new poster after an earlier one failed", () => {
      const next = "https://files.test/other.jpg";
      const { container, rerender } = render(<PosterFrame posterUrl={POSTER} loading={false} sizes="100vw" />);

      fireEvent.error(container.querySelectorAll("img")[1]);
      expect(screen.getByText("No image")).toBeInTheDocument();

      rerender(<PosterFrame posterUrl={next} loading={false} sizes="100vw" />);

      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(2);
      images.forEach((image) => expect(image.getAttribute("src")).toBe(next));
      expect(screen.queryByText("No image")).not.toBeInTheDocument();
    });

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
