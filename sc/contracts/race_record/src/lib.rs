#![no_std]
//! # RaceRecord (Sterun component C2)
//!
//! One **non-transferable** record per race entry, bound to the runner's
//! address, carrying the lifecycle (`Entered` -> `RacepackClaimed` ->
//! `Finished` | `Dnf`) and the result.
//!
//! See `docs/SYSTEM_DESIGN.md` section 3.2 for the authoritative design, and
//! section 5 for the lifecycle diagram.
//!
//! ## Why "non-transferable" means the function is ABSENT
//!
//! A Soroban contract exposes exactly the functions in its `#[contractimpl]`
//! export surface: no fallback dispatch, no `delegatecall`. The OpenZeppelin
//! non-fungible module splits *storage primitives* (`Base::mint`,
//! `Base::owner_of`, `Base::balance`, `Base::token_uri`,
//! `Enumerable::sequential_mint`) from the public `NonFungibleToken` /
//! `NonFungibleEnumerable` traits that would export `transfer`,
//! `transfer_from`, `approve`, `approve_for_all`, `burn` and `burn_from`.
//!
//! This contract implements **neither trait** and calls **only** the storage
//! primitives. Ownership can therefore never change after mint — not because a
//! guard says "revert if transfer", but because no exported code path writes
//! the owner mapping a second time. A gate can be misconfigured; an absent
//! function cannot be called. `sc/scripts/check-exports.sh` asserts this
//! mechanically against the built wasm, and the `exports` test module runs the
//! same assertion from `cargo test`.
//!
//! ## v2: the claim is now about the deployed wasm, not about the address
//!
//! v1 was non-upgradeable, so "this contract cannot move a record" was true
//! forever, of the address itself. v2 carries [`RaceRecord::upgrade`], and an
//! admin upgrade could install a wasm that does export `transfer`. Say it
//! plainly rather than let the old sentence quietly become a half-truth:
//!
//! * **What is still mechanically true:** the wasm that is deployed exports no
//!   function that can move, destroy or delegate a record. That is checked
//!   against the artifact, not against the source, on every build and again on
//!   the live contract during deploy.
//! * **What is now a trust assumption:** that the admin key does not install a
//!   wasm which changes that. It is the same trust the upgrade buys us
//!   everywhere else, and it is why the upgrade emits [`ContractUpgraded`] —
//!   a code change under a stable address has to be visible on the ledger.
//!
//! The alternative was leaving RaceRecord frozen while EventRegistry gained
//! add-ons, which would mean the next `enter` change needs new addresses again.
//! `docs/specs/INTERFACE.md` §4 carries the same wording for D2/D3 consumers.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, BytesN, Env, Map, MuxedAddress, String, Vec,
};
use stellar_tokens::non_fungible::{enumerable::Enumerable, Base, NFTStorageKey};

use crate::registry::EventRegistryClient;

pub mod registry;

// ---------------------------------------------------------------------------
// State archival / TTL (docs/SYSTEM_DESIGN.md 3.4)
// ---------------------------------------------------------------------------

/// ~5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
/// Only pay to bump once the remaining TTL drops below ~120 days, which is the
/// floor a freshly written persistent entry starts at.
const BUMP_THRESHOLD: u32 = 120 * DAY_IN_LEDGERS;
/// Bump back up to ~180 days — the network's maximum entry TTL, so this is the
/// longest extension the host will accept. If a future network lowers
/// `max_entry_ttl`, lower this to match or `extend_ttl` starts reverting.
const BUMP_TO: u32 = 180 * DAY_IN_LEDGERS;

// ---------------------------------------------------------------------------
// Add-ons (v2, STE-35)
// ---------------------------------------------------------------------------

/// Hard ceiling on add-ons bought in one [`RaceRecord::enter`].
///
/// `enter` already refuses more add-ons than the event actually has, which
/// bounds the loop for any honest event. This is the bound that does not depend
/// on registry state at all: an organiser who publishes a thousand add-ons
/// cannot turn one entry into a thousand cross-contract calls plus a quadratic
/// duplicate scan. Sixteen is far past any real race-day merch table.
const MAX_ADDONS_PER_ENTRY: u32 = 16;

