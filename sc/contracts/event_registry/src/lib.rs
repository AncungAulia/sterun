#![no_std]
//! # EventRegistry (Sterun component C1)
//!
//! Organiser-facing registry for running events. One deployed instance serves
//! every event: it stores the event itself, its distance categories (quota,
//! price, bib sequence) and who may act for the event (organiser + scanner
//! devices).
//!
//! See `docs/SYSTEM_DESIGN.md` section 3.1 for the authoritative design.
//!
//! ## v2 — upgradeable
//!
//! Unlike v1 (deployed 2026-09-04, permanently frozen at its address), this
//! contract carries [`EventRegistry::upgrade`]: the admin can replace the
//! contract's own wasm in place with `update_current_contract_wasm`. Soroban
//! upgrades are protocol-level bytecode replacement — no proxy, no
//! `delegatecall`, and storage stays where it is and is simply reinterpreted by
//! the new code.
//!
//! That last part is the whole risk, so it is a hard rule here: **storage keys
//! are append-only, forever**. Never remove a [`DataKey`] variant, never rename
//! one, never change the type stored under one. A `#[contracttype]` enum is
//! encoded as a vector whose first element is the *variant name*, so adding
//! variants is safe and renaming one silently orphans every entry written under
//! the old name.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String, Symbol,
};

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

/// Lifecycle of an event. `Draft` -> `Open` -> `Closed` -> `Completed`, with
/// `Closed` <-> `Open` allowed so an organiser can re-open registration.
/// `Completed` is terminal.
///
/// `Cancelled` (v2) is reachable from every non-terminal state and is itself
/// terminal. It is **not** the same thing as `Closed`: `Closed` means
/// registration is shut but the race is still happening, and the organiser can
/// re-open it. `Cancelled` means the race is off. Nothing on-chain refunds
/// anybody — refunds stay an off-chain promise (`docs/SYSTEM_DESIGN.md` §11) —
/// so the value of this status is that the chain, not a website banner, is
/// where "this race is not happening" is recorded.
///
/// The variant is appended last on purpose. A `#[contracttype]` enum travels as
/// its variant *name*, so every `EventData` already written keeps decoding.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventStatus {
    Draft,
    Open,
    Closed,
    Completed,
    Cancelled,
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

