#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke,
    },
    Address, BytesN, Env, Event as _, IntoVal, InvokeError, String, Symbol,
};

use crate::{
    AddOnAdded, AddOnData, AddOnReserved, CategoryAdded, CategoryData, DataKey, Error,
    EventCreated, EventData, EventRegistry, EventRegistryClient, EventStatus, EventStatusChanged,
    QuotaIncreased, ScannerAdded, ScannerRemoved, SlotReserved, BUMP_THRESHOLD, BUMP_TO,
    DAY_IN_LEDGERS,
};

// ---------------------------------------------------------------------------
// Test double: stands in for the RaceRecord contract (C2, STE-9).
//
// It exists to prove the `reserve_slot` gate from *both* sides: a real
// cross-contract caller is accepted, and (see the EOA test) a plain account is
// not. It is registered in the same `Env` and wired via `set_race_record`.
// ---------------------------------------------------------------------------

#[contract]
pub struct MockRaceRecord;

#[contractimpl]
impl MockRaceRecord {
    /// Single reservation. Declaring the registry's error type means a revert
    /// from `reserve_slot` comes back through `try_reserve` as that same typed
    /// error rather than an opaque host failure.
    pub fn reserve(
        env: Env,
        registry: Address,
        event_id: u32,
        category_id: u32,
    ) -> Result<u32, crate::Error> {
        Ok(EventRegistryClient::new(&env, &registry).reserve_slot(&event_id, &category_id))
    }

    /// Single add-on reservation. Returns the price the registry says to
    /// charge, which is what `RaceRecord.enter` bills the runner.
    pub fn reserve_addon(
        env: Env,
        registry: Address,
        event_id: u32,
        addon_id: u32,
    ) -> Result<i128, crate::Error> {
        Ok(EventRegistryClient::new(&env, &registry).reserve_addon(&event_id, &addon_id))
    }

    /// Two entries racing for the last unit of the same add-on inside ONE
    /// invocation. Returns `(first_succeeded, second_succeeded)`.
    pub fn race_addon(env: Env, registry: Address, event_id: u32, addon_id: u32) -> (bool, bool) {
        let client = EventRegistryClient::new(&env, &registry);
        let first = client.try_reserve_addon(&event_id, &addon_id).is_ok();
        let second = client.try_reserve_addon(&event_id, &addon_id).is_ok();
        (first, second)
    }

    /// Two entries racing for the same category inside ONE invocation.
    /// Returns `(first_succeeded, second_succeeded)`.
    pub fn race(env: Env, registry: Address, event_id: u32, category_id: u32) -> (bool, bool) {
        let client = EventRegistryClient::new(&env, &registry);
        let first = client.try_reserve_slot(&event_id, &category_id).is_ok();
        let second = client.try_reserve_slot(&event_id, &category_id).is_ok();
        (first, second)
    }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STARTS_AT: u64 = 1_772_000_000;

fn hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

fn name(env: &Env) -> String {
    String::from_str(env, "Jakarta Night Run 2026")
}

fn uri(env: &Env) -> String {
    String::from_str(env, "ipfs://bafyjakartanightrun")
}

/// Deploys the registry and returns `(admin, registry_address)`.
fn deploy(env: &Env) -> (Address, Address) {
    let admin = Address::generate(env);
    let registry = env.register(EventRegistry, (admin.clone(),));
    (admin, registry)
}

/// Puts `organiser` on the admin's allowlist, which `create_event` requires
/// since v2.1. Idempotent, because a second `add_organiser` for the same
/// address reverts `OrganiserAlreadyAdded(16)` and fixtures should not have to
/// track who they already allowlisted.
fn allowlist(env: &Env, client: &EventRegistryClient, organiser: &Address) {
    env.mock_all_auths();
    if !client.is_organiser(organiser) {
        client.add_organiser(organiser);
    }
}

/// Allowlists `organiser` and creates one event owned by them. Every test that
/// wants an event as a *precondition* goes through here: the allowlist gate is
/// what `create_event` tests exercise on purpose, and everything else would
/// otherwise be testing the gate by accident.
fn create_event(env: &Env, client: &EventRegistryClient, organiser: &Address) -> u32 {
    allowlist(env, client, organiser);
    env.mock_all_auths();
    client.create_event(organiser, &name(env), &hash(env), &uri(env), &STARTS_AT)
}

/// Creates an event owned by `organiser` with one category, moves it to
/// `Open`, and returns `(event_id, category_id)`. Uses `mock_all_auths`
/// because the auth model is not what these callers are testing.
fn open_event(
    env: &Env,
    client: &EventRegistryClient,
    organiser: &Address,
    quota: u32,
) -> (u32, u32) {
    let event_id = create_event(env, client, organiser);
    env.mock_all_auths();
    let category_id = client.add_category(
        &event_id,
        &symbol_short!("10K"),
        &10_000,
        &quota,
        &50_000_000,
    );
    client.set_event_status(&event_id, &EventStatus::Open);
    (event_id, category_id)
}

/// Registers the mock RaceRecord and wires it into the registry.
fn wire_race_record(env: &Env, client: &EventRegistryClient) -> Address {
    let race_record = env.register(MockRaceRecord, ());
    env.mock_all_auths();
    client.set_race_record(&race_record);
    race_record
}

// ---------------------------------------------------------------------------
// Positive / happy path
// ---------------------------------------------------------------------------

#[test]
fn constructor_stores_admin_and_seeds_counter() {
    let env = Env::default();
    let (admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.event_count(), 0);
    assert_eq!(
        client.try_get_race_record(),
        Err(Ok(crate::Error::RaceRecordNotSet))
    );
}

#[test]
fn set_race_record_by_admin_roundtrips() {
    let env = Env::default();
    let (admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let race_record = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &registry,
            fn_name: "set_race_record",
            args: (race_record.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.set_race_record(&race_record);

    // The admin — not the caller — is the address whose consent was consumed.
    assert_eq!(
        env.auths(),
        std::vec![(
            admin.clone(),
            soroban_sdk::testutils::AuthorizedInvocation {
                function: soroban_sdk::testutils::AuthorizedFunction::Contract((
                    registry.clone(),
                    Symbol::new(&env, "set_race_record"),
                    (race_record.clone(),).into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    assert_eq!(client.get_race_record(), race_record);
}

#[test]
fn create_event_ids_are_monotonic_and_data_roundtrips() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let first = create_event(&env, &client, &organiser);
    let second = create_event(&env, &client, &organiser);

    assert_eq!(first, 0);
    assert_eq!(second, 1);
    assert_eq!(client.event_count(), 2);
    assert_eq!(
        client.get_event(&first),
        EventData {
            organiser: organiser.clone(),
            name: name(&env),
            metadata_hash: hash(&env),
            uri: uri(&env),
            starts_at: STARTS_AT,
            status: EventStatus::Draft,
        }
    );
    assert_eq!(client.get_organiser(&first), organiser);
    assert_eq!(client.category_count(&first), 0);
}

#[test]
fn add_category_ids_are_per_event_and_data_roundtrips() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_a = create_event(&env, &client, &organiser);
    let event_b = create_event(&env, &client, &organiser);

    assert_eq!(
        client.add_category(&event_a, &symbol_short!("5K"), &5_000, &100, &25_000_000),
        0
    );
    assert_eq!(
        client.add_category(&event_a, &symbol_short!("10K"), &10_000, &200, &50_000_000),
        1
    );
    // Category ids restart at 0 for a different event.
    assert_eq!(
        client.add_category(&event_b, &symbol_short!("21K"), &21_097, &50, &75_000_000),
        0
    );

    assert_eq!(client.category_count(&event_a), 2);
    assert_eq!(client.category_count(&event_b), 1);
    assert_eq!(
        client.get_category(&event_a, &1),
        CategoryData {
            code: symbol_short!("10K"),
            distance_m: 10_000,
            quota: 200,
            price_usdc: 50_000_000,
            entered_count: 0,
        }
    );
    assert_eq!(
        client.get_category(&event_b, &0),
        CategoryData {
            code: symbol_short!("21K"),
            distance_m: 21_097,
            quota: 50,
            price_usdc: 75_000_000,
            entered_count: 0,
        }
    );
}

#[test]
fn set_event_status_walks_the_lifecycle() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);
    assert_eq!(client.get_event(&event_id).status, EventStatus::Draft);

    for status in [
        EventStatus::Open,
        EventStatus::Closed,
        EventStatus::Completed,
    ] {
        client.set_event_status(&event_id, &status);
        assert_eq!(client.get_event(&event_id).status, status);
    }
}

#[test]
fn scanner_allowlist_add_then_remove() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let scanner = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);
    assert!(!client.is_scanner(&event_id, &scanner));

    client.add_scanner(&event_id, &scanner);
    assert!(client.is_scanner(&event_id, &scanner));

    client.remove_scanner(&event_id, &scanner);
    assert!(!client.is_scanner(&event_id, &scanner));
}

#[test]
fn reserve_slot_from_caller_contract_hands_out_sequential_bibs() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 3);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    // Bibs count from 1; the category's quota counter counts the same slots.
    for nth in 1..=3u32 {
        assert_eq!(caller.reserve(&registry, &event_id, &category_id), nth);
        assert_eq!(
            client.get_category(&event_id, &category_id).entered_count,
            nth
        );
    }
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

#[test]
fn emits_event_created() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    assert_eq!(
        env.events().all(),
        std::vec![EventCreated {
            event_id,
            organiser: organiser.clone(),
        }
        .to_xdr(&env, &registry)]
    );
}

#[test]
fn emits_category_added() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);
    let category_id =
        client.add_category(&event_id, &symbol_short!("10K"), &10_000, &200, &50_000_000);

    assert_eq!(
        env.events().all(),
        std::vec![CategoryAdded {
            event_id,
            category_id,
            quota: 200,
            price: 50_000_000,
        }
        .to_xdr(&env, &registry)]
    );
}

#[test]
fn emits_event_status_changed() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);
    client.set_event_status(&event_id, &EventStatus::Open);

    assert_eq!(
        env.events().all(),
        std::vec![EventStatusChanged {
            event_id,
            status: EventStatus::Open,
        }
        .to_xdr(&env, &registry)]
    );
}

#[test]
fn emits_scanner_added_and_removed() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let scanner = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    client.add_scanner(&event_id, &scanner);
    assert_eq!(
        env.events().all(),
        std::vec![ScannerAdded {
            event_id,
            scanner: scanner.clone(),
        }
        .to_xdr(&env, &registry)]
    );

    client.remove_scanner(&event_id, &scanner);
    assert_eq!(
        env.events().all(),
        std::vec![ScannerRemoved {
            event_id,
            scanner: scanner.clone(),
        }
        .to_xdr(&env, &registry)]
    );
}

#[test]
fn emits_slot_reserved() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 2);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    caller.reserve(&registry, &event_id, &category_id);

    assert_eq!(
        env.events().all(),
        std::vec![SlotReserved {
            event_id,
            category_id,
            seq: 1,
        }
        .to_xdr(&env, &registry)]
    );
}

// ---------------------------------------------------------------------------
// Negative / revert paths
// ---------------------------------------------------------------------------