/// The most race packs one [`RaceRecord::claim_racepack_many`] call may carry
/// (v2.7, STE-66).
///
/// Measured rather than chosen: every row reads and writes one record and emits
/// one `RacepackClaimed`, and against the per-transaction limits live on testnet
/// and mainnet (2026-09-23) the 16,384 bytes of contract events bind first. The
/// constant leaves headroom below that and is enforced here, so a desk that
/// sends too many gets [`Error::TooManyClaims`] from simulation instead of a
/// transaction that dies on the network's resource limits. The measurement and
/// what binds are in `sc/contracts/race_record/CLAUDE.md`.
pub const MAX_CLAIMS_PER_CALL: u32 = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Lifecycle of one race record. `Finished` and `Dnf` are terminal: there is
/// no exported path out of either.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecordState {
    Entered,
    RacepackClaimed,
    Finished,
    Dnf,
}

/// The verifiable record itself. `participant_hash` is
/// `sha256(name || national_id || emergency_contact || salt)` — a commitment
/// to off-chain PII, never the PII.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordData {
    pub event_id: u32,
    pub category_id: u32,
    /// The bib `EventRegistry::reserve_slot` handed out: unique within the
    /// event and counting from 1 since registry v2.3.
    pub bib_no: u32,
    /// The add-ons this entry paid for, in the order they were reserved (v2).
    /// Empty for an entry that bought none.
    ///
    /// This is what makes a purchase checkable rather than merely claimed: the
    /// merch desk reads the record, not an order email, to decide whether this
    /// runner gets a jersey.
    pub addon_ids: Vec<u32>,
    pub participant_hash: BytesN<32>,
    pub state: RecordState,
    pub entered_at: u64,
    pub claimed_at: Option<u64>,
    /// The official net time. On a [`RecordState::Finished`] record, `None` is
    /// the marker for "finished, no official time" (`record_finish_untimed`,
    /// v2.2) — never a zero-second race.
    pub finish_time_s: Option<u32>,
    pub result_at: Option<u64>,
}

/// Why one race pack in a [`RaceRecord::claim_racepack_many`] batch was left
/// alone (v2.7).
///
/// Neither is an error: a desk that hands over 300 packs offline will have rows
/// the chain already knows about, and the batch's job is to land the other 299.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClaimSkipped {
    /// No record with that `token_id`. A roster from another race, or a typo.
    NotFound,
    /// The record is not `Entered`: another desk got there first, or the runner
    /// is already finished or DNF. Same condition as [`Error::AlreadyClaimed`].
    NotEntered,
}

/// One race pack a batch did not claim, and why (v2.7).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkippedClaim {
    pub token_id: u32,
    pub reason: ClaimSkipped,
}

/// What one row of a [`RaceRecord::record_results`] batch records (v2.6):
/// exactly the three single-result functions, one variant each.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResultOutcome {
    /// `record_finish(token_id, finish_time_s)`.
    Timed(u32),
    /// `record_finish_untimed(token_id)`.
    Untimed,
    /// `record_dnf(token_id)`.
    Dnf,
}

/// One row of a [`RaceRecord::record_results`] batch (v2.6).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResultEntry {
    pub token_id: u32,
    pub outcome: ResultOutcome,
}

/// Storage schema. Wiring lives in instance storage (tiny, global, read on
/// most calls); records are persistent so they survive archival cycles.
///
/// The OpenZeppelin `Base` / `Enumerable` owner, balance and enumeration keys
/// live under their own `NFTStorageKey` / `NFTEnumerableStorageKey` enums and
/// are never touched directly from here.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// instance -> `Address`
    Admin,
    /// instance -> `Address`, the EventRegistry (C1) instance
    RegistryAddr,
    /// instance -> `Address`, the SEP-41 token (sUSD SAC on testnet, USDC on
    /// mainnet). A constructor parameter, never a hardcoded contract id.
    TokenAddr,
    /// persistent -> [`RecordData`], keyed by `token_id`
    Record(u32),
}

