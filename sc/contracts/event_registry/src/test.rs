#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, Event as _, IntoVal, String, Symbol,
};

use crate::{
    CategoryAdded, CategoryData, EventCreated, EventData, EventRegistry, EventRegistryClient,
    EventStatus, EventStatusChanged, ScannerAdded, ScannerRemoved, SlotReserved,
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

/// Creates an event owned by `organiser` with one category, moves it to
/// `Open`, and returns `(event_id, category_id)`. Uses `mock_all_auths`
/// because the auth model is not what these callers are testing.
fn open_event(
    env: &Env,
    client: &EventRegistryClient,
    organiser: &Address,
    quota: u32,
) -> (u32, u32) {
    env.mock_all_auths();
    let event_id = client.create_event(organiser, &name(env), &hash(env), &uri(env), &STARTS_AT);
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

    let first = client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
    let second = client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);

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

    let event_a = client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
    let event_b = client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);

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

    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
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

    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
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

    for expected_seq in 0..3u32 {
        assert_eq!(
            caller.reserve(&registry, &event_id, &category_id),
            expected_seq
        );
        assert_eq!(
            client.get_category(&event_id, &category_id).entered_count,
            expected_seq + 1
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

    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);

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

    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
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

    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);
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

    let event_id =
        client.create_event(&organiser, &name(&env), &hash(&env), &uri(&env), &STARTS_AT);

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
            seq: 0,
        }
        .to_xdr(&env, &registry)]
    );
}
