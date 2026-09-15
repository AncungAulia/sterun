/**
 * The one paragraph on this site that costs the product something to say.
 *
 * `enter` transfers the fee straight from the runner to the organiser, so the
 * contract never holds the money and there is nothing for anybody to send
 * back. That is a property of the protocol, not an oversight, and the only
 * honest thing to do with it is print it where the money is about to move.
 * STE-38 fixes the wording; these tests are what stop it being softened later
 * by somebody who finds it uninviting.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NonRefundableNotice } from "@/components/elements/NonRefundableNotice";

describe("NonRefundableNotice", () => {
  describe("positive", () => {
    it("says entry is non-refundable", () => {
      render(<NonRefundableNotice />);

      expect(screen.getByText(/non-refundable/i)).toBeInTheDocument();
    });

    it("says a postponed race is announced rather than silently corrected", () => {
      // The whole reason the document is frozen: an organiser who can edit it
      // quietly is the fraud this product exists to catch.
      render(<NonRefundableNotice />);

      const notice = screen.getByRole("note");
      expect(notice).toHaveTextContent(/postponed or moved/i);
      expect(notice).toHaveTextContent(/the organiser will announce it/i);
      expect(notice).toHaveTextContent(/stay as they were/i);
    });

    it("puts any refund on the organiser, and says Sterun cannot force one", () => {
      render(<NonRefundableNotice />);

      const notice = screen.getByRole("note");
      expect(notice).toHaveTextContent(/up to the organiser/i);
      expect(notice).toHaveTextContent(/Sterun cannot require one/i);
    });
  });

  describe("negative", () => {
    it("never suggests the protocol can force a refund", () => {
      // A promise the chain cannot keep is worse than no promise at all.
      render(<NonRefundableNotice />);

      const text = screen.getByRole("note").textContent ?? "";
      expect(text).toMatch(/cannot require one/i);
      expect(text).not.toMatch(/\bwe (will|can) refund\b/i);
      expect(text).not.toMatch(/\bguarantee/i);
    });
  });
});