// ---------------------------------------------------------------------------
// Errors — codes are public ABI, never renumber.
//
// PROJECT CONVENTION: disjoint code bands, one per contract.
//
//   1..=99    EventRegistry (C1)
//   100..=199 RaceRecord (C2, this contract)
//   200+      reserved by OpenZeppelin `NonFungibleTokenError`
//   next free hundred for each future contract
//
// The bands exist because a Soroban `ScError` carries a bare `u32` and **no
// contract identity**. `enter` calls into EventRegistry and into a SEP-41
// token, and their reverts propagate to our caller unchanged — so without
// disjoint bands an `Error(Contract, #4)` out of `enter` could be either
// EventRegistry's `EventNotOpen` or RaceRecord's own `InvalidState`, and the
// D2 SDK would have to guess. With them, the number alone names its origin.
//
// `error_codes_of_the_two_contracts_are_disjoint_bands` fails the build if the
// bands ever overlap again.
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 100,
    RecordNotFound = 101,
    /// `claim_racepack` when the state is not [`RecordState::Entered`] — the
    /// anti-double-racepack guard.
    AlreadyClaimed = 102,
    /// `record_finish` / `record_finish_untimed` when the state is not
    /// [`RecordState::RacepackClaimed`], or any attempt to move out of a
    /// terminal state.
    InvalidState = 103,
    /// The operator is neither the event organiser nor an allowlisted scanner.
    NotAuthorized = 104,
    /// `finish_time_s == 0`.
    InvalidFinishTime = 105,
    /// `enter` asked for more add-ons than the event has, or more than
    /// `MAX_ADDONS_PER_ENTRY` (v2).
    TooManyAddOns = 106,
    /// `enter` listed the same `addon_id` twice (v2). Buying two jerseys is two
    /// add-ons with two quotas, not one id repeated.
    DuplicateAddOn = 107,
    /// `record_results` named a record that belongs to a different event than
    /// the one the batch is for (v2.6). The organiser signs for one event; a
    /// row for another event is never theirs to record.
    ResultForAnotherEvent = 108,
    /// `claim_racepack_many` with more than [`MAX_CLAIMS_PER_CALL`] token ids
    /// (v2.7). Refused before anything is read, so an oversized queue costs a
    /// simulation rather than a transaction that dies on the network's limits.
    TooManyClaims = 109,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordEntered {
    #[topic]
    pub runner: Address,
    #[topic]
    pub event_id: u32,
    pub token_id: u32,
    pub bib_no: u32,
}