/// One paid extra an entrant can buy alongside their category — a jersey, a
/// tumbler, a bus seat (STE-35). Add-ons are per event and priced independently
/// of the category, and `quota` is enforced the same way a category's is: an
/// organiser who has 200 jerseys sells 200, not 201.
///
/// `reserved_count` counts units taken. It is bumped by
/// [`EventRegistry::reserve_addon`] and never goes down — cancelling a race
/// does not un-sell its jerseys, because the refund is an off-chain promise.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AddOnData {
    pub code: Symbol,
    /// 7-decimal token representation (sUSD on testnet, USDC on mainnet).
    pub price_usdc: i128,
    pub quota: u32,
    pub reserved_count: u32,
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
    /// persistent -> [`AddOnData`], keyed by `(event_id, addon_id)` (v2)
    AddOn(u32, u32),
    /// persistent -> `u32`, keyed by `event_id` (v2)
    AddOnCount(u32),
    /// persistent -> `bool`, keyed by the organiser address (v2.1)
    ///
    /// Appended last, like every variant before it. This one landed on a
    /// contract that was already live and already holding events, so the
    /// append-only rule stopped being advice here and started being the reason
    /// `event_id` 0 still decodes.
    Organiser(Address),
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
    /// `(event_id, addon_id)` is not a known add-on (v2).
    AddOnNotFound = 14,
    /// `reserved_count >= quota` on an add-on (v2).
    AddOnQuotaFull = 15,
    /// The address is already on the organiser allowlist (v2.1).
    OrganiserAlreadyAdded = 16,
    /// `remove_organiser` on an address that is not on the allowlist (v2.1).
    OrganiserNotFound = 17,
    /// `create_event` from an address the admin never allowlisted (v2.1).
    NotAllowlistedOrganiser = 18,
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
pub struct AddOnAdded {
    #[topic]
    pub event_id: u32,
    pub addon_id: u32,
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

/// Emitted when the admin puts an address on the organiser allowlist (v2.1).
/// There is no `event_id` here on purpose: the allowlist is contract-wide, and
/// it is granted before the grantee has any event to name.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrganiserAdded {
    #[topic]
    pub organiser: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrganiserRemoved {
    #[topic]
    pub organiser: Address,
}

/// Emitted by [`EventRegistry::upgrade`]. An indexer that has to explain why a
/// contract's behaviour changed under a stable address needs the ledger to say
/// so; this is that record.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    #[topic]
    pub new_wasm_hash: BytesN<32>,
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

/// One unit of an add-on taken. `seq` is that unit's 0-based number, which is
/// what turns "200 jerseys sold" into "jersey 37" for a fulfilment desk, and
/// `price` is the amount [`EventRegistry::reserve_addon`] told RaceRecord to
/// charge for it — recording it here means the ledger shows the price that was
/// actually applied, not the price the add-on happens to carry today.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AddOnReserved {
    #[topic]
    pub event_id: u32,
    #[topic]
    pub addon_id: u32,
    pub seq: u32,
    pub price: i128,
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
        bump_instance(&env);
    }

    /// One-shot wiring of the RaceRecord contract address, done by the admin
    /// once both contracts are deployed. A second call is rejected so the
    /// trusted caller of [`Self::reserve_slot`] can never be swapped out.
    pub fn set_race_record(env: Env, race_record: Address) -> Result<(), Error> {
        read_admin(&env)?.require_auth();
        bump_instance(&env);
        if env.storage().instance().has(&DataKey::RaceRecordAddr) {
            return Err(Error::RaceRecordAlreadySet);
        }
        env.storage()
            .instance()
            .set(&DataKey::RaceRecordAddr, &race_record);
        Ok(())
    }

    // -- upgrade -------------------------------------------------------------

    /// Replaces this contract's own wasm. **Admin only.**
    ///
    /// Soroban upgrades are protocol-level: the executable is swapped in place
    /// and the contract keeps its address, its storage and its balances. There
    /// is no proxy and no `delegatecall`, so there is also no storage-slot
    /// aliasing to get wrong — but the new code does reinterpret the *existing*
    /// entries, which is why [`DataKey`] is append-only forever (see the module
    /// docs).
    ///
    /// Two consequences worth knowing before calling this:
    ///
    /// * The swap takes effect **after** this invocation finishes, so the new
    ///   code cannot run in the same transaction. A migration therefore needs a
    ///   second call.
    /// * `new_wasm_hash` must already be uploaded to the ledger, and nothing
    ///   checks that it is a *Sterun* contract, or that it kept an `upgrade`
    ///   function of its own. Upgrading to a wasm without one ends
    ///   upgradeability permanently.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        read_admin(&env)?.require_auth();
        bump_instance(&env);
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());

        ContractUpgraded { new_wasm_hash }.publish(&env);
        Ok(())
    }

    // -- admin: the organiser allowlist (v2.1) -------------------------------

    /// Puts `organiser` on the allowlist, which is what [`Self::create_event`]
    /// checks. **Admin only.**
    ///
    /// The allowlist exists because `create_event` takes the event's `name` as
    /// a free `String`. `organiser.require_auth()` proves the caller controls
    /// that keypair and nothing more — it cannot say whether the keypair
    /// belongs to the race it just named itself after. Anyone could create
    /// "Jakarta Marathon 2026" and start selling entries to it. The allowlist
    /// is the missing half: a keypair the admin has actually vetted off-chain.
    ///
    /// Access is granted per address, not per event, and the grant is what an
    /// organiser gets *before* they have an event. Per-event authority stays
    /// where it already lives — in `EventData.organiser`.
    pub fn add_organiser(env: Env, organiser: Address) -> Result<(), Error> {
        read_admin(&env)?.require_auth();
        bump_instance(&env);
        let key = DataKey::Organiser(organiser.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::OrganiserAlreadyAdded);
        }

        env.storage().persistent().set(&key, &true);
        bump_persistent(&env, &key);

        OrganiserAdded { organiser }.publish(&env);
        Ok(())
    }

    /// Revokes an organiser. **Admin only.**
    ///
    /// Like [`Self::remove_scanner`], the entry is removed rather than set to
    /// `false`, so the contract stops paying rent for a revoked address.
    ///
    /// Revoking is forward-looking only: events the address already created
    /// keep their organiser, and it keeps every per-event power over them
    /// (`add_category`, `set_event_status`, the scanner allowlist, and
    /// `record_finish` over in RaceRecord). What it loses is the ability to
    /// create *new* events. Taking a running race away from the organiser
    /// mid-event would strand its entrants, and a race whose entries are
    /// already sold cannot be un-run by a storage write.
    pub fn remove_organiser(env: Env, organiser: Address) -> Result<(), Error> {
        read_admin(&env)?.require_auth();
        bump_instance(&env);
        let key = DataKey::Organiser(organiser.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::OrganiserNotFound);
        }

        env.storage().persistent().remove(&key);

        OrganiserRemoved { organiser }.publish(&env);
        Ok(())
    }

    // -- organiser surface ---------------------------------------------------

    /// Creates an event owned by `organiser`. Ids are assigned from a
    /// monotonic counter and never reused. The event starts in
    /// [`EventStatus::Draft`] so categories can be added before registration
    /// opens.
    ///
    /// **Two gates, and they answer different questions** (v2.1).
    /// `organiser.require_auth()` answers "does the caller hold this keypair";
    /// the allowlist check answers "is this keypair one the admin vetted".
    /// Without the second, `name` is an unchecked `String` and the first gate
    /// happily lets a stranger sign for their own address while calling their
    /// event "Jakarta Marathon 2026". Hence
    /// [`Error::NotAllowlistedOrganiser`] — see [`Self::add_organiser`].
    ///
    /// The auth check runs first so a caller who does not hold the key learns
    /// nothing about who is on the allowlist.
    pub fn create_event(
        env: Env,
        organiser: Address,
        name: String,
        metadata_hash: BytesN<32>,
        uri: String,
        starts_at: u64,
    ) -> Result<u32, Error> {
        organiser.require_auth();
        bump_instance(&env);
        if !is_allowlisted(&env, &organiser) {
            return Err(Error::NotAllowlistedOrganiser);
        }

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
        bump_instance(&env);
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

    /// Adds a paid add-on to an event (STE-35). Add-on ids restart at 0 for
    /// every event, exactly like category ids.
    ///
    /// The validation mirrors [`Self::add_category`] and reuses its error codes
    /// on purpose: `quota == 0` is [`Error::InvalidQuota`] and a negative price
    /// is [`Error::InvalidPrice`] whether the thing priced is a distance or a
    /// jersey. A free add-on (`price_usdc == 0`) is legal — a race can hand out
    /// a bib belt to whoever asks for one and still cap how many it hands out.
    pub fn add_addon(
        env: Env,
        event_id: u32,
        code: Symbol,
        price_usdc: i128,
        quota: u32,
    ) -> Result<u32, Error> {
        bump_instance(&env);
        auth_organiser(&env, event_id)?;
        if quota == 0 {
            return Err(Error::InvalidQuota);
        }
        if price_usdc < 0 {
            return Err(Error::InvalidPrice);
        }

        let addon_id = Self::addon_count(env.clone(), event_id);
        write_addon(
            &env,
            event_id,
            addon_id,
            &AddOnData {
                code,
                price_usdc,
                quota,
                reserved_count: 0,
            },
        );
        write_addon_count(&env, event_id, addon_id + 1);

        AddOnAdded {
            event_id,
            addon_id,
            quota,
            price: price_usdc,
        }
        .publish(&env);
        Ok(addon_id)
    }

    /// Moves the event through its lifecycle. Only forward moves are legal,
    /// plus the `Open` <-> `Closed` toggle; `Completed` and `Cancelled` are
    /// terminal and a no-op transition is rejected so no misleading event is
    /// emitted.
    ///
    /// Cancelling stops entries by itself: [`Self::reserve_slot`] and
    /// [`Self::reserve_addon`] both require `Open`, so a cancelled event
    /// rejects every new entry with [`Error::EventNotOpen`] without needing a
    /// guard of its own.
    pub fn set_event_status(env: Env, event_id: u32, status: EventStatus) -> Result<(), Error> {
        bump_instance(&env);
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
        bump_instance(&env);
        auth_organiser(&env, event_id)?;
        let key = DataKey::Scanner(event_id, scanner.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::ScannerAlreadyAdded);
        }

        env.storage().persistent().set(&key, &true);
        bump_persistent(&env, &key);

        ScannerAdded { event_id, scanner }.publish(&env);
        Ok(())
    }

    /// Revokes a volunteer device. The entry is removed rather than set to
    /// `false` so the organiser stops paying rent for it.
    pub fn remove_scanner(env: Env, event_id: u32, scanner: Address) -> Result<(), Error> {
        bump_instance(&env);
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
        bump_instance(&env);

        let event = read_event(&env, event_id)?;
        // Categories are worthless if their event archives — refresh both.
        bump_persistent(&env, &DataKey::Event(event_id));
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

    /// Takes one unit of an add-on and returns **the price to charge for it**.
    ///
    /// Same gate as [`Self::reserve_slot`]: only the wired RaceRecord contract
    /// can call this, by invoker-contract authorization. An entrant cannot
    /// reserve a jersey without paying for it, because the only code path that
    /// reaches here is `RaceRecord.enter`, which charges what this returns
    /// inside the same invocation.
    ///
    /// **Why it returns the price instead of a sequence number.** The caller
    /// needs the price, and reading it separately would mean a second
    /// cross-contract call against state that could, in principle, be a
    /// different value by then. Returning it from the reserving call makes the
    /// amount charged and the unit reserved the same read. The sequence number
    /// is still published on [`AddOnReserved`] for anyone fulfilling the order.
    ///
    /// The quota check and the increment happen in this one invocation, so the
    /// last jersey cannot be sold twice: the second entry reads the
    /// already-incremented `reserved_count` and reverts with
    /// [`Error::AddOnQuotaFull`].
    pub fn reserve_addon(env: Env, event_id: u32, addon_id: u32) -> Result<i128, Error> {
        let race_record: Address = env
            .storage()
            .instance()
            .get(&DataKey::RaceRecordAddr)
            .ok_or(Error::RaceRecordNotSet)?;
        race_record.require_auth();
        bump_instance(&env);

        let event = read_event(&env, event_id)?;
        bump_persistent(&env, &DataKey::Event(event_id));
        // Redundant in the `enter` path, where `reserve_slot` has already
        // checked it — and deliberately kept, because this is an entry point of
        // its own and its guarantees should not depend on the order a caller
        // happens to use.
        if event.status != EventStatus::Open {
            return Err(Error::EventNotOpen);
        }

        let mut addon = read_addon(&env, event_id, addon_id)?;
        if addon.reserved_count >= addon.quota {
            return Err(Error::AddOnQuotaFull);
        }

        let seq = addon.reserved_count;
        // Bounded by the guard above: `reserved_count < quota <= u32::MAX`.
        addon.reserved_count = seq + 1;
        let price = addon.price_usdc;
        write_addon(&env, event_id, addon_id, &addon);

        AddOnReserved {
            event_id,
            addon_id,
            seq,
            price,
        }
        .publish(&env);
        Ok(price)
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

    /// `false` when the address was never allowlisted, or was removed (v2.1).
    ///
    /// This is the read a console uses to decide whether to show the "create
    /// event" form at all. It is not the enforcement — [`Self::create_event`]
    /// is — so a client that skips it gets a revert, not an event.
    pub fn is_organiser(env: Env, addr: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Organiser(addr))
            .unwrap_or(false)
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

    pub fn get_addon(env: Env, event_id: u32, addon_id: u32) -> Result<AddOnData, Error> {
        read_addon(&env, event_id, addon_id)
    }

    /// How many add-ons this event has. Also the exclusive upper bound on a
    /// valid `addon_id`, which is what bounds the loop in `RaceRecord.enter`.
    pub fn addon_count(env: Env, event_id: u32) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::AddOnCount(event_id))
            .unwrap_or(0)
    }
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported — they live outside the `#[contractimpl]`).
// ---------------------------------------------------------------------------

