#![no_std]
//! # EventRegistry (Sterun component C1)
//!
//! Organiser-facing registry for running events. One deployed instance serves
//! every event: it stores the event itself, its distance categories (quota,
//! price, bib sequence) and who may act for the event (organiser + scanner
//! devices).
//!
//! See `docs/SYSTEM_DESIGN.md` section 3.1 for the authoritative design.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String, Symbol,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Lifecycle of an event. `Draft` -> `Open` -> `Closed` -> `Completed`, with
/// `Closed` <-> `Open` allowed so an organiser can re-open registration.
/// `Completed` is terminal.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventStatus {
    Draft,
    Open,
    Closed,
    Completed,
}

/// One race event. `metadata_hash` commits to the off-chain detail document
/// pointed at by `uri`; no PII ever lands here.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventData {
    pub organiser: Address,
    pub name: String,
    pub metadata_hash: BytesN<32>,
    pub uri: String,
    pub starts_at: u64,
    pub status: EventStatus,
}

/// One distance category of an event. `entered_count` doubles as the bib
/// sequence handed out by [`EventRegistry::reserve_slot`].
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CategoryData {
    pub code: Symbol,
    pub distance_m: u32,
    pub quota: u32,
    /// 7-decimal token representation (sUSD on testnet, USDC on mainnet).
    pub price_usdc: i128,
    pub entered_count: u32,
}

/// Storage schema. `Admin` / `RaceRecordAddr` / `EventCount` live in instance
/// storage (tiny, global, read on most calls); everything else is persistent
/// so it survives archival cycles.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// instance -> `Address`
    Admin,
    /// instance -> `Address`
    RaceRecordAddr,
    /// instance -> `u32`
    EventCount,
    /// persistent -> [`EventData`], keyed by `event_id`
    Event(u32),
    /// persistent -> [`CategoryData`], keyed by `(event_id, category_id)`
    Category(u32, u32),
    /// persistent -> `u32`, keyed by `event_id`
    CategoryCount(u32),
    /// persistent -> `bool`, keyed by `(event_id, scanner)`
    Scanner(u32, Address),
}