/// Emitted by [`RaceRecord::upgrade`]. The export surface is the product claim
/// here, so a change to it must leave a trace on the ledger.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    #[topic]
    pub new_wasm_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RacepackClaimed {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub event_id: u32,
    pub operator: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordFinished {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub event_id: u32,
    pub finish_time_s: u32,
}

/// Emitted by [`RaceRecord::record_finish_untimed`] (v2.2, STE-41).
///
/// A NEW event rather than [`RecordFinished`] with a `0`: that event carries a
/// plain `u32`, and every consumer already decoding it would read `0` as a
/// zero-second race. An untimed finish has no time to carry, so this event has
/// no data at all — the same all-topic shape as [`RecordDnf`].
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordFinishedUntimed {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub event_id: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordDnf {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub event_id: u32,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct RaceRecord;

#[contractimpl]
impl RaceRecord {
    /// Runs once at deploy time. Stores the wiring (admin, EventRegistry, the
    /// SEP-41 entry-fee token) and the OpenZeppelin collection metadata.
    ///
    /// `token` is a parameter, not a constant: testnet deploys point at the
    /// Sterun sUSD SAC, mainnet at Circle's USDC SAC, with no code change.
    pub fn __constructor(
        env: Env,
        admin: Address,
        registry: Address,
        token: Address,
        name: String,
        symbol: String,
        base_uri: String,
    ) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::RegistryAddr, &registry);
        env.storage().instance().set(&DataKey::TokenAddr, &token);
        Base::set_metadata(&env, base_uri, name, symbol);
        bump_instance(&env);
    }

    // -- upgrade -------------------------------------------------------------

    /// Replaces this contract's own wasm. **Admin only.**
    ///
    /// See the module docs for what this does to the non-transferable claim:
    /// the guarantee becomes one about the deployed artifact plus a trusted
    /// admin key, instead of one about the address forever.
    ///
    /// Storage rules, which the compiler cannot enforce across an upgrade:
    ///
    /// * [`DataKey`] is **append-only** — never remove, rename, or retype a
    ///   variant. The enum travels as its variant name.
    /// * [`RecordData`] is **field-append-only in the `Option` sense only**. A
    ///   `#[contracttype]` struct is a map keyed by field name, and decoding a
    ///   stored value into a struct that gained a *required* field fails. A
    ///   future version that needs more per-record data must either put it
    ///   behind a new [`DataKey`] variant or accept that old records cannot be
    ///   read. This is why `addon_ids` was added now, while no v2 record
    ///   exists, rather than later.
    /// * The OpenZeppelin owner, balance and enumeration keys belong to
    ///   `stellar-tokens` and move with its version. Changing that dependency's
    ///   major version in an upgrade is a storage migration, not a bump.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        read_instance_addr(&env, DataKey::Admin)?.require_auth();
        bump_instance(&env);
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());

        ContractUpgraded { new_wasm_hash }.publish(&env);
        Ok(())
    }

    // -- entry ---------------------------------------------------------------

    // NOTE: keep the doc comment below SHORT. `#[contractimpl]` copies it into
    // the contract spec, which caps the string — an over-long doc lands in the
    // generated TypeScript truncated mid-word. Reasoning goes in comments like
    // this one, which the spec never sees.
    //
    // Steps, in order:
    //   1. `runner.require_auth()` — one auth tree, which also covers the
    //      nested SEP-41 `transfer` sub-invocation.
    //   2. `reserve_slot` on the registry. RaceRecord is the direct caller, so
    //      the stored `RaceRecordAddr` authorizes implicitly. Registry reverts
    //      (`QuotaFull`, `EventNotOpen`, `CategoryNotFound`, `AddOnQuotaFull`)
    //      propagate out of this call untouched — see the error-band note above.
    //   3. Reserve every requested add-on; each returns the price of the unit it
    //      took. A sold-out add-on reverts the whole entry: the runner asked for
    //      a place AND a jersey, and a place alone is a different purchase from
    //      the one they signed.
    //   4. Transfer the summed total, once.
    //   5. Mint the record and store what was bought.
    //
    // The `addon_ids` bounds are not redundant. `<= addon_count` keeps an honest
    // event's loop short; `<= MAX_ADDONS_PER_ENTRY` keeps it bounded no matter
    // what an organiser publishes. A repeated id is rejected because it would
    // take two units of stock while the record recorded one.

    /// Registers `runner` for a category, charges the entry fee plus any
    /// add-ons as ONE transfer, and mints their record.
    ///
    /// **One invocation, one atomicity boundary**: the category slot, every
    /// add-on unit, the payment and the mint either all land or all roll back.
    /// A total of `0` skips the token call entirely, so a free entry needs
    /// neither a balance nor a trustline.
    ///
    /// `addon_ids` must hold at most [`MAX_ADDONS_PER_ENTRY`] ids, no more than
    /// the event has add-ons, and no id twice.
    pub fn enter(
        env: Env,
        runner: Address,
        event_id: u32,
        category_id: u32,
        addon_ids: Vec<u32>,
        participant_hash: BytesN<32>,
    ) -> Result<u32, Error> {
        runner.require_auth();
        bump_instance(&env);

        let registry = EventRegistryClient::new(&env, &read_registry(&env)?);
        // `addon_count` is a cross-contract call, and an entry with no add-ons
        // has nothing to check it against. Skipping it keeps the empty-list path
        // costing exactly what v1 cost — which is what INTERFACE.md §2.1 tells
        // callers to expect when they send `[]`.
        if !addon_ids.is_empty() {
            check_addon_ids(&addon_ids, registry.addon_count(&event_id))?;
        }

        // Quota before money: a closed event, a full category or a sold-out
        // add-on costs the runner nothing but the failed transaction's fee.
        let bib_no = registry.reserve_slot(&event_id, &category_id);
        let mut total = registry.get_category(&event_id, &category_id).price_usdc;
        for addon_id in addon_ids.iter() {
            // Reserving returns the price of the unit just taken, so the amount
            // billed cannot drift from the stock consumed. `overflow-checks` in
            // the release profile turns an absurd sum into a revert rather than
            // a wrap.
            total += registry.reserve_addon(&event_id, &addon_id);
        }
        let organiser = registry.get_organiser(&event_id);

        // One transfer for the whole basket. Splitting it per line item would
        // mean a runner could be charged for the entry and then fail on the
        // jersey — the rollback covers that either way, but a single transfer
        // is also a single thing for the runner's wallet to show and approve.
        if total > 0 {
            let token = read_instance_addr(&env, DataKey::TokenAddr)?;
            let to: MuxedAddress = organiser.into();
            TokenClient::new(&env, &token).transfer(&runner, &to, &total);
        }

        let token_id = Enumerable::sequential_mint(&env, &runner);
        write_record(
            &env,
            token_id,
            &RecordData {
                event_id,
                category_id,
                bib_no,
                addon_ids,
                participant_hash,
                state: RecordState::Entered,
                entered_at: env.ledger().timestamp(),
                claimed_at: None,
                finish_time_s: None,
                result_at: None,
            },
        );

        RecordEntered {
            runner,
            event_id,
            token_id,
            bib_no,
        }
        .publish(&env);
        Ok(token_id)
    }

    // -- lifecycle -----------------------------------------------------------

    /// Race-day check-in. `operator` must be the event organiser or one of its
    /// allowlisted scanner devices.
    ///
    /// **The anti-double-racepack guard lives here**: the state must be exactly
    /// [`RecordState::Entered`]. A second scan — from the same desk or from a
    /// second offline desk whose queue drains later — finds
    /// [`RecordState::RacepackClaimed`] and reverts with
    /// [`Error::AlreadyClaimed`]. The chain, not volunteer discipline, is what
    /// makes "one pack per entry" true.
    pub fn claim_racepack(env: Env, token_id: u32, operator: Address) -> Result<(), Error> {
        operator.require_auth();
        bump_instance(&env);

        let record = read_record(&env, token_id)?;
        let registry = EventRegistryClient::new(&env, &read_registry(&env)?);
        if operator != registry.get_organiser(&record.event_id)
            && !registry.is_scanner(&record.event_id, &operator)
        {
            return Err(Error::NotAuthorized);
        }
        if record.state != RecordState::Entered {
            return Err(Error::AlreadyClaimed);
        }

        hand_over_racepack(&env, token_id, record, operator);
        Ok(())
    }

    // STE-66. A race pack desk works offline and queues each hand-over; when
    // signal returns the queue is sent, and one call per runner means one wallet
    // prompt per runner. A desk that handed over 300 packs asked its volunteer to
    // approve 300 times.
    //
    // Two rules, and the second is the whole point:
    //
    // - **Authorisation is per event, exactly as `claim_racepack` checks it.**
    //   The operator authorises once, then each record's event is checked
    //   against the registry. `NotAuthorized` REVERTS the batch: that is a
    //   misconfigured desk, not a race, and skipping it would hand a volunteer a
    //   half-done queue with no clue why. Each event is checked once per call —
    //   a desk sends one event's queue, so this is one pair of cross-contract
    //   calls, not one per runner.
    // - **An already-claimed pack does NOT revert the batch.** That is the
    //   two-desk case from STE-25: the loser of a race would otherwise block the
    //   other 299 hand-overs. Those tokens come back in the return value with a
    //   reason, and the scanner shows them on its flagged list.
    //
    // It emits one `RacepackClaimed` per pack actually claimed, in row order, so
    // the indexer needs no new handler.

    /// Hands over many race packs in one signature. Organiser or an allowlisted
    /// scanner, per event. Returns the ids it did NOT claim, with the reason;
    /// an unauthorised event reverts the whole batch.
    pub fn claim_racepack_many(
        env: Env,
        token_ids: Vec<u32>,
        operator: Address,
    ) -> Result<Vec<SkippedClaim>, Error> {
        if token_ids.len() > MAX_CLAIMS_PER_CALL {
            return Err(Error::TooManyClaims);
        }
        operator.require_auth();
        bump_instance(&env);

        let registry = EventRegistryClient::new(&env, &read_registry(&env)?);
        // Events this operator has already been cleared for in THIS call. A desk
        // sends one event's queue, so without it the batch would repeat the same
        // two cross-contract reads for every runner.
        let mut cleared: Map<u32, ()> = Map::new(&env);
        let mut skipped: Vec<SkippedClaim> = Vec::new(&env);

        for token_id in token_ids.iter() {
            let record = match env
                .storage()
                .persistent()
                .get::<_, RecordData>(&DataKey::Record(token_id))
            {
                Some(record) => record,
                None => {
                    skipped.push_back(SkippedClaim {
                        token_id,
                        reason: ClaimSkipped::NotFound,
                    });
                    continue;
                }
            };

            if !cleared.contains_key(record.event_id) {
                if operator != registry.get_organiser(&record.event_id)
                    && !registry.is_scanner(&record.event_id, &operator)
                {
                    return Err(Error::NotAuthorized);
                }
                cleared.set(record.event_id, ());
            }

            if record.state != RecordState::Entered {
                skipped.push_back(SkippedClaim {
                    token_id,
                    reason: ClaimSkipped::NotEntered,
                });
                continue;
            }

            hand_over_racepack(&env, token_id, record, operator.clone());
        }

        Ok(skipped)
    }

    /// Publishes a finish time. Organiser only.
    ///
    /// Requires [`RecordState::RacepackClaimed`]: a runner who never collected
    /// a race pack cannot receive a result, and [`RecordState::Finished`] is
    /// terminal so a published time can never be rewritten.
    pub fn record_finish(env: Env, token_id: u32, finish_time_s: u32) -> Result<(), Error> {
        bump_instance(&env);
        let record = read_record(&env, token_id)?;
        auth_organiser(&env, record.event_id)?;
        apply_result(&env, token_id, record, ResultOutcome::Timed(finish_time_s))
    }

    // STE-41 (option A). Fun runs, colour runs and charity runs often have no
    // chip timing, and `record_finish` rightly refuses `0` — so without this a
    // runner who crossed the line stays at `RacepackClaimed` forever, and `Dnf`
    // would be a lie. Option B (`record_finish(id, 0)`) was rejected: the
    // `RecordFinished` event carries a bare `u32`, and every consumer already
    // decoding it would read `0` as a zero-second race.
    //
    // Deliberately a twin of `record_finish`: the same organiser gate, the same
    // `RacepackClaimed` guard, the same terminal `Finished`. The only difference
    // is `finish_time_s == None` on a `Finished` record, which is the on-chain
    // marker for "finished, no official time". No storage changes:
    // `RecordData.finish_time_s` has been an `Option<u32>` since v1.

    /// Marks a finish with no official time, for untimed events. Organiser
    /// only, from `RacepackClaimed`; leaves `finish_time_s` as `None`.
    pub fn record_finish_untimed(env: Env, token_id: u32) -> Result<(), Error> {
        bump_instance(&env);
        let record = read_record(&env, token_id)?;
        auth_organiser(&env, record.event_id)?;
        apply_result(&env, token_id, record, ResultOutcome::Untimed)
    }

    /// Marks a no-show or a did-not-finish. Organiser only.
    ///
    /// Legal from [`RecordState::Entered`] (never showed up) and from
    /// [`RecordState::RacepackClaimed`] (started, did not finish). Terminal
    /// states reject it with [`Error::InvalidState`].
    pub fn record_dnf(env: Env, token_id: u32) -> Result<(), Error> {
        bump_instance(&env);
        let record = read_record(&env, token_id)?;
        auth_organiser(&env, record.event_id)?;
        apply_result(&env, token_id, record, ResultOutcome::Dnf)
    }

    // STE-60. A race of 312 runners was 312 organiser signatures, and a
    // transaction may hold only ONE InvokeHostFunctionOp, so batching has to be
    // a contract function that loops.
    //
    // - One organiser gate for the whole batch, read from the registry for
    //   `event_id`, and every row must belong to that event
    //   (`ResultForAnotherEvent`). Without the second check an organiser of one
    //   race could publish results into another race's records.
    // - Each row goes through `apply_result`, the same code the three single
    //   functions run, so the rules cannot drift apart: `InvalidFinishTime`,
    //   `InvalidState`, terminal states.
    // - ATOMIC: the first bad row reverts the whole batch, including rows
    //   already applied. Results are terminal, and the console's preview is the
    //   place to fix a file, not the ledger. A token listed twice fails its
    //   second row on `InvalidState`, so it reverts too.
    // - Emits exactly the per-record events the single functions emit, in row
    //   order, so an indexer needs no new handler.
    // - An empty batch records nothing and succeeds.
    // - No cap in the contract: the network's per-transaction limits (written
    //   entries, event bytes) bound a batch, and the measured maximum lives in
    //   the SDK and sc/CLAUDE.md.

    /// Records many results for one event in one call. Organiser only. Atomic:
    /// any invalid row reverts the whole batch.
    pub fn record_results(env: Env, event_id: u32, results: Vec<ResultEntry>) -> Result<(), Error> {
        bump_instance(&env);
        auth_organiser(&env, event_id)?;
        for entry in results.iter() {
            let record = read_record(&env, entry.token_id)?;
            if record.event_id != event_id {
                return Err(Error::ResultForAnotherEvent);
            }
            apply_result(&env, entry.token_id, record, entry.outcome)?;
        }
        Ok(())
    }

    /// **Permissionless** rent top-up for one record — no `require_auth` at
    /// all. A runner's history has to outlive the event by years, so anyone
    /// (the runner, the organiser, a Sterun keeper cron, a stranger) may pay to
    /// keep it out of archival. The caller pays the fee; the entry's contents
    /// cannot be changed this way.
    pub fn extend_record_ttl(env: Env, token_id: u32) -> Result<(), Error> {
        let key = DataKey::Record(token_id);
        if !env.storage().persistent().has(&key) {
            return Err(Error::RecordNotFound);
        }
        bump_instance(&env);
        bump_persistent(&env, &key);
        Ok(())
    }

    // -- views ---------------------------------------------------------------

    pub fn record_of(env: Env, token_id: u32) -> Result<RecordData, Error> {
        read_record(&env, token_id)
    }

    /// Every record `runner` owns, via the OpenZeppelin `Enumerable` per-owner
    /// index. Bounded by the runner's balance, which only `enter` can grow.
    pub fn records_of(env: Env, runner: Address) -> Vec<u32> {
        let balance = Base::balance(&env, &runner);
        let mut tokens = Vec::new(&env);
        for index in 0..balance {
            tokens.push_back(Enumerable::get_owner_token_id(&env, &runner, index));
        }
        tokens
    }

    /// Checks a record against a recomputed `participant_hash`. Given the
    /// off-chain PII plus the salt, anyone — insurer, medical desk, another
    /// organiser — can prove the record belongs to that person.
    ///
    /// "Hash **and owner** match", per `docs/SYSTEM_DESIGN.md` 3.2: `true` needs
    /// the record to exist, its stored hash to equal the argument, *and* the
    /// token to still be owned by somebody. The two halves cannot come apart
    /// through the exported surface — `enter` mints and writes the record in one
    /// invocation, and nothing burns — but the check is spelled out so the
    /// shipped behaviour is literally the documented claim rather than a
    /// consequence of it.
    ///
    /// Never panics: an unknown `token_id` is simply `false`, because this is a
    /// public, wallet-less read that verifiers call speculatively.
    pub fn verify(env: Env, token_id: u32, participant_hash: BytesN<32>) -> bool {
        let Some(record) = env
            .storage()
            .persistent()
            .get::<_, RecordData>(&DataKey::Record(token_id))
        else {
            return false;
        };
        record.participant_hash == participant_hash && has_owner(&env, token_id)
    }

    /// The runner this record is bound to. There is no exported path that ever
    /// changes it.
    pub fn owner_of(env: Env, token_id: u32) -> Address {
        Base::owner_of(&env, token_id)
    }

    pub fn balance(env: Env, owner: Address) -> u32 {
        Base::balance(&env, &owner)
    }

    pub fn token_uri(env: Env, token_id: u32) -> String {
        Base::token_uri(&env, token_id)
    }

    pub fn total_supply(env: Env) -> u32 {
        Enumerable::total_supply(&env)
    }

    /// Collection name, from the OpenZeppelin metadata written by the
    /// constructor.
    pub fn name(env: Env) -> String {
        Base::name(&env)
    }

    /// Collection symbol.
    pub fn symbol(env: Env) -> String {
        Base::symbol(&env)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        read_instance_addr(&env, DataKey::Admin)
    }

    pub fn get_registry(env: Env) -> Result<Address, Error> {
        read_instance_addr(&env, DataKey::RegistryAddr)
    }

    pub fn get_token(env: Env) -> Result<Address, Error> {
        read_instance_addr(&env, DataKey::TokenAddr)
    }
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported — they live outside the `#[contractimpl]`).
// ---------------------------------------------------------------------------

