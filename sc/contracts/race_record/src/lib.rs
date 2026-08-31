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

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String,
};
use stellar_tokens::non_fungible::Base;

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
    /// The category sequence handed out by `EventRegistry::reserve_slot`.
    pub bib_no: u32,
    pub participant_hash: BytesN<32>,
    pub state: RecordState,
    pub entered_at: u64,
    pub claimed_at: Option<u64>,
    pub finish_time_s: Option<u32>,
    pub result_at: Option<u64>,
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
// NOTE (cross-contract code collision): a revert inside `EventRegistry`
// propagates to this contract's caller as the *same* `ScError` integer, and
// Soroban error codes carry no contract identity. `EventRegistry::EventNotOpen`
// is 4 and `QuotaFull` is 5, which a client decoding against *this* enum reads
// as `InvalidState` / `NotAuthorized`. Both numberings are frozen by their
// tickets, so the SDK (D2) must decode an `enter` failure against
// `EventRegistry`'s enum for the codes that can only originate there. The tests
// `enter_on_a_non_open_event_propagates_event_not_open` and
// `enter_when_the_category_is_full_propagates_quota_full` pin the wire codes
// down so this stays visible.
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    RecordNotFound = 2,
    /// `claim_racepack` when the state is not [`RecordState::Entered`] — the
    /// anti-double-racepack guard.
    AlreadyClaimed = 3,
    /// `record_finish` when the state is not [`RecordState::RacepackClaimed`],
    /// or any attempt to move out of a terminal state.
    InvalidState = 4,
    /// The operator is neither the event organiser nor an allowlisted scanner.
    NotAuthorized = 5,
    /// `finish_time_s == 0`.
    InvalidFinishTime = 6,
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
