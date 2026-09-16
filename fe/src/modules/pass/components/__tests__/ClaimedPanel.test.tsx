/**
 * The panel that replaces the QR once the race pack is handed over.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClaimedPanel } from "@/modules/pass/components/ClaimedPanel";

const CLAIMED = BigInt(Date.UTC(2026, 8, 27, 2, 41) / 1000);

describe("ClaimedPanel", () => {
  it("states the fact, when it happened, and the way to the record", () => {
    render(<ClaimedPanel eventId={13} tokenId={7} claimedAt={CLAIMED} />);

    expect(screen.getByText("Race pack collected")).toBeInTheDocument();
    expect(screen.getByText(/^\d+ Sep, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View race record" })).toHaveAttribute(
      "href",
      "/events/13/entered/7",
    );
  });

  it("draws its check rather than dropping one in", () => {
    render(<ClaimedPanel eventId={13} tokenId={7} claimedAt={CLAIMED} />);
    expect(screen.getByTestId("claimed-check")).toHaveClass("pass-check");
  });

  it("says it happened without a time when the chain has not been read yet", () => {
    render(<ClaimedPanel eventId={13} tokenId={7} claimedAt={null} />);

    expect(screen.getByText("Race pack collected")).toBeInTheDocument();
    expect(screen.queryByText(/Sep,/)).not.toBeInTheDocument();
  });
});