/// Keeps the contract instance (wiring, collection metadata, and the
/// OpenZeppelin token-id counter and total supply) alive. Called at the top of
/// every mutating entry point — active users pay rent for the state they touch.
fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

/// `extend_ttl` is floor-only and idempotent: a no-op while the remaining TTL
/// is still above `BUMP_THRESHOLD`, and it never shortens an entry.
fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, BUMP_THRESHOLD, BUMP_TO);
}

/// Rejects a non-empty `addon_ids` list before `enter` touches any state.
///
/// Both bounds are checked before the duplicate scan, so the quadratic scan can
/// only ever run over at most [`MAX_ADDONS_PER_ENTRY`] entries. A `Vec` compare
/// is the whole scan: at these sizes a set would cost more than it saves.
///
/// An empty list never reaches here — see the caller. It would pass every check
/// trivially, and reading `addon_count` to prove that costs a cross-contract
/// call on the most common entry there is.
fn check_addon_ids(addon_ids: &Vec<u32>, addon_count: u32) -> Result<(), Error> {
    let requested = addon_ids.len();
    if requested > MAX_ADDONS_PER_ENTRY || requested > addon_count {
        return Err(Error::TooManyAddOns);
    }
    for i in 0..requested {
        for j in (i + 1)..requested {
            if addon_ids.get_unchecked(i) == addon_ids.get_unchecked(j) {
                return Err(Error::DuplicateAddOn);
            }
        }
    }
    Ok(())
}