#[test]
fn set_race_record_is_one_shot() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    env.mock_all_auths();

    let first = Address::generate(&env);
    let second = Address::generate(&env);
    client.set_race_record(&first);

    assert_eq!(
        client.try_set_race_record(&second),
        Err(Ok(Error::RaceRecordAlreadySet))
    );
    assert_eq!(client.get_race_record(), first);
}

#[test]
fn set_race_record_requires_admin_auth() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let impostor = Address::generate(&env);
    let race_record = Address::generate(&env);

    // The impostor signs for itself; the contract requires the *stored* admin.
    env.mock_auths(&[MockAuth {
        address: &impostor,
        invoke: &MockAuthInvoke {
            contract: &registry,
            fn_name: "set_race_record",
            args: (race_record.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    assert_eq!(
        client.try_set_race_record(&race_record),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(
        client.try_get_race_record(),
        Err(Ok(Error::RaceRecordNotSet))
    );
}

/// Every organiser-only entry point must reject a signature from someone who
/// is not the stored organiser of that event.
#[test]
fn organiser_only_calls_reject_a_foreign_signer() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let impostor = Address::generate(&env);
    let scanner = Address::generate(&env);

    env.mock_all_auths();
    let event_id = create_event(&env, &client, &organiser);
    client.add_scanner(&event_id, &scanner);

    macro_rules! signed_by_impostor {
        ($fn_name:literal, $args:expr) => {
            env.mock_auths(&[MockAuth {
                address: &impostor,
                invoke: &MockAuthInvoke {
                    contract: &registry,
                    fn_name: $fn_name,
                    args: $args,
                    sub_invokes: &[],
                },
            }]);
        };
    }

    signed_by_impostor!(
        "add_category",
        (event_id, symbol_short!("5K"), 5_000u32, 100u32, 0i128).into_val(&env)
    );
    assert_eq!(
        client.try_add_category(&event_id, &symbol_short!("5K"), &5_000, &100, &0),
        Err(Err(InvokeError::Abort))
    );

    signed_by_impostor!(
        "set_event_status",
        (event_id, EventStatus::Open).into_val(&env)
    );
    assert_eq!(
        client.try_set_event_status(&event_id, &EventStatus::Open),
        Err(Err(InvokeError::Abort))
    );

    let outsider = Address::generate(&env);
    signed_by_impostor!("add_scanner", (event_id, outsider.clone()).into_val(&env));
    assert_eq!(
        client.try_add_scanner(&event_id, &outsider),
        Err(Err(InvokeError::Abort))
    );

    signed_by_impostor!("remove_scanner", (event_id, scanner.clone()).into_val(&env));
    assert_eq!(
        client.try_remove_scanner(&event_id, &scanner),
        Err(Err(InvokeError::Abort))
    );

    // Nothing changed.
    assert_eq!(client.category_count(&event_id), 0);
    assert_eq!(client.get_event(&event_id).status, EventStatus::Draft);
    assert!(client.is_scanner(&event_id, &scanner));
    assert!(!client.is_scanner(&event_id, &outsider));
}

/// The other half of the invoker-contract gate: a plain account calling
/// `reserve_slot` directly cannot satisfy the RaceRecord *contract* address.
///
/// Do NOT "fix" this test with `mock_all_auths()`. That switches the host into
/// recording auth mode, where a `require_auth` in the root frame is mocked for
/// *any* address, contract addresses included — it would mask the gate instead
/// of testing it. Enforcing mode with no auth entries is what the network does.
#[test]
fn reserve_slot_rejects_a_direct_eoa_call() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
    wire_race_record(&env, &client);

    env.mock_auths(&[]);
    assert_eq!(
        client.try_reserve_slot(&event_id, &category_id),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(
        client.get_category(&event_id, &category_id).entered_count,
        0
    );
}

/// Locks in *why* the test above must not use `mock_all_auths()`.
///
/// `mock_all_auths()` switches the host to recording auth mode, where a
/// `require_auth` in the root frame is satisfied for any address — a contract
/// address included, even though on a real network that address could only
/// authorize by being the direct caller or by implementing `__check_auth`.
/// So under `mock_all_auths()` the EOA call *succeeds*. That is a harness
/// artifact, not contract behaviour; assert the gate in enforcing mode.
#[test]
fn mock_all_auths_masks_the_invoker_gate_harness_caveat() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
    wire_race_record(&env, &client);

    env.mock_all_auths();
    assert_eq!(
        client.try_reserve_slot(&event_id, &category_id),
        Ok(Ok(1)),
        "recording auth mode mocks contract-address auth in the root frame"
    );
}

#[test]
fn reserve_slot_before_wiring_reverts() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);

    // Registered but never wired via `set_race_record`.
    let race_record = env.register(MockRaceRecord, ());
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::RaceRecordNotSet))
    );
}

#[test]
fn reserve_slot_requires_status_open() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);
    let category_id = client.add_category(&event_id, &symbol_short!("10K"), &10_000, &10, &0);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    // Draft
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::EventNotOpen))
    );

    env.mock_all_auths();
    client.set_event_status(&event_id, &EventStatus::Open);
    client.set_event_status(&event_id, &EventStatus::Closed);
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::EventNotOpen))
    );

    env.mock_all_auths();
    client.set_event_status(&event_id, &EventStatus::Completed);
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::EventNotOpen))
    );

    assert_eq!(
        client.get_category(&event_id, &category_id).entered_count,
        0
    );
}

#[test]
fn reserve_slot_reverts_when_quota_is_full() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 2);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(caller.reserve(&registry, &event_id, &category_id), 1);
    assert_eq!(caller.reserve(&registry, &event_id, &category_id), 2);
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::QuotaFull))
    );
    assert_eq!(
        client.get_category(&event_id, &category_id).entered_count,
        2
    );
}

#[test]
fn reserve_slot_on_unknown_category_reverts() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(
        caller.try_reserve(&registry, &event_id, &99),
        Err(Ok(Error::CategoryNotFound))
    );
    assert_eq!(
        caller.try_reserve(&registry, &404, &0),
        Err(Ok(Error::EventNotFound))
    );
}

#[test]
fn add_category_validates_its_inputs() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    assert_eq!(
        client.try_add_category(&event_id, &symbol_short!("10K"), &10_000, &0, &0),
        Err(Ok(Error::InvalidQuota))
    );
    assert_eq!(
        client.try_add_category(&event_id, &symbol_short!("10K"), &10_000, &10, &-1),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        client.try_add_category(&event_id, &symbol_short!("10K"), &0, &10, &0),
        Err(Ok(Error::InvalidDistance))
    );
    assert_eq!(client.category_count(&event_id), 0);
}

#[test]
fn views_revert_on_unknown_ids() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    assert_eq!(client.try_get_event(&0), Err(Ok(Error::EventNotFound)));
    assert_eq!(client.try_get_organiser(&0), Err(Ok(Error::EventNotFound)));
    assert_eq!(
        client.try_get_category(&0, &0),
        Err(Ok(Error::CategoryNotFound))
    );

    let event_id = create_event(&env, &client, &organiser);
    assert_eq!(
        client.try_get_category(&event_id, &0),
        Err(Ok(Error::CategoryNotFound))
    );
    assert_eq!(client.try_get_event(&99), Err(Ok(Error::EventNotFound)));
    // Views never revert for a missing scanner or count.
    assert!(!client.is_scanner(&99, &organiser));
    assert_eq!(client.category_count(&99), 0);
}

#[test]
fn scanner_allowlist_rejects_duplicate_and_unknown() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let scanner = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    assert_eq!(
        client.try_remove_scanner(&event_id, &scanner),
        Err(Ok(Error::ScannerNotFound))
    );

    client.add_scanner(&event_id, &scanner);
    assert_eq!(
        client.try_add_scanner(&event_id, &scanner),
        Err(Ok(Error::ScannerAlreadyAdded))
    );

    client.remove_scanner(&event_id, &scanner);
    assert_eq!(
        client.try_remove_scanner(&event_id, &scanner),
        Err(Ok(Error::ScannerNotFound))
    );
}

#[test]
fn set_event_status_rejects_illegal_transitions() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    // Draft cannot jump straight to Completed, nor re-enter Draft.
    assert_eq!(
        client.try_set_event_status(&event_id, &EventStatus::Completed),
        Err(Ok(Error::InvalidStatus))
    );
    assert_eq!(
        client.try_set_event_status(&event_id, &EventStatus::Draft),
        Err(Ok(Error::InvalidStatus))
    );

    client.set_event_status(&event_id, &EventStatus::Open);
    // Open -> Open is a no-op and would emit a misleading event.
    assert_eq!(
        client.try_set_event_status(&event_id, &EventStatus::Open),
        Err(Ok(Error::InvalidStatus))
    );
    // Closed re-opens.
    client.set_event_status(&event_id, &EventStatus::Closed);
    client.set_event_status(&event_id, &EventStatus::Open);

    // Completed is terminal — including against Cancelled: a race that was run
    // and had results published did happen.
    client.set_event_status(&event_id, &EventStatus::Completed);
    for status in [
        EventStatus::Draft,
        EventStatus::Open,
        EventStatus::Closed,
        EventStatus::Completed,
        EventStatus::Cancelled,
    ] {
        assert_eq!(
            client.try_set_event_status(&event_id, &status),
            Err(Ok(Error::InvalidStatus))
        );
    }
    assert_eq!(client.get_event(&event_id).status, EventStatus::Completed);
}

/// Cancelling is reachable from each of the three non-terminal states, and is
/// itself terminal.
#[test]
fn an_event_can_be_cancelled_from_every_non_terminal_state() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    for reach in [EventStatus::Draft, EventStatus::Open, EventStatus::Closed] {
        let event_id = create_event(&env, &client, &organiser);
        match reach {
            EventStatus::Draft => {}
            EventStatus::Open => client.set_event_status(&event_id, &EventStatus::Open),
            _ => {
                client.set_event_status(&event_id, &EventStatus::Open);
                client.set_event_status(&event_id, &EventStatus::Closed);
            }
        }
        assert_eq!(client.get_event(&event_id).status, reach);

        client.set_event_status(&event_id, &EventStatus::Cancelled);
        assert_eq!(client.get_event(&event_id).status, EventStatus::Cancelled);

        // Terminal: there is no way back out, not even to Cancelled again.
        for status in [
            EventStatus::Draft,
            EventStatus::Open,
            EventStatus::Closed,
            EventStatus::Completed,
            EventStatus::Cancelled,
        ] {
            assert_eq!(
                client.try_set_event_status(&event_id, &status),
                Err(Ok(Error::InvalidStatus))
            );
        }
    }
}

/// A cancelled event stops taking entries without needing a guard of its own:
/// `reserve_slot` already demands `Open`.
#[test]
fn a_cancelled_event_refuses_new_entries() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    // While Open, an entry lands.
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Ok(Ok(1))
    );

    env.mock_all_auths();
    client.set_event_status(&event_id, &EventStatus::Cancelled);

    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::EventNotOpen))
    );
    // The slot already taken is untouched — cancelling is not a rollback.
    assert_eq!(
        client.get_category(&event_id, &category_id).entered_count,
        1
    );
}

