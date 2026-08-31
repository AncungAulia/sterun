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
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, BytesN, Env, MuxedAddress, String, Vec,
};
use stellar_tokens::non_fungible::{enumerable::Enumerable, Base};

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

    // -- entry ---------------------------------------------------------------

    /// Registers `runner` for a category and mints their record. **One
    /// invocation, one atomicity boundary**: the quota reservation, the entry
    /// fee and the mint either all land or all roll back, so a failed payment
    /// can never leave a slot consumed or a record without a fee.
    ///
    /// Steps, in order:
    /// 1. `runner.require_auth()` — the runner signs one auth tree that also
    ///    covers the nested SEP-41 `transfer` sub-invocation.
    /// 2. `reserve_slot` on the registry. RaceRecord is the direct caller, so
    ///    the registry's stored `RaceRecordAddr` authorizes implicitly. Its
    ///    reverts (`QuotaFull`, `EventNotOpen`, `CategoryNotFound`, …)
    ///    propagate out of this call untouched — see the error-code note above.
    /// 3. Pay `price_usdc` straight from the runner to the organiser. **A free
    ///    category (`price_usdc == 0`) skips the transfer entirely**, so a free
    ///    entry never needs the runner to hold the token — or, for a classic
    ///    `G...` account, to carry a trustline for it at all.
    /// 4. Mint the non-transferable record and store its [`RecordData`].
    pub fn enter(
        env: Env,
        runner: Address,
        event_id: u32,
        category_id: u32,
        participant_hash: BytesN<32>,
    ) -> Result<u32, Error> {
        runner.require_auth();
        bump_instance(&env);

        let registry = EventRegistryClient::new(&env, &read_registry(&env)?);
        // Quota before money: a closed event or a full category costs the
        // runner nothing but the failed transaction's fee.
        let bib_no = registry.reserve_slot(&event_id, &category_id);
        let price = registry.get_category(&event_id, &category_id).price_usdc;
        let organiser = registry.get_organiser(&event_id);

        if price > 0 {
            let token = read_instance_addr(&env, DataKey::TokenAddr)?;
            let to: MuxedAddress = organiser.into();
            TokenClient::new(&env, &token).transfer(&runner, &to, &price);
        }

        let token_id = Enumerable::sequential_mint(&env, &runner);
        write_record(
            &env,
            token_id,
            &RecordData {
                event_id,
                category_id,
                bib_no,
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

        let mut record = read_record(&env, token_id)?;
        let registry = EventRegistryClient::new(&env, &read_registry(&env)?);
        if operator != registry.get_organiser(&record.event_id)
            && !registry.is_scanner(&record.event_id, &operator)
        {
            return Err(Error::NotAuthorized);
        }
        if record.state != RecordState::Entered {
            return Err(Error::AlreadyClaimed);
        }

        record.state = RecordState::RacepackClaimed;
        record.claimed_at = Some(env.ledger().timestamp());
        let event_id = record.event_id;
        write_record(&env, token_id, &record);

        RacepackClaimed {
            token_id,
            event_id,
            operator,
        }
        .publish(&env);
        Ok(())
    }

    /// Publishes a finish time. Organiser only.
    ///
    /// Requires [`RecordState::RacepackClaimed`]: a runner who never collected
    /// a race pack cannot receive a result, and [`RecordState::Finished`] is
    /// terminal so a published time can never be rewritten.
    pub fn record_finish(env: Env, token_id: u32, finish_time_s: u32) -> Result<(), Error> {
        bump_instance(&env);
        let mut record = read_record(&env, token_id)?;
        auth_organiser(&env, record.event_id)?;

        if finish_time_s == 0 {
            return Err(Error::InvalidFinishTime);
        }
        if record.state != RecordState::RacepackClaimed {
            return Err(Error::InvalidState);
        }

        record.state = RecordState::Finished;
        record.finish_time_s = Some(finish_time_s);
        record.result_at = Some(env.ledger().timestamp());
        let event_id = record.event_id;
        write_record(&env, token_id, &record);

        RecordFinished {
            token_id,
            event_id,
            finish_time_s,
        }
        .publish(&env);
        Ok(())
    }

    /// Marks a no-show or a did-not-finish. Organiser only.
    ///
    /// Legal from [`RecordState::Entered`] (never showed up) and from
    /// [`RecordState::RacepackClaimed`] (started, did not finish). Terminal
    /// states reject it with [`Error::InvalidState`].
    pub fn record_dnf(env: Env, token_id: u32) -> Result<(), Error> {
        bump_instance(&env);
        let mut record = read_record(&env, token_id)?;
        auth_organiser(&env, record.event_id)?;

        if !matches!(
            record.state,
            RecordState::Entered | RecordState::RacepackClaimed
        ) {
            return Err(Error::InvalidState);
        }

        record.state = RecordState::Dnf;
        record.result_at = Some(env.ledger().timestamp());
        let event_id = record.event_id;
        write_record(&env, token_id, &record);

        RecordDnf { token_id, event_id }.publish(&env);
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
    /// Never panics: an unknown `token_id` is simply `false`, because this is a
    /// public, wallet-less read that verifiers call speculatively.
    pub fn verify(env: Env, token_id: u32, participant_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<_, RecordData>(&DataKey::Record(token_id))
            .is_some_and(|record| record.participant_hash == participant_hash)
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
