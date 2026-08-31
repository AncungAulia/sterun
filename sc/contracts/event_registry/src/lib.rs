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

mod test;