#[test]
fn set_event_status_and_add_category_revert_on_unknown_event() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    env.mock_all_auths();

    assert_eq!(
        client.try_set_event_status(&7, &EventStatus::Open),
        Err(Ok(Error::EventNotFound))
    );
    assert_eq!(
        client.try_add_category(&7, &symbol_short!("5K"), &5_000, &10, &0),
        Err(Ok(Error::EventNotFound))
    );
    let addr = Address::generate(&env);
    assert_eq!(
        client.try_add_scanner(&7, &addr),
        Err(Ok(Error::EventNotFound))
    );
    assert_eq!(
        client.try_remove_scanner(&7, &addr),
        Err(Ok(Error::EventNotFound))
    );
}

// ---------------------------------------------------------------------------
// Edge cases + integration
// ---------------------------------------------------------------------------

/// The last-slot race, proved inside a single invocation of the caller
/// contract: two entries attempt the same `quota == 1` category back to back
/// and exactly one wins. Because `reserve_slot` checks and increments in one
/// invocation, the loser sees the already-incremented `entered_count`.
#[test]
fn exactly_one_entry_wins_the_last_slot() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 1);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(
        caller.race(&registry, &event_id, &category_id),
        (true, false)
    );

    let category = client.get_category(&event_id, &category_id);
    assert_eq!(category.entered_count, 1);
    assert_eq!(category.entered_count, category.quota);

    // And it stays full for every later attempt.
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &category_id),
        Err(Ok(Error::QuotaFull))
    );
}

/// A contract that is not the wired RaceRecord is just as rejected as an EOA:
/// invoker-contract auth only matches the exact stored address.
#[test]
fn an_unwired_contract_cannot_reserve() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
    wire_race_record(&env, &client);

    let impostor_contract = env.register(MockRaceRecord, ());
    let impostor = MockRaceRecordClient::new(&env, &impostor_contract);

    env.mock_auths(&[]);
    assert_eq!(
        impostor.try_reserve(&registry, &event_id, &category_id),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(
        client.get_category(&event_id, &category_id).entered_count,
        0
    );
}

#[test]
fn free_category_and_extreme_values_are_accepted() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    // price 0 — a free category is legal (only negative prices are not).
    let free = client.add_category(&event_id, &symbol_short!("FUN"), &1, &1, &0);
    assert_eq!(client.get_category(&event_id, &free).price_usdc, 0);

    // i128::MAX price and u32::MAX quota / distance.
    let extreme = client.add_category(
        &event_id,
        &symbol_short!("ULTRA"),
        &u32::MAX,
        &u32::MAX,
        &i128::MAX,
    );
    assert_eq!(
        client.get_category(&event_id, &extreme),
        CategoryData {
            code: symbol_short!("ULTRA"),
            distance_m: u32::MAX,
            quota: u32::MAX,
            price_usdc: i128::MAX,
            entered_count: 0,
        }
    );

    // A u32::MAX quota still hands out bibs from 1, and the free category
    // continues the SAME sequence rather than restarting it.
    client.set_event_status(&event_id, &EventStatus::Open);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);
    assert_eq!(caller.reserve(&registry, &event_id, &extreme), 1);
    assert_eq!(caller.reserve(&registry, &event_id, &free), 2);
    // The free category had quota 1.
    assert_eq!(
        caller.try_reserve(&registry, &event_id, &free),
        Err(Ok(Error::QuotaFull))
    );
}

/// Events owned by different organisers are fully isolated: A's signature is
/// worthless against B's event, and quotas/counters do not leak across events.
#[test]
fn events_of_different_organisers_are_isolated() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    env.mock_all_auths();
    let alice_event = create_event(&env, &client, &alice);
    let bob_event = create_event(&env, &client, &bob);
    assert_eq!(client.get_organiser(&alice_event), alice);
    assert_eq!(client.get_organiser(&bob_event), bob);

    // Alice signs a call against Bob's event.
    env.mock_auths(&[MockAuth {
        address: &alice,
        invoke: &MockAuthInvoke {
            contract: &registry,
            fn_name: "set_event_status",
            args: (bob_event, EventStatus::Open).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        client.try_set_event_status(&bob_event, &EventStatus::Open),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(client.get_event(&bob_event).status, EventStatus::Draft);

    // Reserving against Alice's open category does not touch Bob's.
    env.mock_all_auths();
    let alice_cat = client.add_category(&alice_event, &symbol_short!("10K"), &10_000, &5, &0);
    let bob_cat = client.add_category(&bob_event, &symbol_short!("10K"), &10_000, &5, &0);
    client.set_event_status(&alice_event, &EventStatus::Open);

    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);
    caller.reserve(&registry, &alice_event, &alice_cat);

    assert_eq!(
        client.get_category(&alice_event, &alice_cat).entered_count,
        1
    );
    assert_eq!(client.get_category(&bob_event, &bob_cat).entered_count, 0);
    assert_eq!(
        caller.try_reserve(&registry, &bob_event, &bob_cat),
        Err(Ok(Error::EventNotOpen))
    );
}

#[test]
fn scanner_allowlist_is_per_event() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let scanner = Address::generate(&env);
    env.mock_all_auths();

    let first = create_event(&env, &client, &organiser);
    let second = create_event(&env, &client, &organiser);

    client.add_scanner(&first, &scanner);
    assert!(client.is_scanner(&first, &scanner));
    assert!(!client.is_scanner(&second, &scanner));

    // Removing from the other event is a miss, not a silent success.
    assert_eq!(
        client.try_remove_scanner(&second, &scanner),
        Err(Ok(Error::ScannerNotFound))
    );
    assert!(client.is_scanner(&first, &scanner));
}

// ---------------------------------------------------------------------------
// TTL / state archival
// ---------------------------------------------------------------------------

fn persistent_ttl(env: &Env, registry: &Address, key: DataKey) -> u32 {
    env.as_contract(registry, || env.storage().persistent().get_ttl(&key))
}

#[test]
fn writes_extend_persistent_and_instance_ttl() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let scanner = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
    client.add_scanner(&event_id, &scanner);

    for key in [
        DataKey::Event(event_id),
        DataKey::Category(event_id, category_id),
        DataKey::CategoryCount(event_id),
        DataKey::Scanner(event_id, scanner.clone()),
    ] {
        assert_eq!(persistent_ttl(&env, &registry, key), BUMP_TO);
    }
    assert_eq!(
        env.as_contract(&registry, || env.storage().instance().get_ttl()),
        BUMP_TO
    );
}

#[test]
fn a_later_write_re_extends_a_decayed_ttl() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    // Age the ledger past the bump threshold. `extend_ttl` is a no-op above
    // the threshold, so the decay has to cross it for the test to mean
    // anything.
    let aged_by = (BUMP_TO - BUMP_THRESHOLD) + DAY_IN_LEDGERS;
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + aged_by);

    let category_key = DataKey::Category(event_id, category_id);
    let decayed = persistent_ttl(&env, &registry, category_key.clone());
    assert_eq!(decayed, BUMP_TO - aged_by);
    assert!(decayed < BUMP_THRESHOLD);

    // reserve_slot writes the category, so it must top the rent back up — and
    // it refreshes the event entry it read, too.
    caller.reserve(&registry, &event_id, &category_id);

    assert_eq!(persistent_ttl(&env, &registry, category_key), BUMP_TO);
    assert_eq!(
        persistent_ttl(&env, &registry, DataKey::Event(event_id)),
        BUMP_TO
    );
    assert_eq!(
        env.as_contract(&registry, || env.storage().instance().get_ttl()),
        BUMP_TO
    );
}

// ---------------------------------------------------------------------------
// Paid add-ons (v2, STE-35)
// ---------------------------------------------------------------------------

const JERSEY: i128 = 50_000_000; // 5.0 sUSD
const TUMBLER: i128 = 30_000_000; // 3.0 sUSD

/// Adds two add-ons to `event_id` and returns their ids.
fn add_two_addons(env: &Env, client: &EventRegistryClient, event_id: u32) -> (u32, u32) {
    env.mock_all_auths();
    let jersey = client.add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &2);
    let tumbler = client.add_addon(&event_id, &symbol_short!("TUMBLER"), &TUMBLER, &1);
    (jersey, tumbler)
}

#[test]
fn add_addon_ids_are_per_event_and_data_roundtrips() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let first = create_event(&env, &client, &organiser);
    let second = create_event(&env, &client, &organiser);

    assert_eq!(client.addon_count(&first), 0);
    let (jersey, tumbler) = add_two_addons(&env, &client, first);
    assert_eq!((jersey, tumbler), (0, 1));
    assert_eq!(client.addon_count(&first), 2);

    // Ids restart at 0 for the next event, exactly like category ids.
    let other = client.add_addon(&second, &symbol_short!("JERSEY"), &JERSEY, &10);
    assert_eq!(other, 0);
    assert_eq!(client.addon_count(&second), 1);

    assert_eq!(
        client.get_addon(&first, &jersey),
        AddOnData {
            code: symbol_short!("JERSEY"),
            price_usdc: JERSEY,
            quota: 2,
            reserved_count: 0,
        }
    );
}

#[test]
fn add_addon_validates_its_inputs() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    let event_id = create_event(&env, &client, &organiser);

    assert_eq!(
        client.try_add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &0),
        Err(Ok(Error::InvalidQuota))
    );
    assert_eq!(
        client.try_add_addon(&event_id, &symbol_short!("JERSEY"), &-1, &10),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        client.try_add_addon(&7, &symbol_short!("JERSEY"), &JERSEY, &10),
        Err(Ok(Error::EventNotFound))
    );
    // A free add-on with a cap is legal: hand out a bib belt to whoever asks,
    // but only 100 of them.
    let free = client.add_addon(&event_id, &symbol_short!("BIBBELT"), &0, &100);
    assert_eq!(client.get_addon(&event_id, &free).price_usdc, 0);
    // Nothing was written by the rejected calls.
    assert_eq!(client.addon_count(&event_id), 1);
}

#[test]
fn add_addon_rejects_a_foreign_signer() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let impostor = Address::generate(&env);

    env.mock_all_auths();
    let event_id = create_event(&env, &client, &organiser);

    env.mock_auths(&[MockAuth {
        address: &impostor,
        invoke: &MockAuthInvoke {
            contract: &registry,
            fn_name: "add_addon",
            args: (event_id, symbol_short!("JERSEY"), JERSEY, 10u32).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    assert_eq!(
        client.try_add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &10),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(client.addon_count(&event_id), 0);
}

#[test]
fn reserve_addon_returns_the_price_and_counts_units() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (jersey, tumbler) = add_two_addons(&env, &client, event_id);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(caller.reserve_addon(&registry, &event_id, &jersey), JERSEY);
    assert_eq!(
        caller.reserve_addon(&registry, &event_id, &tumbler),
        TUMBLER
    );
    assert_eq!(caller.reserve_addon(&registry, &event_id, &jersey), JERSEY);

    assert_eq!(client.get_addon(&event_id, &jersey).reserved_count, 2);
    assert_eq!(client.get_addon(&event_id, &tumbler).reserved_count, 1);
}

#[test]
fn reserve_addon_reverts_when_the_quota_is_full() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (_jersey, tumbler) = add_two_addons(&env, &client, event_id);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    // Quota is 1.
    caller.reserve_addon(&registry, &event_id, &tumbler);
    assert_eq!(
        caller.try_reserve_addon(&registry, &event_id, &tumbler),
        Err(Ok(Error::AddOnQuotaFull))
    );
    assert_eq!(client.get_addon(&event_id, &tumbler).reserved_count, 1);
}

/// The last unit of an add-on, contested inside ONE invocation: check and
/// increment happen together, so the loser reads the already-bumped count.
#[test]
fn exactly_one_entry_wins_the_last_add_on_unit() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (_jersey, tumbler) = add_two_addons(&env, &client, event_id);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(
        caller.race_addon(&registry, &event_id, &tumbler),
        (true, false)
    );
    assert_eq!(client.get_addon(&event_id, &tumbler).reserved_count, 1);
}