/// Keeps the contract instance (admin, race-record wiring, event counter) and
/// everything stored inside it alive. Called at the top of every mutating
/// entry point — active users pay rent for the state they touch.
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

fn read_admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

/// The organiser allowlist read, as `create_event` uses it. A missing entry is
/// `false`, which is what makes the allowlist empty — and `create_event`
/// closed — the instant this code is upgraded into a contract that never had
/// one.
fn is_allowlisted(env: &Env, organiser: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Organiser(organiser.clone()))
        .unwrap_or(false)
}

fn read_event(env: &Env, event_id: u32) -> Result<EventData, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Event(event_id))
        .ok_or(Error::EventNotFound)
}

fn write_event(env: &Env, event_id: u32, event: &EventData) {
    let key = DataKey::Event(event_id);
    env.storage().persistent().set(&key, event);
    bump_persistent(env, &key);
}

fn read_category(env: &Env, event_id: u32, category_id: u32) -> Result<CategoryData, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Category(event_id, category_id))
        .ok_or(Error::CategoryNotFound)
}

fn write_category(env: &Env, event_id: u32, category_id: u32, category: &CategoryData) {
    let key = DataKey::Category(event_id, category_id);
    env.storage().persistent().set(&key, category);
    bump_persistent(env, &key);
}

