import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChainSource } from "@/components/layouts/ChainSource";
import { CONTRACTS, NETWORK } from "@/lib/env";

describe("ChainSource", () => {
  describe("positive", () => {
    it("names the network the page is reading", () => {
      render(<ChainSource />);

      expect(screen.getByText(NETWORK.networkPassphrase)).toBeInTheDocument();
    });

    it("links the registry contract to a public explorer", () => {
      // The claim on this page is "read from the chain". A visitor who wants to
      // check it needs the contract id, and a way to look at it that does not
      // go through us.
      render(<ChainSource />);

      const link = screen.getByRole("link", { name: /contract/i });
      expect(link).toHaveAttribute(
        "href",
        `https://stellar.expert/explorer/testnet/contract/${CONTRACTS.eventRegistry}`,
      );
    });

    it("shows the rpc node the reads go to", () => {
      render(<ChainSource />);

      expect(screen.getByText(NETWORK.rpcUrl)).toBeInTheDocument();
    });
  });
});