#[test]
fn reserve_addon_rejects_a_direct_eoa_call() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (jersey, _tumbler) = add_two_addons(&env, &client, event_id);
    let race_record = wire_race_record(&env, &client);
    let eoa = Address::generate(&env);

    // A plain account signing for itself is not the wired contract, and the
    // wired contract has no `__check_auth` for anyone to sign on its behalf.
    env.mock_auths(&[MockAuth {
        address: &eoa,
        invoke: &MockAuthInvoke {
            contract: &registry,
            fn_name: "reserve_addon",
            args: (event_id, jersey).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    assert_eq!(
        client.try_reserve_addon(&event_id, &jersey),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(client.get_addon(&event_id, &jersey).reserved_count, 0);
    // Sanity: the wired contract itself is accepted for the same call.
    let caller = MockRaceRecordClient::new(&env, &race_record);
    assert_eq!(caller.reserve_addon(&registry, &event_id, &jersey), JERSEY);
}

#[test]
fn reserve_addon_rejects_unknown_ids_and_non_open_events() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (jersey, _tumbler) = add_two_addons(&env, &client, event_id);
    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);

    assert_eq!(
        caller.try_reserve_addon(&registry, &event_id, &99),
        Err(Ok(Error::AddOnNotFound))
    );
    assert_eq!(
        caller.try_reserve_addon(&registry, &7, &jersey),
        Err(Ok(Error::EventNotFound))
    );

    // Closing registration stops add-on sales as well as entries.
    env.mock_all_auths();
    client.set_event_status(&event_id, &EventStatus::Closed);
    assert_eq!(
        caller.try_reserve_addon(&registry, &event_id, &jersey),
        Err(Ok(Error::EventNotOpen))
    );

    env.mock_all_auths();
    client.set_event_status(&event_id, &EventStatus::Cancelled);
    assert_eq!(
        caller.try_reserve_addon(&registry, &event_id, &jersey),
        Err(Ok(Error::EventNotOpen))
    );
}

#[test]
fn reserve_addon_before_wiring_reverts() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (jersey, _tumbler) = add_two_addons(&env, &client, event_id);

    let unwired = env.register(MockRaceRecord, ());
    let caller = MockRaceRecordClient::new(&env, &unwired);
    assert_eq!(
        caller.try_reserve_addon(&registry, &event_id, &jersey),
        Err(Ok(Error::RaceRecordNotSet))
    );
}

/// Add-ons of two events never share ids or quota.
#[test]
fn add_ons_are_isolated_per_event() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (first, _c1) = open_event(&env, &client, &organiser, 5);
    let (second, _c2) = open_event(&env, &client, &organiser, 5);
    env.mock_all_auths();
    let a = client.add_addon(&first, &symbol_short!("JERSEY"), &JERSEY, &1);
    let b = client.add_addon(&second, &symbol_short!("JERSEY"), &TUMBLER, &1);
    assert_eq!((a, b), (0, 0));

    let race_record = wire_race_record(&env, &client);
    let caller = MockRaceRecordClient::new(&env, &race_record);
    caller.reserve_addon(&registry, &first, &a);

    assert_eq!(client.get_addon(&first, &a).reserved_count, 1);
    assert_eq!(client.get_addon(&second, &b).reserved_count, 0);
    // Different events, different prices, no cross-talk.
    assert_eq!(caller.reserve_addon(&registry, &second, &b), TUMBLER);
}

#[test]
fn get_addon_reverts_on_unknown_ids() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);

    assert_eq!(client.try_get_addon(&0, &0), Err(Ok(Error::AddOnNotFound)));
    assert_eq!(client.addon_count(&0), 0);
}

#[test]
fn emits_addon_added_and_addon_reserved() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let race_record = wire_race_record(&env, &client);

    env.mock_all_auths();
    let addon_id = client.add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &2);
    assert_eq!(
        env.events().all(),
        std::vec![AddOnAdded {
            event_id,
            addon_id,
            quota: 2,
            price: JERSEY,
        }
        .to_xdr(&env, &registry)]
    );

    MockRaceRecordClient::new(&env, &race_record).reserve_addon(&registry, &event_id, &addon_id);
    assert_eq!(
        env.events().all(),
        std::vec![AddOnReserved {
            event_id,
            addon_id,
            seq: 0,
            price: JERSEY,
        }
        .to_xdr(&env, &registry)]
    );
}

/// Add-on entries pay rent like every other persistent entry.
#[test]
fn add_on_writes_extend_the_persistent_ttl() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);

    let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
    let (jersey, _tumbler) = add_two_addons(&env, &client, event_id);
    let race_record = wire_race_record(&env, &client);

    let aged_by = (BUMP_TO - BUMP_THRESHOLD) + DAY_IN_LEDGERS;
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + aged_by);

    let key = DataKey::AddOn(event_id, jersey);
    let decayed = persistent_ttl(&env, &registry, key.clone());
    assert_eq!(decayed, BUMP_TO - aged_by);
    assert!(decayed < BUMP_THRESHOLD);

    MockRaceRecordClient::new(&env, &race_record).reserve_addon(&registry, &event_id, &jersey);

    assert_eq!(persistent_ttl(&env, &registry, key), BUMP_TO);
    assert_eq!(
        persistent_ttl(&env, &registry, DataKey::AddOnCount(event_id)),
        BUMP_TO - aged_by,
        "reserve_addon does not rewrite the count, so its rent is untouched"
    );
}

// ---------------------------------------------------------------------------
// Organiser allowlist (v2.1, STE-36)
//
// The gate `create_event` gained, from both sides: who may open it, who may
// close it, and what an address that is not on it can and cannot do.
// ---------------------------------------------------------------------------

#[test]
fn organiser_allowlist_add_then_remove() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    // Never added.
    assert!(!client.is_organiser(&organiser));

    client.add_organiser(&organiser);
    assert!(client.is_organiser(&organiser));

    client.remove_organiser(&organiser);
    assert!(!client.is_organiser(&organiser));
}

#[test]
fn organiser_allowlist_rejects_duplicate_and_unknown() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    assert_eq!(
        client.try_remove_organiser(&organiser),
        Err(Ok(Error::OrganiserNotFound))
    );

    client.add_organiser(&organiser);
    assert_eq!(
        client.try_add_organiser(&organiser),
        Err(Ok(Error::OrganiserAlreadyAdded))
    );

    client.remove_organiser(&organiser);
    assert_eq!(
        client.try_remove_organiser(&organiser),
        Err(Ok(Error::OrganiserNotFound))
    );
}

/// The allowlist is the admin's, and only the admin's. An organiser who could
/// add organisers would be able to grant away the exact thing the gate exists
/// to withhold.
#[test]
fn organiser_allowlist_is_admin_only() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let impostor = Address::generate(&env);
    let target = Address::generate(&env);

    macro_rules! signed_by_impostor {
        ($fn_name:literal) => {
            env.mock_auths(&[MockAuth {
                address: &impostor,
                invoke: &MockAuthInvoke {
                    contract: &registry,
                    fn_name: $fn_name,
                    args: (target.clone(),).into_val(&env),
                    sub_invokes: &[],
                },
            }]);
        };
    }

    signed_by_impostor!("add_organiser");
    assert_eq!(
        client.try_add_organiser(&target),
        Err(Err(InvokeError::Abort))
    );
    assert!(!client.is_organiser(&target));

    // Same from the other direction: put someone on as admin, then try to take
    // them off as a stranger.
    env.mock_all_auths();
    client.add_organiser(&target);

    signed_by_impostor!("remove_organiser");
    assert_eq!(
        client.try_remove_organiser(&target),
        Err(Err(InvokeError::Abort))
    );
    assert!(client.is_organiser(&target));
}

/// The point of the whole ticket: holding the keypair is not enough.
#[test]
fn create_event_rejects_an_organiser_who_is_not_allowlisted() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let impersonator = Address::generate(&env);
    // `mock_all_auths` satisfies `organiser.require_auth()` for ANY address —
    // which is precisely the situation the allowlist exists to survive.
    env.mock_all_auths();

    assert_eq!(
        client.try_create_event(
            &impersonator,
            &String::from_str(&env, "Jakarta Marathon 2026"),
            &hash(&env),
            &uri(&env),
            &STARTS_AT
        ),
        Err(Ok(Error::NotAllowlistedOrganiser))
    );
    // Nothing was written: no id was burned and no event exists.
    assert_eq!(client.event_count(), 0);
    assert_eq!(client.try_get_event(&0), Err(Ok(Error::EventNotFound)));
}

#[test]
fn create_event_succeeds_once_the_admin_allowlists_the_organiser() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&organiser);
    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);

    assert_eq!(event_id, 0);
    assert_eq!(client.get_organiser(&event_id), organiser);
}

#[test]
fn revoking_an_organiser_closes_create_event_again() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&organiser);
    client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
    client.remove_organiser(&organiser);

    assert_eq!(
        client.try_create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT),
        Err(Ok(Error::NotAllowlistedOrganiser))
    );
    assert_eq!(client.event_count(), 1);
}

/// Revocation is forward-looking. The race an organiser is already running
/// has entrants who paid, and pulling its organiser out from under it would
/// strand them — so every per-event power keeps working on events that
/// already exist. Only NEW events are refused.
#[test]
fn a_revoked_organiser_still_runs_the_events_it_already_created() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    let scanner = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&organiser);
    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
    client.remove_organiser(&organiser);

    client.add_category(&event_id, &symbol_short!("10K"), &10_000, &50, &50_000_000);
    client.add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &10);
    client.set_event_status(&event_id, &EventStatus::Open);
    client.add_scanner(&event_id, &scanner);

    assert_eq!(client.get_event(&event_id).status, EventStatus::Open);
    assert_eq!(client.category_count(&event_id), 1);
    assert_eq!(client.addon_count(&event_id), 1);
    assert!(client.is_scanner(&event_id, &scanner));
    assert!(!client.is_organiser(&organiser));
}

/// One grant is one address. Being on the allowlist says nothing about anybody
/// else, which is the property that makes it a gate rather than a switch.
#[test]
fn the_allowlist_is_per_address() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let allowed = Address::generate(&env);
    let stranger = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&allowed);

    assert!(client.is_organiser(&allowed));
    assert!(!client.is_organiser(&stranger));
    assert_eq!(
        client.try_create_event(&stranger, &name(&env), &hash(&env), &uri(&env), &STARTS_AT),
        Err(Ok(Error::NotAllowlistedOrganiser))
    );
    client.create_event(&allowed, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
    assert_eq!(client.event_count(), 1);
}