// ---------------------------------------------------------------------------
// Errors — codes are public ABI, never renumber.
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    EventNotFound = 2,
    CategoryNotFound = 3,
    EventNotOpen = 4,
    QuotaFull = 5,
    RaceRecordNotSet = 6,
    RaceRecordAlreadySet = 7,
    /// `quota == 0`
    InvalidQuota = 8,
    /// `price_usdc < 0`
    InvalidPrice = 9,
    /// `distance_m == 0`
    InvalidDistance = 10,
    /// Illegal [`EventStatus`] transition.
    InvalidStatus = 11,
    ScannerAlreadyAdded = 12,
    ScannerNotFound = 13,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventCreated {
    #[topic]
    pub event_id: u32,
    #[topic]
    pub organiser: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CategoryAdded {
    #[topic]
    pub event_id: u32,
    pub category_id: u32,
    pub quota: u32,
    pub price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventStatusChanged {
    #[topic]
    pub event_id: u32,
    pub status: EventStatus,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScannerAdded {
    #[topic]
    pub event_id: u32,
    #[topic]
    pub scanner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScannerRemoved {
    #[topic]
    pub event_id: u32,
    #[topic]
    pub scanner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlotReserved {
    #[topic]
    pub event_id: u32,
    #[topic]
    pub category_id: u32,
    pub seq: u32,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct EventRegistry;

#[contractimpl]
impl EventRegistry {
    /// Runs once at deploy time. Stores the admin and seeds the event counter.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::EventCount, &0u32);
    }

    /// One-shot wiring of the RaceRecord contract address, done by the admin
    /// once both contracts are deployed. A second call is rejected so the
    /// trusted caller of [`Self::reserve_slot`] can never be swapped out.
    pub fn set_race_record(env: Env, race_record: Address) -> Result<(), Error> {
        read_admin(&env)?.require_auth();
        if env.storage().instance().has(&DataKey::RaceRecordAddr) {
            return Err(Error::RaceRecordAlreadySet);
        }
        env.storage()
            .instance()
            .set(&DataKey::RaceRecordAddr, &race_record);
        Ok(())
    }

    // -- organiser surface ---------------------------------------------------

    /// Creates an event owned by `organiser`. Ids are assigned from a
    /// monotonic counter and never reused. The event starts in
    /// [`EventStatus::Draft`] so categories can be added before registration
    /// opens.
    pub fn create_event(
        env: Env,
        organiser: Address,
        name: String,
        metadata_hash: BytesN<32>,
        uri: String,
        starts_at: u64,
    ) -> Result<u32, Error> {
        organiser.require_auth();

        let event_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::EventCount)
            .ok_or(Error::NotInitialized)?;

        write_event(
            &env,
            event_id,
            &EventData {
                organiser: organiser.clone(),
                name,
                metadata_hash,
                uri,
                starts_at,
                status: EventStatus::Draft,
            },
        );
        write_category_count(&env, event_id, 0);
        // `event_id + 1` cannot overflow in practice: it would take u32::MAX
        // successful `create_event` transactions, and `overflow-checks = true`
        // in the release profile turns the impossible case into a revert.
        env.storage()
            .instance()
            .set(&DataKey::EventCount, &(event_id + 1));

        EventCreated {
            event_id,
            organiser,
        }
        .publish(&env);
        Ok(event_id)
    }

    /// Adds a distance category to an event. Category ids restart at 0 for
    /// every event.
    pub fn add_category(
        env: Env,
        event_id: u32,
        code: Symbol,
        distance_m: u32,
        quota: u32,
        price_usdc: i128,
    ) -> Result<u32, Error> {
        auth_organiser(&env, event_id)?;
        if quota == 0 {
            return Err(Error::InvalidQuota);
        }
        if price_usdc < 0 {
            return Err(Error::InvalidPrice);
        }
        if distance_m == 0 {
            return Err(Error::InvalidDistance);
        }

        let category_id = Self::category_count(env.clone(), event_id);
        write_category(
            &env,
            event_id,
            category_id,
            &CategoryData {
                code,
                distance_m,
                quota,
                price_usdc,
                entered_count: 0,
            },
        );
        write_category_count(&env, event_id, category_id + 1);

        CategoryAdded {
            event_id,
            category_id,
            quota,
            price: price_usdc,
        }
        .publish(&env);
        Ok(category_id)
    }

    /// Moves the event through its lifecycle. Only forward moves are legal,
    /// plus the `Open` <-> `Closed` toggle; `Completed` is terminal and a
    /// no-op transition is rejected so no misleading event is emitted.
    pub fn set_event_status(env: Env, event_id: u32, status: EventStatus) -> Result<(), Error> {
        let mut event = auth_organiser(&env, event_id)?;
        if !is_valid_transition(event.status, status) {
            return Err(Error::InvalidStatus);
        }

        event.status = status;
        write_event(&env, event_id, &event);

        EventStatusChanged { event_id, status }.publish(&env);
        Ok(())
    }

    /// Allowlists a volunteer device for race-day check-in on this event.
    pub fn add_scanner(env: Env, event_id: u32, scanner: Address) -> Result<(), Error> {
        auth_organiser(&env, event_id)?;
        let key = DataKey::Scanner(event_id, scanner.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::ScannerAlreadyAdded);
        }

        env.storage().persistent().set(&key, &true);

        ScannerAdded { event_id, scanner }.publish(&env);
        Ok(())
    }

    /// Revokes a volunteer device. The entry is removed rather than set to
    /// `false` so the organiser stops paying rent for it.
    pub fn remove_scanner(env: Env, event_id: u32, scanner: Address) -> Result<(), Error> {
        auth_organiser(&env, event_id)?;
        let key = DataKey::Scanner(event_id, scanner.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::ScannerNotFound);
        }

        env.storage().persistent().remove(&key);

        ScannerRemoved { event_id, scanner }.publish(&env);
        Ok(())
    }

    // -- entry reservation ---------------------------------------------------

    /// Reserves one slot in a category and returns its bib sequence number.
    ///
    /// **Only the wired RaceRecord contract may call this.** The gate is
    /// invoker-contract authorization: the stored `RaceRecordAddr` must
    /// authorize, and a contract address authorizes implicitly *only* when it
    /// is the direct cross-contract caller. RaceRecord does not implement
    /// `CustomAccountInterface` (`__check_auth`), so there is no signature an
    /// EOA could present for that address either — no one can mint a slot
    /// without going through `RaceRecord.enter`.
    ///
    /// The quota check and the increment happen in this one invocation, so two
    /// simultaneous entries can never both take the last slot: the second
    /// transaction reads the already-incremented `entered_count` and reverts
    /// with [`Error::QuotaFull`].
    pub fn reserve_slot(env: Env, event_id: u32, category_id: u32) -> Result<u32, Error> {
        let race_record: Address = env
            .storage()
            .instance()
            .get(&DataKey::RaceRecordAddr)
            .ok_or(Error::RaceRecordNotSet)?;
        race_record.require_auth();

        let event = read_event(&env, event_id)?;
        if event.status != EventStatus::Open {
            return Err(Error::EventNotOpen);
        }

        let mut category = read_category(&env, event_id, category_id)?;
        if category.entered_count >= category.quota {
            return Err(Error::QuotaFull);
        }

        let seq = category.entered_count;
        // Bounded by the guard above: `entered_count < quota <= u32::MAX`.
        category.entered_count = seq + 1;
        write_category(&env, event_id, category_id, &category);

        SlotReserved {
            event_id,
            category_id,
            seq,
        }
        .publish(&env);
        Ok(seq)
    }

    // -- views ---------------------------------------------------------------

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        read_admin(&env)
    }

    pub fn get_race_record(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::RaceRecordAddr)
            .ok_or(Error::RaceRecordNotSet)
    }

    pub fn event_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::EventCount)
            .unwrap_or(0)
    }

    pub fn get_event(env: Env, event_id: u32) -> Result<EventData, Error> {
        read_event(&env, event_id)
    }

    pub fn get_category(env: Env, event_id: u32, category_id: u32) -> Result<CategoryData, Error> {
        read_category(&env, event_id, category_id)
    }

    pub fn get_organiser(env: Env, event_id: u32) -> Result<Address, Error> {
        Ok(read_event(&env, event_id)?.organiser)
    }

    /// `false` when the address was never added, or was removed.
    pub fn is_scanner(env: Env, event_id: u32, addr: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Scanner(event_id, addr))
            .unwrap_or(false)
    }

    pub fn category_count(env: Env, event_id: u32) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::CategoryCount(event_id))
            .unwrap_or(0)
    }
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported — they live outside the `#[contractimpl]`).
// ---------------------------------------------------------------------------