fn read_addon(env: &Env, event_id: u32, addon_id: u32) -> Result<AddOnData, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::AddOn(event_id, addon_id))
        .ok_or(Error::AddOnNotFound)
}

fn write_addon(env: &Env, event_id: u32, addon_id: u32, addon: &AddOnData) {
    let key = DataKey::AddOn(event_id, addon_id);
    env.storage().persistent().set(&key, addon);
    bump_persistent(env, &key);
}

fn write_addon_count(env: &Env, event_id: u32, count: u32) {
    let key = DataKey::AddOnCount(event_id);
    env.storage().persistent().set(&key, &count);
    bump_persistent(env, &key);
}

fn write_category_count(env: &Env, event_id: u32, count: u32) {
    let key = DataKey::CategoryCount(event_id);
    env.storage().persistent().set(&key, &count);
    bump_persistent(env, &key);
}

/// Loads the event and requires its organiser's authorization. Every mutating
/// organiser entry point goes through here, so authority always comes from
/// stored state and never from a caller-supplied address.
fn auth_organiser(env: &Env, event_id: u32) -> Result<EventData, Error> {
    let event = read_event(env, event_id)?;
    event.organiser.require_auth();
    // The event entry is touched by every organiser mutation, so refresh it
    // even when only a category or scanner entry is written.
    bump_persistent(env, &DataKey::Event(event_id));
    Ok(event)
}

/// Forward-only lifecycle with an `Open` <-> `Closed` toggle for re-opening
/// registration. `Completed` and `Cancelled` are terminal and self-transitions
/// are rejected.
///
/// Cancelling is legal from every non-terminal state, including `Draft`: an
/// event can be called off before it ever opened. It is deliberately NOT legal
/// from `Completed` — a race that was run and had results published did happen,
/// and rewriting that is falsifying history, not fixing a typo.
fn is_valid_transition(from: EventStatus, to: EventStatus) -> bool {
    matches!(
        (from, to),
        (EventStatus::Draft, EventStatus::Open)
            | (EventStatus::Draft, EventStatus::Closed)
            | (EventStatus::Draft, EventStatus::Cancelled)
            | (EventStatus::Open, EventStatus::Closed)
            | (EventStatus::Open, EventStatus::Completed)
            | (EventStatus::Open, EventStatus::Cancelled)
            | (EventStatus::Closed, EventStatus::Open)
            | (EventStatus::Closed, EventStatus::Completed)
            | (EventStatus::Closed, EventStatus::Cancelled)
    )
}

mod test;