#[test]
fn emits_organiser_added_and_removed() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&organiser);
    assert_eq!(
        env.events().all(),
        std::vec![crate::OrganiserAdded {
            organiser: organiser.clone(),
        }
        .to_xdr(&env, &registry)]
    );

    client.remove_organiser(&organiser);
    assert_eq!(
        env.events().all(),
        std::vec![crate::OrganiserRemoved {
            organiser: organiser.clone(),
        }
        .to_xdr(&env, &registry)]
    );
}

#[test]
fn allowlisting_extends_the_persistent_ttl() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&organiser);

    assert_eq!(
        persistent_ttl(&env, &registry, DataKey::Organiser(organiser.clone())),
        BUMP_TO
    );
    assert_eq!(
        env.as_contract(&registry, || env.storage().instance().get_ttl()),
        BUMP_TO
    );
}

/// Removing really removes: the entry is gone, not set to `false`, so the
/// contract stops paying rent for a revoked address.
#[test]
fn removing_an_organiser_drops_the_entry_rather_than_falsifying_it() {
    let env = Env::default();
    let (_admin, registry) = deploy(&env);
    let client = EventRegistryClient::new(&env, &registry);
    let organiser = Address::generate(&env);
    env.mock_all_auths();

    client.add_organiser(&organiser);
    client.remove_organiser(&organiser);

    let key = DataKey::Organiser(organiser.clone());
    assert!(!env.as_contract(&registry, || env.storage().persistent().has(&key)));
}

// ---------------------------------------------------------------------------
// Bib numbers (v2.3, STE-54)
//
// A bib is unique within its event and starts at 1. Before v2.3 it was the
// category's `entered_count`, so the first 10K entrant and the first 5K entrant
// of one race were both bib `0` — two runners wearing the same number, and one
// of them wearing zero.
//
// The property under test is the one a race director cares about: no two
// runners at a race share a number. What is deliberately NOT tested is any
// relationship between the number and the distance, because there is none —
// encoding the distance into the number is what caps a field at a thousand
// runners.
// ---------------------------------------------------------------------------
mod bib {
    use super::*;

    /// Adds a second distance to an event that is already `Open`.
    fn add_distance(
        env: &Env,
        client: &EventRegistryClient,
        event_id: u32,
        code: Symbol,
        distance_m: u32,
        quota: u32,
    ) -> u32 {
        env.mock_all_auths();
        client.add_category(&event_id, &code, &distance_m, &quota, &0)
    }

    /// The whole ticket in one assertion: two distances, one event, and the
    /// first runner of each gets a DIFFERENT number — 1 and 2, not 0 and 0.
    #[test]
    fn two_distances_in_one_event_never_share_a_bib() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 10);
        let five_k = add_distance(&env, &client, event_id, symbol_short!("5K"), 5_000, 10);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 1);
        assert_eq!(caller.reserve(&registry, &event_id, &five_k), 2);
    }

    /// The first entrant of an event gets bib 1 whichever distance they picked.
    /// Running it over every distance of the same fresh event would only prove
    /// it for the first one, so each pass builds its own event.
    #[test]
    fn the_first_entrant_of_an_event_gets_bib_one_in_any_distance() {
        for chosen in 0..3u32 {
            let env = Env::default();
            let (_admin, registry) = deploy(&env);
            let client = EventRegistryClient::new(&env, &registry);
            let organiser = Address::generate(&env);

            let (event_id, _first) = open_event(&env, &client, &organiser, 10);
            add_distance(&env, &client, event_id, symbol_short!("5K"), 5_000, 10);
            add_distance(&env, &client, event_id, symbol_short!("21K"), 21_097, 10);
            let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

            assert_eq!(
                caller.reserve(&registry, &event_id, &chosen),
                1,
                "the first entrant of category {chosen} should be bib 1"
            );
        }
    }

    /// Entrants arriving in a mixed order draw from ONE sequence: 1, 2, 3, 4,
    /// 5 across three distances, with no repeats and no gaps.
    #[test]
    fn the_event_counter_advances_across_distances() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 10);
        let five_k = add_distance(&env, &client, event_id, symbol_short!("5K"), 5_000, 10);
        let half = add_distance(&env, &client, event_id, symbol_short!("21K"), 21_097, 10);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        let order = [five_k, five_k, half, ten_k, half];
        let bibs: std::vec::Vec<u32> = order
            .iter()
            .map(|c| caller.reserve(&registry, &event_id, c))
            .collect();

        assert_eq!(bibs, std::vec![1, 2, 3, 4, 5]);
        // Each distance still counted only its own entrants.
        assert_eq!(client.get_category(&event_id, &five_k).entered_count, 2);
        assert_eq!(client.get_category(&event_id, &half).entered_count, 2);
        assert_eq!(client.get_category(&event_id, &ten_k).entered_count, 1);
    }

    /// The counter is per event, not per contract: a second event starts its
    /// own numbering at 1. Bibs identify a runner at a race, not on the ledger.
    #[test]
    fn each_event_numbers_from_one() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (first_event, first_cat) = open_event(&env, &client, &organiser, 10);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));
        assert_eq!(caller.reserve(&registry, &first_event, &first_cat), 1);
        assert_eq!(caller.reserve(&registry, &first_event, &first_cat), 2);

        let (second_event, second_cat) = open_event(&env, &client, &organiser, 10);
        assert_eq!(caller.reserve(&registry, &second_event, &second_cat), 1);
        // …and the first event carries on from where it was.
        assert_eq!(caller.reserve(&registry, &first_event, &first_cat), 3);
    }

    /// Quota is enforced **per distance** and the bib counter gates nothing.
    /// A sold-out 5K does not stop the 10K selling, and the 10K's bibs keep
    /// counting past the number of slots the 5K ever had.
    #[test]
    fn quota_is_still_per_distance_while_bibs_are_per_event() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 4);
        let five_k = add_distance(&env, &client, event_id, symbol_short!("5K"), 5_000, 2);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        assert_eq!(caller.reserve(&registry, &event_id, &five_k), 1);
        assert_eq!(caller.reserve(&registry, &event_id, &five_k), 2);
        // The 5K is full — and says so with the same error as ever.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &five_k),
            Err(Ok(Error::QuotaFull))
        );
        // The 10K is untouched by that, and its bibs continue the event's run.
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 3);
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 4);

        assert_eq!(client.get_category(&event_id, &five_k).entered_count, 2);
        assert_eq!(client.get_category(&event_id, &ten_k).entered_count, 2);
    }

    /// A refused entry consumes no bib. Otherwise every sold-out attempt would
    /// punch a hole in the numbering, and a race with gaps in its bib list
    /// looks like a race that lost entries.
    #[test]
    fn a_refused_entry_does_not_burn_a_bib() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 10);
        let five_k = add_distance(&env, &client, event_id, symbol_short!("5K"), 5_000, 1);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        assert_eq!(caller.reserve(&registry, &event_id, &five_k), 1);
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &five_k),
            Err(Ok(Error::QuotaFull))
        );
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &404),
            Err(Ok(Error::CategoryNotFound))
        );
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 2);
    }

    /// The counter lives under its own key, and the key is bumped like every
    /// other persistent entry it shares an event with — a bib sequence that
    /// archived would restart at 1 and re-issue numbers that are already on
    /// chain.
    #[test]
    fn the_event_counter_is_stored_under_its_own_key_and_kept_alive() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 10);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));
        caller.reserve(&registry, &event_id, &category_id);
        caller.reserve(&registry, &event_id, &category_id);

        let key = DataKey::EventEntryCount(event_id);
        assert_eq!(
            env.as_contract(&registry, || env
                .storage()
                .persistent()
                .get::<_, u32>(&key)
                .unwrap()),
            2
        );
        assert_eq!(persistent_ttl(&env, &registry, key), BUMP_TO);
    }

    /// `SlotReserved.seq` carries the bib, so an indexer that reads only events
    /// sees the same number the entrant was handed.
    #[test]
    fn slot_reserved_carries_the_event_bib() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 10);
        let five_k = add_distance(&env, &client, event_id, symbol_short!("5K"), 5_000, 10);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        // `events()` holds what the LAST top-level invocation emitted, so
        // each entry is checked where it happens rather than in one batch.
        caller.reserve(&registry, &event_id, &ten_k);
        assert_eq!(
            env.events().all(),
            std::vec![SlotReserved {
                event_id,
                category_id: ten_k,
                seq: 1,
            }
            .to_xdr(&env, &registry)]
        );

        caller.reserve(&registry, &event_id, &five_k);
        assert_eq!(
            env.events().all(),
            std::vec![SlotReserved {
                event_id,
                category_id: five_k,
                seq: 2,
            }
            .to_xdr(&env, &registry)]
        );
    }
}

// ---------------------------------------------------------------------------
// Raising a sold-out quota (v2.4, STE-55)
//
// Selling out in hours is the ordinary case at an Indonesian road race, so the
// interesting tests here are not "does the setter set". They are: does a
// distance that has already refused an entrant start accepting again, does the
// number refuse to go backwards, and does everything the entrants already have
// — their count, their bibs — survive being given more company.
// ---------------------------------------------------------------------------
mod quota {
    use super::*;

    /// Fills `category_id` until `reserve_slot` refuses, and returns how many
    /// entries it took. Asserts the refusal, so a category that never fills is
    /// a failure rather than a silent loop that ends.
    fn fill_until_full(
        caller: &MockRaceRecordClient,
        registry: &Address,
        event_id: u32,
        category_id: u32,
        expect: u32,
    ) -> u32 {
        let mut taken = 0;
        while caller
            .try_reserve(registry, &event_id, &category_id)
            .is_ok()
        {
            taken += 1;
            assert!(taken <= expect, "the category took more than its quota");
        }
        assert_eq!(taken, expect, "the category did not take its whole quota");
        assert_eq!(
            caller.try_reserve(registry, &event_id, &category_id),
            Err(Ok(Error::QuotaFull))
        );
        taken
    }