/// The one place a race pack is handed over — shared by `claim_racepack` and
/// every row of `claim_racepack_many`, so a batch cannot write a record the
/// single call would have written differently.
///
/// The caller has already authorised the operator for this record's event and
/// checked that the record is `Entered`.
fn hand_over_racepack(env: &Env, token_id: u32, mut record: RecordData, operator: Address) {
    record.state = RecordState::RacepackClaimed;
    record.claimed_at = Some(env.ledger().timestamp());
    let event_id = record.event_id;
    write_record(env, token_id, &record);

    RacepackClaimed {
        token_id,
        event_id,
        operator,
    }
    .publish(env);
}

/// The one place a result is validated, written and announced — shared by
/// `record_finish`, `record_finish_untimed`, `record_dnf` and every row of
/// `record_results`, so a batch cannot accept what a single call refuses.
///
/// The caller has already authorised the organiser of `record.event_id`.
fn apply_result(
    env: &Env,
    token_id: u32,
    mut record: RecordData,
    outcome: ResultOutcome,
) -> Result<(), Error> {
    let event_id = record.event_id;
    match outcome {
        ResultOutcome::Timed(finish_time_s) => {
            if finish_time_s == 0 {
                return Err(Error::InvalidFinishTime);
            }
            if record.state != RecordState::RacepackClaimed {
                return Err(Error::InvalidState);
            }
            record.state = RecordState::Finished;
            record.finish_time_s = Some(finish_time_s);
        }
        ResultOutcome::Untimed => {
            if record.state != RecordState::RacepackClaimed {
                return Err(Error::InvalidState);
            }
            record.state = RecordState::Finished;
            record.finish_time_s = None;
        }
        ResultOutcome::Dnf => {
            if !matches!(
                record.state,
                RecordState::Entered | RecordState::RacepackClaimed
            ) {
                return Err(Error::InvalidState);
            }
            record.state = RecordState::Dnf;
        }
    }
    record.result_at = Some(env.ledger().timestamp());
    write_record(env, token_id, &record);

    match outcome {
        ResultOutcome::Timed(finish_time_s) => RecordFinished {
            token_id,
            event_id,
            finish_time_s,
        }
        .publish(env),
        ResultOutcome::Untimed => RecordFinishedUntimed { token_id, event_id }.publish(env),
        ResultOutcome::Dnf => RecordDnf { token_id, event_id }.publish(env),
    }
    Ok(())
}

