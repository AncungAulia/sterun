-- STE-49 — a ledger for the web app's "Get test sUSD" button.
--
-- The faucet was CLI-only. Putting it behind an HTTP route means strangers can
-- ask for money, and keypairs are free, so two limits have to hold even under
-- concurrency: one payout per address per window, and a cap on the total paid
-- per day. Both are checked against this table, inside a transaction that holds
-- an advisory lock, so two requests arriving together are serialised and the
-- second one sees the first one's row.
--
-- ## Why a row is written BEFORE the payment
--
-- A payment is a network call that can take seconds. If the row were written
-- after it, two concurrent requests would both pass the check and both be paid.
-- So a claim inserts `pending` first, commits, pays, then settles the row to
-- `paid` or `failed`.
--
-- `failed` does not count against either limit: a runner whose payout failed
-- (their trustline was removed in between, say) must be able to try again.
-- `pending` DOES count, including one left behind by a process that died
-- mid-payment. That is the safe direction: at worst an address waits out a
-- window it should not have had to, and nobody is ever paid twice.
--
-- The address is public on chain; nothing here is personal data.
CREATE TABLE faucet_payouts (
    id              bigserial PRIMARY KEY,
    address         text NOT NULL CHECK (address ~ '^G[A-Z2-7]{55}$'),
    amount_stroops  bigint NOT NULL CHECK (amount_stroops > 0),
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed')),
    tx_hash         text CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
    requested_at    timestamptz NOT NULL DEFAULT now(),
    settled_at      timestamptz,

    -- A payout claimed as made has to say which transaction made it.
    CONSTRAINT paid_payouts_name_their_transaction CHECK (status <> 'paid' OR tx_hash IS NOT NULL)
);

-- "When did this address last get paid?"
CREATE INDEX faucet_payouts_address_idx ON faucet_payouts (address, requested_at DESC);
-- "How much went out in the last day?"
CREATE INDEX faucet_payouts_requested_idx ON faucet_payouts (requested_at);