    /// The ticket in one test: a distance sells out, the organiser opens a
    /// second batch, and the runners who were turned away get in — up to the
    /// new number and not one past it.
    #[test]
    fn a_sold_out_distance_sells_again_once_the_quota_is_raised() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 2);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));
        fill_until_full(&caller, &registry, event_id, category_id, 2);

        env.mock_all_auths();
        client.increase_quota(&event_id, &category_id, &5);

        // Three more get in — 2 already taken, 5 now allowed.
        assert_eq!(caller.reserve(&registry, &event_id, &category_id), 3);
        assert_eq!(caller.reserve(&registry, &event_id, &category_id), 4);
        assert_eq!(caller.reserve(&registry, &event_id, &category_id), 5);
        // …and the new number is a real cap, not a suggestion.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &category_id),
            Err(Ok(Error::QuotaFull))
        );
        assert_eq!(
            client.get_category(&event_id, &category_id).entered_count,
            5
        );
    }

    /// A third batch. Nothing about the first increase makes the second a
    /// special case — which is the point of storing the number rather than a
    /// "has been raised" flag.
    #[test]
    fn the_quota_can_be_raised_again_and_again() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 1);
        env.mock_all_auths();

        client.increase_quota(&event_id, &category_id, &2);
        assert_eq!(client.get_category(&event_id, &category_id).quota, 2);
        client.increase_quota(&event_id, &category_id, &3);
        assert_eq!(client.get_category(&event_id, &category_id).quota, 3);
        client.increase_quota(&event_id, &category_id, &8_100);
        assert_eq!(client.get_category(&event_id, &category_id).quota, 8_100);
    }

    /// The published number never goes down. Equal is refused too: a no-op
    /// that emitted `QuotaIncreased` would put a second batch in the ledger
    /// that never happened.
    #[test]
    fn a_quota_that_does_not_grow_is_refused() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 50);
        env.mock_all_auths();

        assert_eq!(
            client.try_increase_quota(&event_id, &category_id, &50),
            Err(Ok(Error::QuotaNotIncreased)),
            "the same number is not an increase"
        );
        assert_eq!(
            client.try_increase_quota(&event_id, &category_id, &49),
            Err(Ok(Error::QuotaNotIncreased)),
            "one fewer is a shrink"
        );
        assert_eq!(
            client.try_increase_quota(&event_id, &category_id, &0),
            Err(Ok(Error::QuotaNotIncreased)),
            "zero would be a closure dressed as a quota"
        );
        // The refusals changed nothing.
        assert_eq!(client.get_category(&event_id, &category_id).quota, 50);
        // And one more than the current quota IS an increase — the boundary is
        // strict, not off by one.
        client.increase_quota(&event_id, &category_id, &51);
        assert_eq!(client.get_category(&event_id, &category_id).quota, 51);
    }

    /// A shrink cannot be used to strand entrants who already paid: a category
    /// whose `entered_count` sat above its `quota` would read as sold out for a
    /// race that had been rewritten underneath its runners.
    #[test]
    fn a_shrink_below_the_entries_already_taken_is_refused() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));
        caller.reserve(&registry, &event_id, &category_id);
        caller.reserve(&registry, &event_id, &category_id);
        caller.reserve(&registry, &event_id, &category_id);

        env.mock_all_auths();
        assert_eq!(
            client.try_increase_quota(&event_id, &category_id, &2),
            Err(Ok(Error::QuotaNotIncreased))
        );
        let after = client.get_category(&event_id, &category_id);
        assert_eq!(after.quota, 5);
        assert_eq!(after.entered_count, 3);
    }

    /// Organiser-gated, by the same route as `add_category`: the authority
    /// comes from `EventData.organiser` in storage, never from the caller.
    #[test]
    fn increase_quota_rejects_a_foreign_signer() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);
        let impostor = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 10);

        env.mock_auths(&[MockAuth {
            address: &impostor,
            invoke: &MockAuthInvoke {
                contract: &registry,
                fn_name: "increase_quota",
                args: (event_id, category_id, 99u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        assert_eq!(
            client.try_increase_quota(&event_id, &category_id, &99),
            Err(Err(InvokeError::Abort))
        );
        assert_eq!(client.get_category(&event_id, &category_id).quota, 10);
    }

    /// Unknown ids reuse the errors that already exist. The event is read
    /// first (by the auth gate), so an unknown event says so even when the
    /// category id is nonsense too.
    #[test]
    fn increase_quota_reverts_on_unknown_ids() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, _category_id) = open_event(&env, &client, &organiser, 10);
        env.mock_all_auths();

        assert_eq!(
            client.try_increase_quota(&event_id, &404, &99),
            Err(Ok(Error::CategoryNotFound))
        );
        assert_eq!(
            client.try_increase_quota(&404, &0, &99),
            Err(Ok(Error::EventNotFound))
        );
        assert_eq!(
            client.try_increase_quota(&404, &404, &99),
            Err(Ok(Error::EventNotFound))
        );
    }

    /// Only `quota` moves. `entered_count` in particular is the quota counter,
    /// and rewriting it here would silently hand slots back or take them away.
    #[test]
    fn nothing_but_the_quota_changes() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 4);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));
        caller.reserve(&registry, &event_id, &category_id);
        caller.reserve(&registry, &event_id, &category_id);
        let before = client.get_category(&event_id, &category_id);

        env.mock_all_auths();
        client.increase_quota(&event_id, &category_id, &900);

        assert_eq!(
            client.get_category(&event_id, &category_id),
            CategoryData {
                quota: 900,
                ..before.clone()
            }
        );
        assert_eq!(before.entered_count, 2);
        assert_eq!(client.category_count(&event_id), 1);
    }

    /// One distance's second batch is that distance's business. The other
    /// distances of the same race keep the caps they published.
    #[test]
    fn raising_one_distance_leaves_the_others_alone() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 3);
        env.mock_all_auths();
        let five_k = client.add_category(&event_id, &symbol_short!("5K"), &5_000, &3, &0);
        let other_event = create_event(&env, &client, &organiser);
        env.mock_all_auths();
        let other_cat = client.add_category(&other_event, &symbol_short!("10K"), &10_000, &3, &0);

        client.increase_quota(&event_id, &ten_k, &10);

        assert_eq!(client.get_category(&event_id, &ten_k).quota, 10);
        assert_eq!(client.get_category(&event_id, &five_k).quota, 3);
        assert_eq!(client.get_category(&other_event, &other_cat).quota, 3);
    }

    /// The bib sequence is per event and this function never touches it, so
    /// the entrants of a second batch carry on the race's numbering: …3, 4,
    /// not a repeat of 1.
    #[test]
    fn bib_numbering_runs_straight_through_an_increase() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, ten_k) = open_event(&env, &client, &organiser, 2);
        env.mock_all_auths();
        let five_k = client.add_category(&event_id, &symbol_short!("5K"), &5_000, &1, &0);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 1);
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 2);
        assert_eq!(caller.reserve(&registry, &event_id, &five_k), 3);
        // Both distances are full now.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &ten_k),
            Err(Ok(Error::QuotaFull))
        );

        env.mock_all_auths();
        client.increase_quota(&event_id, &ten_k, &4);

        // The second batch continues the event's sequence.
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 4);
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 5);
        // The 5K was not raised and is still refusing.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &five_k),
            Err(Ok(Error::QuotaFull))
        );
        assert_eq!(
            env.as_contract(&registry, || env
                .storage()
                .persistent()
                .get::<_, u32>(&DataKey::EventEntryCount(event_id))
                .unwrap()),
            5
        );
    }

    /// The second-batch flow as an organiser actually runs it: registration is
    /// `Closed` while the cap is lifted, then re-opened. There is no status
    /// gate, so the raise lands on a closed event and the re-open sells.
    #[test]
    fn the_quota_can_be_raised_while_registration_is_closed() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 1);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));
        fill_until_full(&caller, &registry, event_id, category_id, 1);

        env.mock_all_auths();
        client.set_event_status(&event_id, &EventStatus::Closed);
        client.increase_quota(&event_id, &category_id, &3);
        // Closed still refuses entries, and for the status reason, not the quota.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &category_id),
            Err(Ok(Error::EventNotOpen))
        );

        client.set_event_status(&event_id, &EventStatus::Open);
        assert_eq!(caller.reserve(&registry, &event_id, &category_id), 2);
        assert_eq!(caller.reserve(&registry, &event_id, &category_id), 3);
    }

    /// Raising the quota of a terminal event writes a number that sells
    /// nothing: `reserve_slot` demands `Open`. Asserted rather than gated —
    /// see the function's doc comment for why there is no extra error here.
    #[test]
    fn a_raise_on_a_cancelled_event_sells_nothing() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 1);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        env.mock_all_auths();
        client.set_event_status(&event_id, &EventStatus::Cancelled);
        client.increase_quota(&event_id, &category_id, &500);

        assert_eq!(client.get_category(&event_id, &category_id).quota, 500);
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &category_id),
            Err(Ok(Error::EventNotOpen))
        );
    }

    /// `QuotaIncreased` carries both numbers, so a second batch is a dated
    /// fact in the ledger rather than a value an indexer has to diff against
    /// its own last read.
    #[test]
    fn emits_quota_increased() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 200);

        env.mock_all_auths();
        client.increase_quota(&event_id, &category_id, &500);

        assert_eq!(
            env.events().all(),
            std::vec![QuotaIncreased {
                event_id,
                category_id,
                previous: 200,
                current: 500,
            }
            .to_xdr(&env, &registry)]
        );

        // A second batch reports the number it replaced, not the original one.
        client.increase_quota(&event_id, &category_id, &800);
        assert_eq!(
            env.events().all(),
            std::vec![QuotaIncreased {
                event_id,
                category_id,
                previous: 500,
                current: 800,
            }
            .to_xdr(&env, &registry)]
        );
    }

    /// A refused increase emits nothing. The ledger is where a client learns a
    /// second batch happened, so an event for a batch that did not happen is
    /// worse than no event at all.
    #[test]
    fn a_refused_increase_emits_nothing() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 200);

        env.mock_all_auths();
        assert!(client
            .try_increase_quota(&event_id, &category_id, &200)
            .is_err());

        assert_eq!(env.events().all(), std::vec![]);
    }

    /// The write pays rent for what it touched, like every other organiser
    /// mutation: a category whose TTL decayed is extended by being raised.
    #[test]
    fn increase_quota_extends_the_persistent_ttl() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 10);

        let aged_by = (BUMP_TO - BUMP_THRESHOLD) + DAY_IN_LEDGERS;
        env.ledger()
            .set_sequence_number(env.ledger().sequence() + aged_by);

        let key = DataKey::Category(event_id, category_id);
        let decayed = persistent_ttl(&env, &registry, key.clone());
        assert_eq!(decayed, BUMP_TO - aged_by);
        assert!(decayed < BUMP_THRESHOLD);

        env.mock_all_auths();
        client.increase_quota(&event_id, &category_id, &20);

        assert_eq!(persistent_ttl(&env, &registry, key), BUMP_TO);
        // The event entry is refreshed too — the auth gate touches it, and a
        // category whose event archived is worthless.
        assert_eq!(
            persistent_ttl(&env, &registry, DataKey::Event(event_id)),
            BUMP_TO
        );
    }

    /// `u32::MAX` is a legal quota. Nothing here multiplies or adds, so there
    /// is no arithmetic for an extreme value to overflow — worth an assertion
    /// rather than an assumption, since `overflow-checks` turns a mistake here
    /// into a revert on the entry path.
    #[test]
    fn an_extreme_quota_is_accepted() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 1);
        let caller = MockRaceRecordClient::new(&env, &wire_race_record(&env, &client));

        env.mock_all_auths();
        client.increase_quota(&event_id, &category_id, &u32::MAX);
        assert_eq!(client.get_category(&event_id, &category_id).quota, u32::MAX);

        assert_eq!(caller.reserve(&registry, &event_id, &category_id), 1);
        assert_eq!(
            client.try_increase_quota(&event_id, &category_id, &u32::MAX),
            Err(Ok(Error::QuotaNotIncreased)),
            "there is nothing above u32::MAX to move to"
        );
    }
}

