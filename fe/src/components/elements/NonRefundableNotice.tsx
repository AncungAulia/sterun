/**
 * The money fact, printed where the money moves.
 *
 * `enter` transfers `category.price + Σ addon.price` straight from the runner
 * to the organiser in one atomic call. The contract never custodies the fee,
 * so there is no balance a refund could be paid out of, and no admin key that
 * could force one. That is a deliberate design decision (no escrow, see
 * CLAUDE.md) and it has a cost: a runner who pays and then finds the race
 * moved has only the organiser's goodwill.
 *
 * Hiding that would be the same failure this product exists to catch, so it is
 * a block of text on the way in rather than a line in a footer or a modal
 * somebody dismisses without reading. STE-38, from Axel's STE-34 decision.
 *
 * `role="note"` rather than `alert`: nothing has gone wrong and nothing needs
 * interrupting. It is an aside a screen reader can reach and announce as one.
 *
 * Warning tone rather than danger: this is true of every healthy race on the
 * platform, and painting the normal case red would teach people to skip red.
 */
export function NonRefundableNotice({ className }: { className?: string } = {}) {
  return (
    <div
      role="note"
      className={`rounded-lg border border-warning-border bg-warning-surface px-4 py-3 ${className ?? ""}`}
    >
      <p className="text-sm text-warning">
        <strong className="font-medium">Entry is non-refundable.</strong> If this race is postponed
        or moved, the organiser will announce it, and the details published here stay as they were.
        Any refund is up to the organiser, and Sterun cannot require one.
      </p>
    </div>
  );
}