fn read_admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn read_event(env: &Env, event_id: u32) -> Result<EventData, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Event(event_id))
        .ok_or(Error::EventNotFound)
}

fn write_event(env: &Env, event_id: u32, event: &EventData) {
    env.storage()
        .persistent()
        .set(&DataKey::Event(event_id), event);
}

fn read_category(env: &Env, event_id: u32, category_id: u32) -> Result<CategoryData, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Category(event_id, category_id))
        .ok_or(Error::CategoryNotFound)
}

fn write_category(env: &Env, event_id: u32, category_id: u32, category: &CategoryData) {
    env.storage()
        .persistent()
        .set(&DataKey::Category(event_id, category_id), category);
}

fn write_category_count(env: &Env, event_id: u32, count: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::CategoryCount(event_id), &count);
}

/// Loads the event and requires its organiser's authorization. Every mutating
/// organiser entry point goes through here, so authority always comes from
/// stored state and never from a caller-supplied address.
fn auth_organiser(env: &Env, event_id: u32) -> Result<EventData, Error> {
    let event = read_event(env, event_id)?;
    event.organiser.require_auth();
    Ok(event)
}

/// Forward-only lifecycle with an `Open` <-> `Closed` toggle for re-opening
/// registration. `Completed` is terminal and self-transitions are rejected.
fn is_valid_transition(from: EventStatus, to: EventStatus) -> bool {
    matches!(
        (from, to),
        (EventStatus::Draft, EventStatus::Open)
            | (EventStatus::Draft, EventStatus::Closed)
            | (EventStatus::Open, EventStatus::Closed)
            | (EventStatus::Open, EventStatus::Completed)
            | (EventStatus::Closed, EventStatus::Open)
            | (EventStatus::Closed, EventStatus::Completed)
    )
}

mod test;