// ---------------------------------------------------------------------------
// Upgrade (v2)
//
// These tests deploy the registry from the BUILT WASM rather than from the
// native `EventRegistry` type, because that is the only form
// `update_current_contract_wasm` can actually replace. They therefore need
// `stellar contract build` to have run first — the same ordering requirement
// the RaceRecord export test documents.
// ---------------------------------------------------------------------------
mod upgrade {
    use super::*;
    use soroban_sdk::Bytes;
    use std::path::PathBuf;

    fn wasm_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/wasm32v1-none/release")
            .join(name)
    }

    fn wasm_bytes(name: &str) -> std::vec::Vec<u8> {
        let path = wasm_path(name);
        std::fs::read(&path).unwrap_or_else(|e| {
            panic!(
                "cannot read {}: {e}\nRun `cd sc && stellar contract build` first — the upgrade \
                 tests replace a real executable, so they need one.",
                path.display()
            )
        })
    }

    /// The executable that is RUNNING on testnet at
    /// `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` as this
    /// change is written — fetched with `stellar contract fetch`, byte for
    /// byte. Provenance and refresh instructions: `testdata/README.md`.
    ///
    /// It is here because the interesting upgrade is not "wasm X replaced by
    /// wasm X". It is "the code that wrote the live events is replaced by the
    /// code in this branch", and that is the only pair that can prove
    /// `DataKey::Organiser` was appended safely.
    const LIVE_PRE_ALLOWLIST_WASM: &[u8] =
        include_bytes!("../testdata/event_registry_live_pre_allowlist.wasm");

    /// sha256 of the artifact above, which is also the wasm hash the ledger
    /// reports for the live contract and the one INTERFACE.md §0 freezes for
    /// v2.0.1.
    const LIVE_PRE_ALLOWLIST_HASH: &str =
        "22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f";

    /// The executable running at the same address when STE-54 was written —
    /// v2.2, the one STE-36 installed. It is the code that issued every bib
    /// now on chain, so it is the only "before" that can prove those numbers
    /// survive the switch to an event-wide sequence.
    ///
    /// Two fixtures, not one: `LIVE_PRE_ALLOWLIST_WASM` above proves the
    /// allowlist key was appended safely and is kept for that, while this one
    /// is the current chain state. Provenance: `testdata/README.md`.
    const LIVE_PRE_BIB_WASM: &[u8] = include_bytes!("../testdata/event_registry_live_pre_bib.wasm");

    /// sha256 of the artifact above — what `stellar contract info hash` reports
    /// for `CAPB6NQP…` before this branch is deployed.
    const LIVE_PRE_BIB_HASH: &str =
        "cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0";

    /// The executable running at the same address when STE-55 was written —
    /// v2.3, the one STE-54 installed. It is the code that wrote every event
    /// and every category now on chain, so it is the only "before" that can
    /// prove a quota can be raised on a category *it* created.
    ///
    /// A third fixture rather than a replacement for the two above: each one
    /// keeps proving the upgrade it was captured for. Provenance:
    /// `testdata/README.md`.
    const LIVE_PRE_QUOTA_WASM: &[u8] =
        include_bytes!("../testdata/event_registry_live_pre_quota.wasm");

    /// sha256 of the artifact above — what the ledger reports for `CAPB6NQP…`
    /// before this branch is deployed, and the hash INTERFACE.md §0 freezes
    /// for v2.3.0.
    const LIVE_PRE_QUOTA_HASH: &str =
        "c8b5e82a2dde8366949cb6399d5b7eccdcbbc37d86ddd48a2adc61e40c9869cd";

    /// Lowercase hex, so a mismatch prints the two hashes instead of two byte
    /// arrays.
    fn hex32(bytes: &BytesN<32>) -> std::string::String {
        let mut out = std::string::String::new();
        for b in bytes.to_array() {
            out.push_str(&std::format!("{b:02x}"));
        }
        out
    }

    /// Registry deployed from its own wasm, plus its admin.
    fn deploy_from_wasm(env: &Env) -> (Address, Address) {
        let admin = Address::generate(env);
        let wasm = wasm_bytes("event_registry.wasm");
        let registry = env.register(wasm.as_slice(), (admin.clone(),));
        (admin, registry)
    }

    fn upload(env: &Env, name: &str) -> BytesN<32> {
        let wasm = wasm_bytes(name);
        env.deployer()
            .upload_contract_wasm(Bytes::from_slice(env, &wasm))
    }

    /// The point of the whole exercise: state written by the old executable is
    /// read back, unchanged, by the new one.
    #[test]
    fn state_written_before_an_upgrade_reads_back_after_it() {
        let env = Env::default();
        let (_admin, registry) = deploy_from_wasm(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, category_id) = open_event(&env, &client, &organiser, 5);
        env.mock_all_auths();
        let scanner = Address::generate(&env);
        client.add_scanner(&event_id, &scanner);
        let (jersey, _tumbler) = add_two_addons(&env, &client, event_id);
        let race_record = wire_race_record(&env, &client);
        MockRaceRecordClient::new(&env, &race_record).reserve_addon(&registry, &event_id, &jersey);
        let event_before = client.get_event(&event_id);
        let category_before = client.get_category(&event_id, &category_id);
        let addon_before = client.get_addon(&event_id, &jersey);

        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));

        assert_eq!(client.get_event(&event_id), event_before);
        assert_eq!(
            client.get_category(&event_id, &category_id),
            category_before
        );
        // The keys v2 added survive too, half-sold quota and all.
        assert_eq!(client.get_addon(&event_id, &jersey), addon_before);
        assert_eq!(addon_before.reserved_count, 1);
        assert_eq!(client.addon_count(&event_id), 2);
        assert_eq!(client.category_count(&event_id), 1);
        assert_eq!(client.event_count(), 1);
        assert_eq!(client.get_race_record(), race_record);
        assert!(client.is_scanner(&event_id, &scanner));
        // And the new executable is still upgradeable — losing that would be
        // permanent.
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));
    }

    /// The executable really is replaced, not merely re-pointed at itself: after
    /// upgrading to a DIFFERENT contract's wasm the registry's own functions are
    /// gone, while every storage entry it wrote is still sitting there intact.
    ///
    /// Nobody would ship this upgrade. It is the cheapest way to prove that the
    /// two halves — code and state — really are independent, which is exactly
    /// the property the append-only storage rule exists to protect.
    #[test]
    fn upgrading_swaps_the_code_and_leaves_the_storage_alone() {
        let env = Env::default();
        let (_admin, registry) = deploy_from_wasm(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        let (event_id, _category_id) = open_event(&env, &client, &organiser, 5);
        let event_before = client.get_event(&event_id);

        env.mock_all_auths();
        client.upgrade(&upload(&env, "race_record.wasm"));

        // EventRegistry's surface is gone with its code.
        assert!(client.try_event_count().is_err());

        // The entry it wrote is untouched and still decodes as `EventData`.
        let after: EventData = env
            .as_contract(&registry, || {
                env.storage().persistent().get(&DataKey::Event(event_id))
            })
            .expect("the event entry survived the executable swap");
        assert_eq!(after, event_before);
    }

    #[test]
    fn upgrade_rejects_a_non_admin() {
        let env = Env::default();
        let (_admin, registry) = deploy_from_wasm(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let stranger = Address::generate(&env);
        let hash = upload(&env, "event_registry.wasm");

        // The stranger signs for itself; the contract requires the *stored* admin.
        env.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &registry,
                fn_name: "upgrade",
                args: (hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        assert_eq!(client.try_upgrade(&hash), Err(Err(InvokeError::Abort)));
    }

    /// An unknown hash cannot be installed, so a typo cannot brick the contract.
    /// The same call against a NATIVELY registered contract.
    ///
    /// The tests above are the ones that mean something on a real network, but
    /// they execute the contract as wasm, so the Rust source is never
    /// instrumented and `upgrade` reads as dead code in the coverage report.
    /// Running it natively too keeps the report honest about what is exercised.
    #[test]
    fn upgrade_runs_natively_too() {
        let env = Env::default();
        let (_admin, registry) = deploy(&env);
        let client = EventRegistryClient::new(&env, &registry);

        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));

        assert_eq!(client.event_count(), 0);
    }

    #[test]
    fn upgrade_rejects_a_wasm_hash_that_was_never_uploaded() {
        let env = Env::default();
        let (_admin, registry) = deploy_from_wasm(&env);
        let client = EventRegistryClient::new(&env, &registry);

        env.mock_all_auths();
        let result = client.try_upgrade(&BytesN::from_array(&env, &[9u8; 32]));

        assert!(result.is_err());
    }

    #[test]
    fn emits_contract_upgraded() {
        let env = Env::default();
        let (_admin, registry) = deploy_from_wasm(&env);
        let client = EventRegistryClient::new(&env, &registry);
        let hash = upload(&env, "event_registry.wasm");

        env.mock_all_auths();
        client.upgrade(&hash);

        assert_eq!(
            env.events().all(),
            std::vec![crate::ContractUpgraded {
                new_wasm_hash: hash,
            }
            .to_xdr(&env, &registry)]
        );
    }

    /// STE-36 — the in-place upgrade this branch actually ships, rehearsed.
    ///
    /// The old executable writes the state (it has no allowlist and no gate,
    /// so it can); the new one replaces it; then every entry the old one wrote
    /// is read back through the new code, and the gate that did not exist when
    /// they were written is exercised on top of them.
    ///
    /// This is the checklist OpenZeppelin's upgrade guidance gives for a live
    /// contract — write state with V1, upgrade, verify the reads, verify the
    /// new behaviour, confirm the access control, confirm V2 is still
    /// upgradeable — run against the exact bytes on testnet rather than
    /// against a copy of today's build.
    #[test]
    fn state_written_by_the_live_wasm_survives_the_allowlist_upgrade() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let registry = env.register(LIVE_PRE_ALLOWLIST_WASM, (admin.clone(),));
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);
        let scanner = Address::generate(&env);

        // The fixture is the live artifact, not a lookalike: the host hashes
        // it on upload, and that hash is what the ledger reports for
        // CAPB6NQP… today.
        let live_hash = env
            .deployer()
            .upload_contract_wasm(Bytes::from_slice(&env, LIVE_PRE_ALLOWLIST_WASM));
        assert_eq!(hex32(&live_hash), LIVE_PRE_ALLOWLIST_HASH);

        // -- written by the OLD code, which has no allowlist to satisfy ------
        env.mock_all_auths();
        let event_id =
            client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
        let category_id =
            client.add_category(&event_id, &symbol_short!("10K"), &10_000, &50, &50_000_000);
        let jersey = client.add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &5);
        client.set_event_status(&event_id, &EventStatus::Open);
        client.add_scanner(&event_id, &scanner);
        let race_record = wire_race_record(&env, &client);
        MockRaceRecordClient::new(&env, &race_record).reserve(&registry, &event_id, &category_id);

        let event_before = client.get_event(&event_id);
        let category_before = client.get_category(&event_id, &category_id);
        let addon_before = client.get_addon(&event_id, &jersey);
        // The old code does not export the view at all.
        assert!(client.try_is_organiser(&organiser).is_err());

        // -- the upgrade ----------------------------------------------------
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));

        // -- everything the old code wrote still decodes ---------------------
        assert_eq!(client.get_event(&event_id), event_before);
        assert_eq!(
            client.get_category(&event_id, &category_id),
            category_before
        );
        assert_eq!(client.get_addon(&event_id, &jersey), addon_before);
        assert_eq!(category_before.entered_count, 1);
        assert_eq!(client.category_count(&event_id), 1);
        assert_eq!(client.addon_count(&event_id), 1);
        assert_eq!(client.event_count(), 1);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_race_record(), race_record);
        assert!(client.is_scanner(&event_id, &scanner));
        // The event is still Open, so entries keep working across the upgrade:
        // a race mid-registration does not stop selling because the admin
        // shipped a gate for NEW events.
        MockRaceRecordClient::new(&env, &race_record).reserve(&registry, &event_id, &category_id);
        assert_eq!(
            client.get_category(&event_id, &category_id).entered_count,
            2
        );

        // -- and the gate is live, and starts closed ------------------------
        // Nothing migrated the existing organiser onto the allowlist, which is
        // why seeding it is a step in the deploy runbook and not an
        // afterthought.
        assert!(!client.is_organiser(&organiser));
        assert_eq!(
            client.try_create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT),
            Err(Ok(Error::NotAllowlistedOrganiser))
        );

        env.mock_all_auths();
        client.add_organiser(&organiser);
        assert_eq!(
            client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT),
            event_id + 1
        );

        // Still upgradeable — losing that would be permanent.
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));
    }

    /// STE-54 — the in-place upgrade this branch actually ships, rehearsed
    /// against the bytes that are live.
    ///
    /// The old executable fills a two-distance event the way the chain has
    /// been filling them: bibs per distance, counting from 0, so the first 10K
    /// runner and the first 5K runner are both `0`. Then the new code replaces
    /// it, and the three things that matter are checked in order — what was
    /// written is unchanged, what the old numbering produced is still what it
    /// produced, and a new event numbers 1, 2, 3 across its distances.
    #[test]
    fn bibs_issued_by_the_live_wasm_survive_the_event_wide_sequence() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let registry = env.register(LIVE_PRE_BIB_WASM, (admin.clone(),));
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);

        // The fixture is the live artifact, not a lookalike.
        let live_hash = env
            .deployer()
            .upload_contract_wasm(Bytes::from_slice(&env, LIVE_PRE_BIB_WASM));
        assert_eq!(hex32(&live_hash), LIVE_PRE_BIB_HASH);

        // -- written by the OLD code: the bug, reproduced -------------------
        env.mock_all_auths();
        client.add_organiser(&organiser);
        let old_event =
            client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
        let ten_k = client.add_category(&old_event, &symbol_short!("10K"), &10_000, &5, &0);
        let five_k = client.add_category(&old_event, &symbol_short!("5K"), &5_000, &5, &0);
        client.set_event_status(&old_event, &EventStatus::Open);
        let race_record = wire_race_record(&env, &client);
        let caller = MockRaceRecordClient::new(&env, &race_record);

        assert_eq!(caller.reserve(&registry, &old_event, &ten_k), 0);
        assert_eq!(caller.reserve(&registry, &old_event, &ten_k), 1);
        // Two runners, one race, one number — this is what STE-54 is for.
        assert_eq!(caller.reserve(&registry, &old_event, &five_k), 0);

        let event_before = client.get_event(&old_event);
        let ten_k_before = client.get_category(&old_event, &ten_k);
        let five_k_before = client.get_category(&old_event, &five_k);
        // The old code has no counter to read, so the key is genuinely absent.
        let counter_key = DataKey::EventEntryCount(old_event);
        assert!(!env.as_contract(&registry, || env.storage().persistent().has(&counter_key)));

        // -- the upgrade ----------------------------------------------------
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));

        // -- everything the old code wrote still decodes, byte for byte ------
        assert_eq!(client.get_event(&old_event), event_before);
        assert_eq!(client.get_category(&old_event, &ten_k), ten_k_before);
        assert_eq!(client.get_category(&old_event, &five_k), five_k_before);
        assert_eq!(ten_k_before.entered_count, 2);
        assert_eq!(five_k_before.entered_count, 1);
        assert_eq!(client.category_count(&old_event), 2);
        assert_eq!(client.event_count(), 1);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_race_record(), race_record);
        assert!(client.is_organiser(&organiser));

        // -- a NEW event gets the new numbering -----------------------------
        env.mock_all_auths();
        let new_event =
            client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
        let new_ten_k = client.add_category(&new_event, &symbol_short!("10K"), &10_000, &5, &0);
        let new_five_k = client.add_category(&new_event, &symbol_short!("5K"), &5_000, &5, &0);
        client.set_event_status(&new_event, &EventStatus::Open);

        assert_eq!(caller.reserve(&registry, &new_event, &new_ten_k), 1);
        assert_eq!(caller.reserve(&registry, &new_event, &new_five_k), 2);
        assert_eq!(caller.reserve(&registry, &new_event, &new_ten_k), 3);

        // -- and the pre-upgrade event keeps selling, per-distance quota
        // intact. Its counter starts at 0 because nothing was migrated, which
        // is why the backend keeps its duplicate-bib guard for events that
        // predate this upgrade.
        assert_eq!(caller.reserve(&registry, &old_event, &five_k), 1);
        assert_eq!(client.get_category(&old_event, &five_k).entered_count, 2);
        assert_eq!(client.get_category(&old_event, &ten_k), ten_k_before);

        // Still upgradeable — losing that would be permanent.
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));
    }

    /// STE-55 — the in-place upgrade this branch actually ships, rehearsed
    /// against the bytes that are live.
    ///
    /// The old executable does what the chain has been doing: it creates an
    /// event, sells a distance out, and then has **no way to take another
    /// entrant** — `increase_quota` does not exist in it, which the test
    /// asserts rather than assumes. Then the new code replaces it, and the
    /// three things that matter are checked in order: everything written
    /// before still decodes, the sold-out distance sells again once its quota
    /// is raised, and the new entrants continue the event's bib sequence
    /// instead of restarting it.
    ///
    /// This is OpenZeppelin's upgrade checklist for a live contract — write
    /// state with V1, upgrade, verify the reads, verify the new behaviour,
    /// confirm the access control, confirm V2 is still upgradeable — run
    /// against the exact bytes on testnet rather than against a copy of
    /// today's build.
    #[test]
    fn a_quota_can_be_raised_on_a_category_the_live_wasm_created() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let registry = env.register(LIVE_PRE_QUOTA_WASM, (admin.clone(),));
        let client = EventRegistryClient::new(&env, &registry);
        let organiser = Address::generate(&env);
        let scanner = Address::generate(&env);

        // The fixture is the live artifact, not a lookalike: the host hashes
        // it on upload, and that hash is what the ledger reports for
        // CAPB6NQP… today.
        let live_hash = env
            .deployer()
            .upload_contract_wasm(Bytes::from_slice(&env, LIVE_PRE_QUOTA_WASM));
        assert_eq!(hex32(&live_hash), LIVE_PRE_QUOTA_HASH);

        // -- written by the OLD code: a race that sells out ------------------
        env.mock_all_auths();
        client.add_organiser(&organiser);
        let event_id =
            client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
        let ten_k = client.add_category(&event_id, &symbol_short!("10K"), &10_000, &2, &50_000_000);
        let five_k = client.add_category(&event_id, &symbol_short!("5K"), &5_000, &1, &0);
        let jersey = client.add_addon(&event_id, &symbol_short!("JERSEY"), &JERSEY, &5);
        client.set_event_status(&event_id, &EventStatus::Open);
        client.add_scanner(&event_id, &scanner);
        let race_record = wire_race_record(&env, &client);
        let caller = MockRaceRecordClient::new(&env, &race_record);

        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 1);
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 2);
        assert_eq!(caller.reserve(&registry, &event_id, &five_k), 3);
        // Sold out, and the old code has no way out of that — the whole
        // ticket, stated as the thing the running contract cannot do.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &ten_k),
            Err(Ok(Error::QuotaFull))
        );
        assert!(client.try_increase_quota(&event_id, &ten_k, &5).is_err());

        let event_before = client.get_event(&event_id);
        let ten_k_before = client.get_category(&event_id, &ten_k);
        let five_k_before = client.get_category(&event_id, &five_k);
        let addon_before = client.get_addon(&event_id, &jersey);

        // -- the upgrade ----------------------------------------------------
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));

        // -- everything the old code wrote still decodes, byte for byte ------
        assert_eq!(client.get_event(&event_id), event_before);
        assert_eq!(client.get_category(&event_id, &ten_k), ten_k_before);
        assert_eq!(client.get_category(&event_id, &five_k), five_k_before);
        assert_eq!(client.get_addon(&event_id, &jersey), addon_before);
        assert_eq!(ten_k_before.entered_count, 2);
        assert_eq!(ten_k_before.quota, 2);
        assert_eq!(client.category_count(&event_id), 2);
        assert_eq!(client.addon_count(&event_id), 1);
        assert_eq!(client.event_count(), 1);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_race_record(), race_record);
        assert!(client.is_scanner(&event_id, &scanner));
        assert!(client.is_organiser(&organiser));

        // -- the new behaviour, on a category the OLD code created ----------
        env.mock_all_auths();
        client.increase_quota(&event_id, &ten_k, &4);
        assert_eq!(
            client.get_category(&event_id, &ten_k),
            CategoryData {
                quota: 4,
                ..ten_k_before.clone()
            },
            "only the quota moved; the entries already sold are untouched"
        );

        // The runners who were turned away get in, and their bibs continue the
        // sequence the old code had reached — 4 and 5, not 1 and 2 again.
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 4);
        assert_eq!(caller.reserve(&registry, &event_id, &ten_k), 5);
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &ten_k),
            Err(Ok(Error::QuotaFull))
        );
        // The 5K was not raised, so it is still refusing.
        assert_eq!(
            caller.try_reserve(&registry, &event_id, &five_k),
            Err(Ok(Error::QuotaFull))
        );
        assert_eq!(client.get_category(&event_id, &five_k), five_k_before);

        // -- and the only-up rule is live on that same category -------------
        assert_eq!(
            client.try_increase_quota(&event_id, &ten_k, &4),
            Err(Ok(Error::QuotaNotIncreased))
        );
        assert_eq!(
            client.try_increase_quota(&event_id, &ten_k, &1),
            Err(Ok(Error::QuotaNotIncreased))
        );

        // -- the access control, on state the old code wrote ----------------
        let impostor = Address::generate(&env);
        env.mock_auths(&[MockAuth {
            address: &impostor,
            invoke: &MockAuthInvoke {
                contract: &registry,
                fn_name: "increase_quota",
                args: (event_id, ten_k, 9_000u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        assert_eq!(
            client.try_increase_quota(&event_id, &ten_k, &9_000),
            Err(Err(InvokeError::Abort))
        );
        assert_eq!(client.get_category(&event_id, &ten_k).quota, 4);

        // Still upgradeable — losing that would be permanent.
        env.mock_all_auths();
        client.upgrade(&upload(&env, "event_registry.wasm"));
    }
}