fn read_instance_addr(env: &Env, key: DataKey) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&key)
        .ok_or(Error::NotInitialized)
}

fn read_registry(env: &Env) -> Result<Address, Error> {
    read_instance_addr(env, DataKey::RegistryAddr)
}

fn read_record(env: &Env, token_id: u32) -> Result<RecordData, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Record(token_id))
        .ok_or(Error::RecordNotFound)
}

/// Non-panicking existence probe on the OpenZeppelin owner mapping.
///
/// `Base::owner_of` panics with `NonExistentToken` and stellar-tokens 0.7.2
/// ships no `try_owner_of`, so a plain `has` on OZ's own public
/// [`NFTStorageKey`] is the only way to keep [`RaceRecord::verify`] panic-free.
/// This only ever READS that key — the owner mapping still has no exported
/// write path, which is what makes a record non-transferable.
fn has_owner(env: &Env, token_id: u32) -> bool {
    env.storage()
        .persistent()
        .has(&NFTStorageKey::Owner(token_id))
}

fn write_record(env: &Env, token_id: u32, record: &RecordData) {
    let key = DataKey::Record(token_id);
    env.storage().persistent().set(&key, record);
    bump_persistent(env, &key);
}

/// Loads the event's organiser from the registry and requires *that* address's
/// authorization. Authority always comes from registry state, never from a
/// caller-supplied address.
fn auth_organiser(env: &Env, event_id: u32) -> Result<Address, Error> {
    let organiser = EventRegistryClient::new(env, &read_registry(env)?).get_organiser(&event_id);
    organiser.require_auth();
    Ok(organiser)
}

mod test;
