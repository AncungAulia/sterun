//! Cross-contract handle on EventRegistry (C1, STE-5).
//!
//! ## Why this is a hand-written mirror and not `use event_registry::...`
//!
//! The obvious thing — a plain path dependency on the `event_registry` crate,
//! reusing its generated `EventRegistryClient` — **does not work**. Both crates
//! are `crate-type = ["lib", "cdylib"]`, and `#[contractimpl]` emits
//! `#[cfg_attr(target_family = "wasm", export_name = "…")]` on every entry
//! point. Linking `event_registry`'s rlib into `race_record`'s cdylib pulls
//! those symbols in, and the wasm link fails outright:
//!
//! ```text
//! warning: Linking globals named '__constructor': symbol multiply defined!
//! error: failed to load bitcode of module "event_registry.…-cgu.0.rcgu.o"
//! ```
//!
//! Even if the two `__constructor`s had not collided, the rest of
//! EventRegistry's surface (`create_event`, `reserve_slot`, …) would have been
//! exported from `race_record.wasm`, which is exactly what STE-9 forbids.
//!
//! So RaceRecord declares its own client from a local trait: `#[contractclient]`
//! generates *only* a client struct — no `export_name`, no `contractspecv0`
//! function entries — and `event_registry` stays a **dev-dependency**, used by
//! the tests to register a real registry instance in the same `Env`.
//!
//! ## Keeping the mirror honest
//!
//! A `#[contracttype]` struct is encoded as an `ScMap` keyed by **field name**;
//! the struct's Rust name never appears on the wire, but the field set must
//! match exactly or decoding fails. [`CategoryData`] below therefore repeats
//! EventRegistry's field names and order verbatim. The test
//! `mirrored_category_data_decodes_the_registrys_own_struct` round-trips a
//! value produced by the real registry through this type, so any drift in C1
//! breaks the build's test run rather than production.

use soroban_sdk::{contractclient, contracttype, Address, Env, Symbol};

/// Mirror of `event_registry::CategoryData`. Field names and order must stay
/// identical — see the module docs.
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

/// The four EventRegistry entry points RaceRecord needs — and nothing else.
///
/// Return types are the plain success types rather than `Result<_, _>`: a
/// revert inside the registry (`QuotaFull`, `EventNotOpen`, `EventNotFound`, …)
/// then propagates out of RaceRecord's own invocation untouched, which is what
/// makes `enter` atomic.
#[contractclient(name = "EventRegistryClient")]
pub trait EventRegistry {
    fn reserve_slot(env: Env, event_id: u32, category_id: u32) -> u32;
    fn get_category(env: Env, event_id: u32, category_id: u32) -> CategoryData;
    fn get_organiser(env: Env, event_id: u32) -> Address;
    fn is_scanner(env: Env, event_id: u32, addr: Address) -> bool;
}
