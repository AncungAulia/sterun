#![cfg(test)]
extern crate std;

use event_registry::{EventRegistry, EventRegistryClient as RegistryClient, EventStatus};
use soroban_sdk::xdr::{ContractEvent, ContractEventBody, ScVal};
use soroban_sdk::{
    symbol_short,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, Event as _, IntoVal, InvokeError, String, Symbol, TryFromVal, Val,
    Vec,
};
use stellar_tokens::non_fungible::{Mint, NonFungibleTokenError};

use crate::{
    DataKey, Error, RaceRecord, RaceRecordClient, RacepackClaimed, RecordData, RecordDnf,
    RecordEntered, RecordFinished, RecordFinishedUntimed, RecordState, BUMP_THRESHOLD, BUMP_TO,
    DAY_IN_LEDGERS, MAX_ADDONS_PER_ENTRY,
};

// ---------------------------------------------------------------------------
// Fixtures
//
// Every test wires the REAL EventRegistry (C1) and a REAL Stellar Asset
// Contract into the same `Env`, so nothing here is mocked away: quota comes
// from the registry, money moves through a SEP-41 token, and the auth trees are
// the ones the network would see.
// ---------------------------------------------------------------------------

const STARTS_AT: u64 = 1_772_000_000;
const NOW: u64 = 1_772_100_000;
/// 5.0 sUSD at the token's 7 decimals.
const PRICE: i128 = 50_000_000;
/// Add-on prices (v2, STE-35): a 5.0 sUSD jersey and a 3.0 sUSD tumbler.
const JERSEY: i128 = 50_000_000;
const TUMBLER: i128 = 30_000_000;
const FUNDING: i128 = 500_000_000;
const NAME: &str = "Sterun Race Record";
const SYMBOL: &str = "STERUN";
const BASE_URI: &str = "https://sterun.xyz/record/";

fn phash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

struct World {
    env: Env,
    admin: Address,
    registry: Address,
    contract: Address,
    token: Address,
    organiser: Address,
}

impl World {
    /// Deploys registry + token + RaceRecord and wires RaceRecord into the
    /// registry, which is what makes `reserve_slot` reachable at all.
    fn new() -> Self {
        let env = Env::default();
        env.ledger().set_timestamp(NOW);

        let admin = Address::generate(&env);
        let organiser = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        let registry = env.register(EventRegistry, (admin.clone(),));
        let contract = env.register(
            RaceRecord,
            (
                admin.clone(),
                registry.clone(),
                token.clone(),
                String::from_str(&env, NAME),
                String::from_str(&env, SYMBOL),
                String::from_str(&env, BASE_URI),
            ),
        );

        env.mock_all_auths();
        let registry_client = RegistryClient::new(&env, &registry);
        registry_client.set_race_record(&contract);
        // STE-36: the registry gates `create_event` on an admin allowlist, so
        // a world whose organiser is not on it cannot create the event every
        // test here starts from. This is the seeding step the deploy runbook
        // does on testnet, done once at fixture setup.
        registry_client.add_organiser(&organiser);

        World {
            env,
            admin,
            registry,
            contract,
            token,
            organiser,
        }
    }

    fn records(&self) -> RaceRecordClient<'_> {
        RaceRecordClient::new(&self.env, &self.contract)
    }

    fn registry(&self) -> RegistryClient<'_> {
        RegistryClient::new(&self.env, &self.registry)
    }

    fn token(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.token)
    }

    /// Creates an event owned by `self.organiser` with one category. The event
    /// is left in `Draft`. Returns `(event_id, category_id)`.
    fn draft_event(&self, quota: u32, price: i128) -> (u32, u32) {
        self.env.mock_all_auths();
        let registry = self.registry();
        let event_id = registry.create_event(
            &self.organiser,
            &String::from_str(&self.env, "Jakarta Night Run 2026"),
            &phash(&self.env, 7),
            &String::from_str(&self.env, "ipfs://bafyjakartanightrun"),
            &STARTS_AT,
        );
        let category_id =
            registry.add_category(&event_id, &symbol_short!("10K"), &10_000, &quota, &price);
        (event_id, category_id)
    }

    /// The usual starting point: a `Draft` event moved to `Open` so entries are
    /// accepted.
    fn open_event(&self, quota: u32, price: i128) -> (u32, u32) {
        let (event_id, category_id) = self.draft_event(quota, price);
        self.env.mock_all_auths();
        self.registry()
            .set_event_status(&event_id, &EventStatus::Open);
        (event_id, category_id)
    }

    /// Walks the registry's legal transitions to land the event on `status`.
    fn event_with_status(&self, quota: u32, price: i128, status: EventStatus) -> (u32, u32) {
        let (event_id, category_id) = self.draft_event(quota, price);
        self.env.mock_all_auths();
        let registry = self.registry();
        match status {
            EventStatus::Draft => {}
            EventStatus::Open => registry.set_event_status(&event_id, &EventStatus::Open),
            // `Closed` and `Completed` are only reachable through `Open`.
            other => {
                registry.set_event_status(&event_id, &EventStatus::Open);
                registry.set_event_status(&event_id, &other);
            }
        }
        (event_id, category_id)
    }

    /// Adds a paid add-on to `event_id` and returns its id.
    fn add_addon(&self, event_id: u32, code: Symbol, price: i128, quota: u32) -> u32 {
        self.env.mock_all_auths();
        self.registry().add_addon(&event_id, &code, &price, &quota)
    }

    /// The usual add-on pair: a jersey with room for two and a one-off tumbler.
    fn jersey_and_tumbler(&self, event_id: u32) -> (u32, u32) {
        (
            self.add_addon(event_id, symbol_short!("JERSEY"), JERSEY, 2),
            self.add_addon(event_id, symbol_short!("TUMBLER"), TUMBLER, 1),
        )
    }

    /// `enter` with add-ons, under `mock_all_auths`.
    fn enter_with(
        &self,
        runner: &Address,
        event_id: u32,
        category_id: u32,
        addon_ids: Vec<u32>,
        seed: u8,
    ) -> u32 {
        self.env.mock_all_auths();
        self.records().enter(
            runner,
            &event_id,
            &category_id,
            &addon_ids,
            &phash(&self.env, seed),
        )
    }

    fn fund(&self, who: &Address, amount: i128) {
        self.env.mock_all_auths();
        StellarAssetClient::new(&self.env, &self.token).mint(who, &amount);
    }

    /// A funded runner, ready to pay `PRICE`.
    fn runner(&self) -> Address {
        let runner = Address::generate(&self.env);
        self.fund(&runner, FUNDING);
        runner
    }

    /// `enter` under `mock_all_auths` — for the tests whose subject is not the
    /// auth model.
    fn enter(&self, runner: &Address, event_id: u32, category_id: u32, seed: u8) -> u32 {
        self.env.mock_all_auths();
        self.records().enter(
            runner,
            &event_id,
            &category_id,
            &vec![&self.env],
            &phash(&self.env, seed),
        )
    }
}

/// Event names in emission order, read off topic 0 of each event.
fn event_names(events: &[ContractEvent]) -> std::vec::Vec<std::string::String> {
    events
        .iter()
        .map(|e| {
            let ContractEventBody::V0(body) = &e.body;
            match body
                .topics
                .first()
                .expect("every event carries its name as topic 0")
            {
                ScVal::Symbol(s) => s.0.to_utf8_string_lossy(),
                other => panic!("topic 0 is not a Symbol: {other:?}"),
            }
        })
        .collect()
}

fn persistent_ttl(env: &Env, contract: &Address, key: DataKey) -> u32 {
    env.as_contract(contract, || env.storage().persistent().get_ttl(&key))
}

// ---------------------------------------------------------------------------
// Positive / happy path
// ---------------------------------------------------------------------------

#[test]
fn constructor_stores_wiring_and_metadata() {
    let w = World::new();
    let records = w.records();

    assert_eq!(records.get_admin(), w.admin);
    assert_eq!(records.get_registry(), w.registry);
    assert_eq!(records.get_token(), w.token);
    assert_eq!(records.name(), String::from_str(&w.env, NAME));
    assert_eq!(records.symbol(), String::from_str(&w.env, SYMBOL));
    assert_eq!(records.total_supply(), 0);
}

/// The whole point of `enter`, asserted end to end: quota consumed on the
/// registry, sUSD moved runner -> organiser by exactly `price_usdc`, record
/// minted to the runner, [`RecordData`] filled in.
#[test]
fn enter_reserves_quota_moves_the_fee_and_mints_the_record() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(10, PRICE);
    let runner = w.runner();

    let token_id = w.enter(&runner, event_id, category_id, 1);

    assert_eq!(token_id, 0);
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        1
    );
    assert_eq!(w.token().balance(&runner), FUNDING - PRICE);
    assert_eq!(w.token().balance(&w.organiser), PRICE);

    let records = w.records();
    assert_eq!(records.total_supply(), 1);
    assert_eq!(records.balance(&runner), 1);
    assert_eq!(records.owner_of(&token_id), runner);
    assert_eq!(
        records.record_of(&token_id),
        RecordData {
            event_id,
            category_id,
            bib_no: 1,
            addon_ids: vec![&w.env],
            participant_hash: phash(&w.env, 1),
            state: RecordState::Entered,
            entered_at: NOW,
            claimed_at: None,
            finish_time_s: None,
            result_at: None,
        }
    );
}

/// The runner signs ONE tree that also covers the nested SEP-41 transfer —
/// this is the "one transaction" promise, asserted in enforcing auth mode.
#[test]
fn enter_is_one_auth_tree_covering_the_fee_transfer() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(10, PRICE);
    let runner = w.runner();
    let hash = phash(&w.env, 2);

    w.env.mock_auths(&[MockAuth {
        address: &runner,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "enter",
            args: (
                runner.clone(),
                event_id,
                category_id,
                vec![&w.env] as Vec<u32>,
                hash.clone(),
            )
                .into_val(&w.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &w.token,
                fn_name: "transfer",
                args: (runner.clone(), w.organiser.clone(), PRICE).into_val(&w.env),
                sub_invokes: &[],
            }],
        },
    }]);
    let token_id = w
        .records()
        .enter(&runner, &event_id, &category_id, &vec![&w.env], &hash);

    assert_eq!(
        w.env.auths(),
        std::vec![(
            runner.clone(),
            soroban_sdk::testutils::AuthorizedInvocation {
                function: soroban_sdk::testutils::AuthorizedFunction::Contract((
                    w.contract.clone(),
                    Symbol::new(&w.env, "enter"),
                    (
                        runner.clone(),
                        event_id,
                        category_id,
                        vec![&w.env] as Vec<u32>,
                        hash
                    )
                        .into_val(&w.env),
                )),
                sub_invocations: std::vec![soroban_sdk::testutils::AuthorizedInvocation {
                    function: soroban_sdk::testutils::AuthorizedFunction::Contract((
                        w.token.clone(),
                        Symbol::new(&w.env, "transfer"),
                        (runner.clone(), w.organiser.clone(), PRICE).into_val(&w.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
    assert_eq!(w.records().owner_of(&token_id), runner);
}

/// Bib numbers are the registry's event sequence, not a local counter — and
/// they are not the token id either, which is why both are asserted: token ids
/// are global to this contract and count from 0, bibs belong to one race and
/// count from 1.
#[test]
fn bib_numbers_come_from_the_registry_sequence() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(3, PRICE);

    for nth in 1..=3u32 {
        let runner = w.runner();
        let token_id = w.enter(&runner, event_id, category_id, nth as u8);
        assert_eq!(token_id, nth - 1);
        assert_eq!(w.records().record_of(&token_id).bib_no, nth);
    }
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        3
    );
}

#[test]
fn records_of_lists_every_token_across_events() {
    let w = World::new();
    let (first_event, first_cat) = w.open_event(5, PRICE);
    let (second_event, second_cat) = w.open_event(5, PRICE);
    let runner = w.runner();

    let a = w.enter(&runner, first_event, first_cat, 1);
    let b = w.enter(&runner, second_event, second_cat, 2);

    let records = w.records();
    assert_eq!(records.records_of(&runner), vec![&w.env, a, b]);
    assert_eq!(records.balance(&runner), 2);
    assert_eq!(records.record_of(&a).event_id, first_event);
    assert_eq!(records.record_of(&b).event_id, second_event);
    // Both are bib 1: the sequence belongs to the event, not to the contract.
    // One runner can wear 1 at two different races.
    assert_eq!(records.record_of(&a).bib_no, 1);
    assert_eq!(records.record_of(&b).bib_no, 1);
}

/// `enter` -> `claim_racepack` -> `record_finish`, with the organiser signing
/// each state change in enforcing auth mode.
#[test]
fn full_lifecycle_entered_claimed_finished() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let runner = w.runner();
    let token_id = w.enter(&runner, event_id, category_id, 3);

    w.env.ledger().set_timestamp(NOW + 60);
    w.env.mock_auths(&[MockAuth {
        address: &w.organiser,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "claim_racepack",
            args: (token_id, w.organiser.clone()).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.records().claim_racepack(&token_id, &w.organiser);
    assert_eq!(
        w.records().record_of(&token_id).state,
        RecordState::RacepackClaimed
    );

    w.env.ledger().set_timestamp(NOW + 7_200);
    w.env.mock_auths(&[MockAuth {
        address: &w.organiser,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "record_finish",
            args: (token_id, 3_600u32).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.records().record_finish(&token_id, &3_600);

    assert_eq!(
        w.records().record_of(&token_id),
        RecordData {
            event_id,
            category_id,
            bib_no: 1,
            addon_ids: vec![&w.env],
            participant_hash: phash(&w.env, 3),
            state: RecordState::Finished,
            entered_at: NOW,
            claimed_at: Some(NOW + 60),
            finish_time_s: Some(3_600),
            result_at: Some(NOW + 7_200),
        }
    );
    // Ownership never moved.
    assert_eq!(w.records().owner_of(&token_id), runner);
}

#[test]
fn an_allowlisted_scanner_can_claim_a_racepack() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let runner = w.runner();
    let token_id = w.enter(&runner, event_id, category_id, 4);
    let scanner = Address::generate(&w.env);

    w.env.mock_all_auths();
    w.registry().add_scanner(&event_id, &scanner);

    // The volunteer device signs for itself, in enforcing mode.
    w.env.mock_auths(&[MockAuth {
        address: &scanner,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "claim_racepack",
            args: (token_id, scanner.clone()).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.records().claim_racepack(&token_id, &scanner);

    assert_eq!(
        w.records().record_of(&token_id).state,
        RecordState::RacepackClaimed
    );
    assert_eq!(w.records().record_of(&token_id).claimed_at, Some(NOW));
}

#[test]
fn record_dnf_from_entered_and_from_racepack_claimed() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let no_show = w.enter(&w.runner(), event_id, category_id, 5);
    let started = w.enter(&w.runner(), event_id, category_id, 6);

    w.env.mock_all_auths();
    let records = w.records();
    records.claim_racepack(&started, &w.organiser);

    records.record_dnf(&no_show);
    records.record_dnf(&started);

    assert_eq!(records.record_of(&no_show).state, RecordState::Dnf);
    assert_eq!(records.record_of(&started).state, RecordState::Dnf);
    assert_eq!(records.record_of(&no_show).result_at, Some(NOW));
    assert_eq!(records.record_of(&no_show).finish_time_s, None);
    // The DNF'd starter keeps the racepack timestamp it had collected.
    assert_eq!(records.record_of(&started).claimed_at, Some(NOW));
}

#[test]
fn verify_matches_the_stored_participant_hash() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 42);

    assert!(w.records().verify(&token_id, &phash(&w.env, 42)));
}

#[test]
fn supply_balance_owner_and_uri_views() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let alice = w.runner();
    let bob = w.runner();

    let first = w.enter(&alice, event_id, category_id, 1);
    let second = w.enter(&bob, event_id, category_id, 2);

    let records = w.records();
    assert_eq!(records.total_supply(), 2);
    assert_eq!(records.balance(&alice), 1);
    assert_eq!(records.balance(&bob), 1);
    assert_eq!(records.balance(&Address::generate(&w.env)), 0);
    assert_eq!(records.owner_of(&first), alice);
    assert_eq!(records.owner_of(&second), bob);
    assert_eq!(
        records.token_uri(&first),
        String::from_str(&w.env, "https://sterun.xyz/record/0")
    );
    assert_eq!(
        records.token_uri(&second),
        String::from_str(&w.env, "https://sterun.xyz/record/1")
    );
}

/// The local `#[contractclient]` mirror must decode EventRegistry's own struct
/// byte for byte — a `#[contracttype]` struct travels as a map keyed by field
/// name, so any drift in C1's field set breaks `enter` at runtime. This test
/// round-trips the registry's value through the mirror to catch that here.
#[test]
fn mirrored_category_data_decodes_the_registrys_own_struct() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(9, PRICE);

    let theirs = w.registry().get_category(&event_id, &category_id);
    let as_val: Val = theirs.clone().into_val(&w.env);
    let ours = crate::registry::CategoryData::try_from_val(&w.env, &as_val)
        .expect("EventRegistry::CategoryData must decode into the local mirror");

    assert_eq!(ours.code, theirs.code);
    assert_eq!(ours.distance_m, theirs.distance_m);
    assert_eq!(ours.quota, theirs.quota);
    assert_eq!(ours.price_usdc, theirs.price_usdc);
    assert_eq!(ours.entered_count, theirs.entered_count);
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

#[test]
fn emits_record_entered() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let runner = w.runner();

    let token_id = w.enter(&runner, event_id, category_id, 8);

    // Filtered to this contract: the registry's `SlotReserved` and the SAC's
    // `transfer` belong to their own emitters.
    assert_eq!(
        w.env.events().all().filter_by_contract(&w.contract),
        std::vec![
            Mint {
                to: runner.clone(),
                token_id,
            }
            .to_xdr(&w.env, &w.contract),
            RecordEntered {
                runner,
                event_id,
                token_id,
                bib_no: 1,
            }
            .to_xdr(&w.env, &w.contract),
        ]
    );
}

#[test]
fn emits_racepack_claimed() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 9);

    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);

    assert_eq!(
        w.env.events().all().filter_by_contract(&w.contract),
        std::vec![RacepackClaimed {
            token_id,
            event_id,
            operator: w.organiser.clone(),
        }
        .to_xdr(&w.env, &w.contract)]
    );
}

#[test]
fn emits_record_finished() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 10);

    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);
    w.records().record_finish(&token_id, &2_750);

    assert_eq!(
        w.env.events().all().filter_by_contract(&w.contract),
        std::vec![RecordFinished {
            token_id,
            event_id,
            finish_time_s: 2_750,
        }
        .to_xdr(&w.env, &w.contract)]
    );
}

#[test]
fn emits_record_dnf() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 11);

    w.env.mock_all_auths();
    w.records().record_dnf(&token_id);

    assert_eq!(
        w.env.events().all().filter_by_contract(&w.contract),
        std::vec![RecordDnf { token_id, event_id }.to_xdr(&w.env, &w.contract)]
    );
}

/// `docs/specs/INTERFACE.md` §2.3 freezes the emission order of one successful
/// `enter`, and STE-16's indexer is written against it: four events from
/// **three different emitters**, in this order —
///
///   1. `slot_reserved`  — EventRegistry's contract id
///   2. `transfer`       — the SEP-41 token's contract id (**only** when `price > 0`)
///   3. `mint`           — RaceRecord's contract id
///   4. `record_entered` — RaceRecord's contract id
///
/// Every other emission test above calls `filter_by_contract` first, which is
/// exactly the thing that hides this: filtering to one emitter can never show
/// that the registry's event precedes the token's, or that `mint` precedes
/// `record_entered` across the whole invocation. The doc tells the indexer to
/// key on the **contract id** rather than the topic name alone; until this test
/// existed that instruction was the one frozen claim with nothing holding it
/// down.
#[test]
fn enter_emits_four_events_from_three_emitters_in_the_frozen_order() {
    // -- paid category: the token sits in the middle of the sequence.
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    w.enter(&w.runner(), event_id, category_id, 12);

    let all = w.env.events().all();
    let seq = all.events();

    assert_eq!(
        event_names(seq),
        std::vec!["slot_reserved", "transfer", "mint", "record_entered"],
        "frozen emission order of a paid `enter` (INTERFACE.md §2.3)"
    );

    // Which emitter sits at which position. `filter_by_contract` keeps the
    // events themselves, so comparing its output against a *slice* of the
    // global sequence pins both identity and position at once — a topic-name
    // filter alone could never tell these three emitters apart.
    assert_eq!(
        all.filter_by_contract(&w.registry).events(),
        &seq[0..1],
        "position 0 must come from EventRegistry"
    );
    assert_eq!(
        all.filter_by_contract(&w.token).events(),
        &seq[1..2],
        "position 1 must come from the SEP-41 token"
    );
    assert_eq!(
        all.filter_by_contract(&w.contract).events(),
        &seq[2..4],
        "positions 2-3 must come from RaceRecord, mint before record_entered"
    );

    // -- free category: the token is never called, so its event is absent and
    //    the remaining three close ranks. An indexer that keyed on a fixed
    //    offset instead of the contract id breaks exactly here.
    let free = World::new();
    let (event_id, category_id) = free.open_event(5, 0);
    free.enter(&Address::generate(&free.env), event_id, category_id, 13);

    let free_all = free.env.events().all();
    let free_seq = free_all.events();

    assert_eq!(
        event_names(free_seq),
        std::vec!["slot_reserved", "mint", "record_entered"],
        "a free entry emits no token event at all"
    );
    assert_eq!(
        free_all.filter_by_contract(&free.registry).events(),
        &free_seq[0..1]
    );
    assert!(free_all.filter_by_contract(&free.token).events().is_empty());
    assert_eq!(
        free_all.filter_by_contract(&free.contract).events(),
        &free_seq[1..3]
    );
}

// ---------------------------------------------------------------------------
// Negative / revert paths
// ---------------------------------------------------------------------------

/// Enforcing auth mode, no entries: nobody can enter on a runner's behalf.
#[test]
fn enter_requires_the_runners_authorization() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let runner = w.runner();

    w.env.mock_auths(&[]);
    assert_eq!(
        w.records().try_enter(
            &runner,
            &event_id,
            &category_id,
            &vec![&w.env],
            &phash(&w.env, 1)
        ),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        0
    );
    assert_eq!(w.records().total_supply(), 0);
}

/// The error bands are load-bearing, so they get their own test.
///
/// A Soroban `ScError` is a bare `u32` with **no contract identity**, and
/// `enter` propagates reverts from EventRegistry and from a SEP-41 token
/// untouched. Disjoint bands per contract are the only thing that lets a
/// client read `Error(Contract, #N)` and know which contract raised it:
///
///   1..=99    EventRegistry (C1)
///   100..=199 RaceRecord (C2)
///   200+      OpenZeppelin `NonFungibleTokenError`
///
/// This fails the moment anyone reintroduces an overlap.
#[test]
fn error_codes_of_the_two_contracts_are_disjoint_bands() {
    // Every variant of both enums, listed exhaustively on purpose: adding a
    // variant without adding it here is caught by the count assertions below.
    let registry: std::vec::Vec<u32> = std::vec![
        event_registry::Error::NotInitialized as u32,
        event_registry::Error::EventNotFound as u32,
        event_registry::Error::CategoryNotFound as u32,
        event_registry::Error::EventNotOpen as u32,
        event_registry::Error::QuotaFull as u32,
        event_registry::Error::RaceRecordNotSet as u32,
        event_registry::Error::RaceRecordAlreadySet as u32,
        event_registry::Error::InvalidQuota as u32,
        event_registry::Error::InvalidPrice as u32,
        event_registry::Error::InvalidDistance as u32,
        event_registry::Error::InvalidStatus as u32,
        event_registry::Error::ScannerAlreadyAdded as u32,
        event_registry::Error::ScannerNotFound as u32,
        event_registry::Error::AddOnNotFound as u32,
        event_registry::Error::AddOnQuotaFull as u32,
    ];
    let record: std::vec::Vec<u32> = std::vec![
        Error::NotInitialized as u32,
        Error::RecordNotFound as u32,
        Error::AlreadyClaimed as u32,
        Error::InvalidState as u32,
        Error::NotAuthorized as u32,
        Error::InvalidFinishTime as u32,
        Error::TooManyAddOns as u32,
        Error::DuplicateAddOn as u32,
    ];

    for code in &registry {
        assert!(
            (1..100).contains(code),
            "EventRegistry code {code} is outside the 1..=99 band"
        );
    }
    for code in &record {
        assert!(
            (100..200).contains(code),
            "RaceRecord code {code} is outside the 100..=199 band"
        );
    }
    for r in &registry {
        for c in &record {
            assert_ne!(
                r, c,
                "code {r} is claimed by both contracts — a propagated revert \
                 out of `enter` would be ambiguous again"
            );
        }
    }

    // OpenZeppelin owns 200+; nothing of ours may stray into it.
    assert!(NonFungibleTokenError::NonExistentToken as u32 >= 200);
    assert!(NonFungibleTokenError::SymbolMaxLenExceeded as u32 >= 200);
    assert!(record.iter().all(|c| *c < 200));

    // The lists above must stay exhaustive for the checks to mean anything.
    assert_eq!(registry.len(), 15, "EventRegistry gained an error variant");
    assert_eq!(record.len(), 8, "RaceRecord gained an error variant");
}

/// A `Draft` or `Closed` event reverts inside `reserve_slot` and that revert
/// travels all the way out of `enter` — unambiguously, thanks to the error
/// bands: the wire value is `EventRegistry::EventNotOpen`, which sits in C1's
/// 1..=99 band and therefore does not decode into RaceRecord's enum at all.
/// A client sees `InvokeError::Contract(4)` and knows exactly where it came
/// from.
#[test]
fn enter_on_a_non_open_event_propagates_event_not_open() {
    for status in [
        EventStatus::Draft,
        EventStatus::Closed,
        EventStatus::Completed,
    ] {
        let w = World::new();
        let (event_id, category_id) = w.event_with_status(5, PRICE, status);
        let runner = w.runner();

        w.env.mock_all_auths();
        assert_eq!(
            w.records().try_enter(
                &runner,
                &event_id,
                &category_id,
                &vec![&w.env],
                &phash(&w.env, 1)
            ),
            Err(Err(InvokeError::Contract(
                event_registry::Error::EventNotOpen as u32
            )))
        );
        assert_eq!(
            w.registry()
                .get_category(&event_id, &category_id)
                .entered_count,
            0
        );
        assert_eq!(w.records().total_supply(), 0);
        assert_eq!(w.token().balance(&w.organiser), 0);
    }
}

/// Same propagation story for a full category: the wire code is
/// `EventRegistry::QuotaFull`, again from C1's band, again unmistakable.
#[test]
fn enter_when_the_category_is_full_propagates_quota_full() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(1, PRICE);
    w.enter(&w.runner(), event_id, category_id, 1);

    let latecomer = w.runner();
    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_enter(
            &latecomer,
            &event_id,
            &category_id,
            &vec![&w.env],
            &phash(&w.env, 2)
        ),
        Err(Err(InvokeError::Contract(
            event_registry::Error::QuotaFull as u32
        )))
    );

    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        1
    );
    assert_eq!(w.records().total_supply(), 1);
    assert_eq!(w.token().balance(&latecomer), FUNDING);
    assert_eq!(w.records().balance(&latecomer), 0);
}

/// **The atomicity proof.** A runner who cannot pay must leave *no* trace: the
/// quota reservation and the mint that ran before the transfer are rolled back
/// with it, because the whole thing is one invocation.
#[test]
fn a_failed_payment_rolls_back_quota_and_mint() {
    for funding in [0i128, PRICE - 1] {
        let w = World::new();
        let (event_id, category_id) = w.open_event(5, PRICE);

        // No mint at all for `funding == 0`: the address has no balance entry
        // for this asset whatsoever, the contract-storage equivalent of a
        // runner with no trustline.
        let broke = Address::generate(&w.env);
        if funding > 0 {
            w.fund(&broke, funding);
        }

        w.env.mock_all_auths();
        let result = w.records().try_enter(
            &broke,
            &event_id,
            &category_id,
            &vec![&w.env],
            &phash(&w.env, 1),
        );
        // The Stellar Asset Contract's own `BalanceError` (built-in contract
        // error 10), propagated out of the nested `transfer`. A classic `G...`
        // account with no trustline would raise `TrustlineMissingError` (13) at
        // exactly the same point, with the same rollback.
        assert_eq!(
            result,
            Err(Err(InvokeError::Contract(10))),
            "an unpayable entry must revert inside the SAC transfer"
        );

        // Nothing survived the revert.
        assert_eq!(
            w.registry()
                .get_category(&event_id, &category_id)
                .entered_count,
            0,
            "quota must be released"
        );
        assert_eq!(w.records().total_supply(), 0, "no token may exist");
        assert_eq!(w.records().balance(&broke), 0);
        assert!(w.records().records_of(&broke).is_empty());
        assert_eq!(
            w.records().try_record_of(&0),
            Err(Ok(Error::RecordNotFound))
        );
        assert_eq!(w.token().balance(&broke), funding, "the fee was not taken");
        assert_eq!(w.token().balance(&w.organiser), 0);

        // And the slot is still there for someone who can pay — with bib 1,
        // because the rolled-back entry consumed no number either.
        let solvent = w.runner();
        assert_eq!(w.enter(&solvent, event_id, category_id, 2), 0);
        assert_eq!(w.records().record_of(&0).bib_no, 1);
    }
}

#[test]
fn claim_racepack_twice_reverts_already_claimed() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    w.env.mock_all_auths();
    let records = w.records();
    records.claim_racepack(&token_id, &w.organiser);
    let claimed_at = records.record_of(&token_id).claimed_at;

    w.env.ledger().set_timestamp(NOW + 900);
    assert_eq!(
        records.try_claim_racepack(&token_id, &w.organiser),
        Err(Ok(Error::AlreadyClaimed))
    );
    // The second desk changed nothing at all.
    assert_eq!(
        records.record_of(&token_id).state,
        RecordState::RacepackClaimed
    );
    assert_eq!(records.record_of(&token_id).claimed_at, claimed_at);
}

#[test]
fn claim_racepack_rejects_a_stranger() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);
    let stranger = Address::generate(&w.env);

    // The stranger signs for themselves — a valid signature, no authority.
    w.env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "claim_racepack",
            args: (token_id, stranger.clone()).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        w.records().try_claim_racepack(&token_id, &stranger),
        Err(Ok(Error::NotAuthorized))
    );
    assert_eq!(w.records().record_of(&token_id).state, RecordState::Entered);
}

#[test]
fn claim_racepack_rejects_a_removed_scanner() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);
    let scanner = Address::generate(&w.env);

    w.env.mock_all_auths();
    w.registry().add_scanner(&event_id, &scanner);
    w.registry().remove_scanner(&event_id, &scanner);

    w.env.mock_auths(&[MockAuth {
        address: &scanner,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "claim_racepack",
            args: (token_id, scanner.clone()).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        w.records().try_claim_racepack(&token_id, &scanner),
        Err(Ok(Error::NotAuthorized))
    );
    assert_eq!(w.records().record_of(&token_id).state, RecordState::Entered);
}

/// A runner who never collected a race pack cannot receive a finish time.
#[test]
fn record_finish_before_claim_reverts_invalid_state() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_record_finish(&token_id, &3_600),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(w.records().record_of(&token_id).state, RecordState::Entered);
    assert_eq!(w.records().record_of(&token_id).finish_time_s, None);
}

#[test]
fn record_finish_rejects_a_non_organiser() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);
    let impostor = Address::generate(&w.env);

    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);

    // The impostor signs; the contract requires the organiser stored on the
    // registry, so no entry matches.
    w.env.mock_auths(&[MockAuth {
        address: &impostor,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "record_finish",
            args: (token_id, 3_600u32).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        w.records().try_record_finish(&token_id, &3_600),
        Err(Err(InvokeError::Abort))
    );

    w.env.mock_auths(&[MockAuth {
        address: &impostor,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "record_dnf",
            args: (token_id,).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        w.records().try_record_dnf(&token_id),
        Err(Err(InvokeError::Abort))
    );

    assert_eq!(
        w.records().record_of(&token_id).state,
        RecordState::RacepackClaimed
    );
}

#[test]
fn record_finish_twice_reverts_invalid_state() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    w.env.mock_all_auths();
    let records = w.records();
    records.claim_racepack(&token_id, &w.organiser);
    records.record_finish(&token_id, &3_600);

    assert_eq!(
        records.try_record_finish(&token_id, &1_800),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(records.record_of(&token_id).finish_time_s, Some(3_600));
}

#[test]
fn record_finish_rejects_a_zero_finish_time() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    w.env.mock_all_auths();
    let records = w.records();
    records.claim_racepack(&token_id, &w.organiser);

    assert_eq!(
        records.try_record_finish(&token_id, &0),
        Err(Ok(Error::InvalidFinishTime))
    );
    assert_eq!(
        records.record_of(&token_id).state,
        RecordState::RacepackClaimed
    );
}

#[test]
fn record_dnf_rejects_terminal_states() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let finished = w.enter(&w.runner(), event_id, category_id, 1);
    let dnf = w.enter(&w.runner(), event_id, category_id, 2);

    w.env.mock_all_auths();
    let records = w.records();
    records.claim_racepack(&finished, &w.organiser);
    records.record_finish(&finished, &3_600);
    records.record_dnf(&dnf);

    assert_eq!(
        records.try_record_dnf(&finished),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(records.try_record_dnf(&dnf), Err(Ok(Error::InvalidState)));
    // A DNF'd record can never be resurrected into a finish either.
    assert_eq!(
        records.try_record_finish(&dnf, &3_600),
        Err(Ok(Error::InvalidState))
    );

    assert_eq!(records.record_of(&finished).state, RecordState::Finished);
    assert_eq!(records.record_of(&dnf).state, RecordState::Dnf);
}

#[test]
fn unknown_token_ids_revert_record_not_found() {
    let w = World::new();
    let (_event_id, _category_id) = w.open_event(5, PRICE);

    w.env.mock_all_auths();
    let records = w.records();
    assert_eq!(records.try_record_of(&404), Err(Ok(Error::RecordNotFound)));
    assert_eq!(
        records.try_extend_record_ttl(&404),
        Err(Ok(Error::RecordNotFound))
    );
    assert_eq!(
        records.try_claim_racepack(&404, &w.organiser),
        Err(Ok(Error::RecordNotFound))
    );
    assert_eq!(
        records.try_record_finish(&404, &3_600),
        Err(Ok(Error::RecordNotFound))
    );
    assert_eq!(records.try_record_dnf(&404), Err(Ok(Error::RecordNotFound)));
}

/// `verify` is a public, wallet-less read that third parties call
/// speculatively, so a miss is `false` — never a panic.
#[test]
fn verify_is_false_for_a_wrong_hash_or_unknown_token() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 42);

    let records = w.records();
    assert!(!records.verify(&token_id, &phash(&w.env, 43)));
    assert!(!records.verify(&404, &phash(&w.env, 42)));
    assert!(!records.verify(&404, &phash(&w.env, 43)));
}

/// `verify` is documented as "hash **and owner** match", so it checks both.
///
/// The two halves cannot come apart through the exported surface — `enter`
/// mints and writes the record in one invocation, and nothing burns — so the
/// only way to exercise the owner half is to fabricate the impossible state
/// with a direct storage write. `record_of` still returns the fabricated
/// record; `verify` refuses it.
#[test]
fn verify_requires_the_token_to_still_have_an_owner() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let real = w.enter(&w.runner(), event_id, category_id, 42);

    const ORPHAN: u32 = 777;
    let orphan_record = RecordData {
        event_id,
        category_id,
        bib_no: 0,
        addon_ids: vec![&w.env],
        participant_hash: phash(&w.env, 42),
        state: RecordState::Entered,
        entered_at: NOW,
        claimed_at: None,
        finish_time_s: None,
        result_at: None,
    };
    w.env.as_contract(&w.contract, || {
        w.env
            .storage()
            .persistent()
            .set(&DataKey::Record(ORPHAN), &orphan_record);
    });

    let records = w.records();
    // Same hash, and the record really is readable...
    assert_eq!(records.record_of(&ORPHAN), orphan_record);
    assert_eq!(records.record_of(&real).participant_hash, phash(&w.env, 42));
    // ...but nobody owns it, so it verifies as false rather than panicking.
    assert!(!records.verify(&ORPHAN, &phash(&w.env, 42)));
    // The genuinely minted record, with both halves present, still verifies.
    assert!(records.verify(&real, &phash(&w.env, 42)));
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

/// `price_usdc == 0` skips the SEP-41 call entirely, so a free entry works for
/// a runner holding no sUSD — and, on a classic `G...` account, with no
/// trustline for it at all.
#[test]
fn a_free_category_skips_the_transfer_entirely() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, 0);
    let penniless = Address::generate(&w.env);

    let token_id = w.enter(&penniless, event_id, category_id, 1);

    assert_eq!(w.records().owner_of(&token_id), penniless);
    assert_eq!(w.records().record_of(&token_id).state, RecordState::Entered);
    assert_eq!(w.token().balance(&penniless), 0);
    assert_eq!(
        w.token().balance(&w.organiser),
        0,
        "a free entry must not move any token"
    );
    // No SAC event was emitted at all — the whole invocation only touched the
    // registry and this contract.
    assert!(w
        .env
        .events()
        .all()
        .filter_by_contract(&w.token)
        .events()
        .is_empty());
}

#[test]
fn two_runners_in_one_category_get_distinct_tokens_and_bibs() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let alice = w.runner();
    let bob = w.runner();

    let alice_token = w.enter(&alice, event_id, category_id, 1);
    let bob_token = w.enter(&bob, event_id, category_id, 2);

    assert_ne!(alice_token, bob_token);
    let records = w.records();
    assert_ne!(
        records.record_of(&alice_token).bib_no,
        records.record_of(&bob_token).bib_no
    );
    assert_eq!(records.records_of(&alice), vec![&w.env, alice_token]);
    assert_eq!(records.records_of(&bob), vec![&w.env, bob_token]);
}

#[test]
fn one_runner_two_events_owns_two_records() {
    let w = World::new();
    let (first_event, first_cat) = w.open_event(5, PRICE);
    let (second_event, second_cat) = w.open_event(5, 0);
    let runner = w.runner();

    w.enter(&runner, first_event, first_cat, 1);
    w.enter(&runner, second_event, second_cat, 2);

    assert_eq!(w.records().balance(&runner), 2);
    assert_eq!(w.records().records_of(&runner).len(), 2);
    // Only the paid event took money.
    assert_eq!(w.token().balance(&runner), FUNDING - PRICE);
}

/// `extend_record_ttl` is deliberately ungated: a runner's history has to
/// outlive the event, so anyone may pay its rent. Enforcing auth mode with no
/// entries at all proves there is no gate to satisfy.
#[test]
fn extend_record_ttl_is_permissionless() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    w.env.mock_auths(&[]);
    w.records().extend_record_ttl(&token_id);

    assert!(w.env.auths().is_empty(), "no authorization was consumed");
}

#[test]
fn writes_extend_record_and_instance_ttl() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    assert_eq!(
        persistent_ttl(&w.env, &w.contract, DataKey::Record(token_id)),
        BUMP_TO
    );
    assert_eq!(
        w.env
            .as_contract(&w.contract, || w.env.storage().instance().get_ttl()),
        BUMP_TO
    );
}

/// The keeper story, end to end: let a record's rent decay past the bump
/// threshold, then have anyone top it back up.
#[test]
fn extend_record_ttl_restores_a_decayed_ttl() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);
    let key = DataKey::Record(token_id);

    // `extend_ttl` is a no-op above the threshold, so the decay has to cross it
    // for the test to mean anything.
    let aged_by = (BUMP_TO - BUMP_THRESHOLD) + DAY_IN_LEDGERS;
    w.env
        .ledger()
        .set_sequence_number(w.env.ledger().sequence() + aged_by);

    let decayed = persistent_ttl(&w.env, &w.contract, key.clone());
    assert_eq!(decayed, BUMP_TO - aged_by);
    assert!(decayed < BUMP_THRESHOLD);

    w.env.mock_auths(&[]);
    w.records().extend_record_ttl(&token_id);

    assert_eq!(persistent_ttl(&w.env, &w.contract, key), BUMP_TO);
    assert_eq!(
        w.env
            .as_contract(&w.contract, || w.env.storage().instance().get_ttl()),
        BUMP_TO
    );
}

/// A lifecycle write re-extends a decayed record too, not just the dedicated
/// top-up.
#[test]
fn a_lifecycle_write_re_extends_a_decayed_ttl() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);
    let key = DataKey::Record(token_id);

    let aged_by = (BUMP_TO - BUMP_THRESHOLD) + DAY_IN_LEDGERS;
    w.env
        .ledger()
        .set_sequence_number(w.env.ledger().sequence() + aged_by);
    assert!(persistent_ttl(&w.env, &w.contract, key.clone()) < BUMP_THRESHOLD);

    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);

    assert_eq!(persistent_ttl(&w.env, &w.contract, key), BUMP_TO);
}
// ---------------------------------------------------------------------------
// The Soroban host vs. the frozen spec (STE-10, C4)
//
// `docs/specs/` freezes `participant_hash` and proves two off-chain reference
// implementations (Node + Rust) agree on it. That is only worth something if
// the value they compute is also the value the CHAIN accepts, so this module
// closes the loop from the third side: it reads the SAME
// `docs/specs/vectors/participant_hash.json`, runs each preimage through
// `env.crypto().sha256()` — the host function, not a Rust crate — and feeds the
// result into `enter` + `verify`.
//
// Nothing here restates an expected hash. Every value comes out of the JSON, so
// this can only pass by genuinely agreeing with the frozen artifact.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Paid add-ons (v2, STE-35)
// ---------------------------------------------------------------------------

/// The headline: one invocation charges the category price plus every add-on
/// price as a SINGLE transfer, and the record says what was bought.
#[test]
fn enter_charges_the_category_and_every_add_on_in_one_transfer() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    let token_id = w.enter_with(
        &runner,
        event_id,
        category_id,
        vec![&w.env, jersey, tumbler],
        1,
    );

    // Read the event log first: `env.events().all()` reports the most recent
    // invocation, and a balance query is an invocation.
    let all = w.env.events().all();
    assert_eq!(
        all.filter_by_contract(&w.token).events().len(),
        1,
        "the basket must move as one transfer, not one per line item"
    );

    let total = PRICE + JERSEY + TUMBLER;
    assert_eq!(w.token().balance(&w.organiser), total);
    assert_eq!(w.token().balance(&runner), FUNDING - total);

    let record = w.records().record_of(&token_id);
    assert_eq!(record.addon_ids, vec![&w.env, jersey, tumbler]);
    assert_eq!(record.bib_no, 1);
    assert_eq!(record.state, RecordState::Entered);

    // Stock came off both add-ons, once each.
    assert_eq!(w.registry().get_addon(&event_id, &jersey).reserved_count, 1);
    assert_eq!(
        w.registry().get_addon(&event_id, &tumbler).reserved_count,
        1
    );
}

/// The auth tree the runner signs covers the summed transfer, not a per-item
/// one — the wallet shows a single amount and that amount is what moves.
#[test]
fn the_signed_auth_tree_covers_the_summed_transfer() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, _tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();
    let hash = phash(&w.env, 2);
    let addons: Vec<u32> = vec![&w.env, jersey];
    let total = PRICE + JERSEY;

    w.env.mock_auths(&[MockAuth {
        address: &runner,
        invoke: &MockAuthInvoke {
            contract: &w.contract,
            fn_name: "enter",
            args: (
                runner.clone(),
                event_id,
                category_id,
                addons.clone(),
                hash.clone(),
            )
                .into_val(&w.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &w.token,
                fn_name: "transfer",
                args: (runner.clone(), w.organiser.clone(), total).into_val(&w.env),
                sub_invokes: &[],
            }],
        },
    }]);

    let token_id = w
        .records()
        .enter(&runner, &event_id, &category_id, &addons, &hash);
    assert_eq!(w.records().owner_of(&token_id), runner);
    assert_eq!(w.token().balance(&w.organiser), total);
}

#[test]
fn an_entry_without_add_ons_still_pays_only_the_category_price() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, _tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    let token_id = w.enter(&runner, event_id, category_id, 1);

    assert_eq!(w.token().balance(&w.organiser), PRICE);
    assert!(w.records().record_of(&token_id).addon_ids.is_empty());
    assert_eq!(w.registry().get_addon(&event_id, &jersey).reserved_count, 0);
}

/// A free category plus a paid add-on still moves money — the skip is about the
/// TOTAL being zero, not about the category being free.
#[test]
fn a_free_category_with_a_paid_add_on_still_charges_the_add_on() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, 0);
    let (jersey, _tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    w.enter_with(&runner, event_id, category_id, vec![&w.env, jersey], 1);

    assert_eq!(w.token().balance(&w.organiser), JERSEY);
}

/// ...and a free add-on on a free category still skips the token entirely, so a
/// runner with no balance and no trustline can take one.
#[test]
fn a_free_basket_skips_the_transfer_entirely() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, 0);
    let bib_belt = w.add_addon(event_id, symbol_short!("BIBBELT"), 0, 10);
    let penniless = Address::generate(&w.env);

    let token_id = w.enter_with(&penniless, event_id, category_id, vec![&w.env, bib_belt], 1);

    assert_eq!(w.records().owner_of(&token_id), penniless);
    assert_eq!(w.records().record_of(&token_id).addon_ids.len(), 1);
    assert!(w
        .env
        .events()
        .all()
        .filter_by_contract(&w.token)
        .events()
        .is_empty());
    // The quota still came off: free does not mean unlimited.
    assert_eq!(
        w.registry().get_addon(&event_id, &bib_belt).reserved_count,
        1
    );
}

// -- all-or-nothing ---------------------------------------------------------

/// A sold-out add-on takes the WHOLE entry down with it. The runner asked for a
/// place *and* a tumbler; giving them a place without the tumbler and keeping
/// their money would be a different purchase from the one they signed.
#[test]
fn a_sold_out_add_on_rolls_back_the_slot_the_fee_and_the_mint() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);

    // The single tumbler goes to the first runner.
    let first = w.runner();
    w.enter_with(&first, event_id, category_id, vec![&w.env, tumbler], 1);
    let organiser_after_first = w.token().balance(&w.organiser);

    let latecomer = w.runner();
    w.env.mock_all_auths();
    let result = w.records().try_enter(
        &latecomer,
        &event_id,
        &category_id,
        &vec![&w.env, jersey, tumbler],
        &phash(&w.env, 2),
    );

    // EventRegistry's AddOnQuotaFull(15), propagated out of `enter` untouched —
    // the band says the number came from C1.
    assert_eq!(result, Err(Err(InvokeError::Contract(15))));

    // Nothing of the second entry survived.
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        1,
        "the category slot must be released"
    );
    assert_eq!(
        w.registry().get_addon(&event_id, &jersey).reserved_count,
        0,
        "the jersey reserved earlier in the same call must be released too"
    );
    assert_eq!(w.records().total_supply(), 1, "no second token may exist");
    assert_eq!(w.records().balance(&latecomer), 0);
    assert_eq!(w.token().balance(&latecomer), FUNDING, "no fee was taken");
    assert_eq!(w.token().balance(&w.organiser), organiser_after_first);
}

/// The money leg fails *after* the add-on reservations, so the rollback has to
/// reach back through them. A runner who cannot cover category + add-ons leaves
/// no stock consumed anywhere.
#[test]
fn a_failed_payment_rolls_back_the_add_on_reservations_too() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);

    // Enough for the entry, not enough for the entry plus both add-ons — so the
    // failure is caused by the add-ons and lands in the SAC transfer.
    let short = Address::generate(&w.env);
    w.fund(&short, PRICE + JERSEY + TUMBLER - 1);

    w.env.mock_all_auths();
    let result = w.records().try_enter(
        &short,
        &event_id,
        &category_id,
        &vec![&w.env, jersey, tumbler],
        &phash(&w.env, 1),
    );

    assert_eq!(
        result,
        Err(Err(InvokeError::Contract(10))),
        "the SAC's BalanceError, raised inside the nested transfer"
    );
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        0
    );
    assert_eq!(w.registry().get_addon(&event_id, &jersey).reserved_count, 0);
    assert_eq!(
        w.registry().get_addon(&event_id, &tumbler).reserved_count,
        0
    );
    assert_eq!(w.records().total_supply(), 0);
    assert_eq!(w.token().balance(&short), PRICE + JERSEY + TUMBLER - 1);
    assert_eq!(w.token().balance(&w.organiser), 0);

    // And the stock is all still there for someone who can pay for it.
    let solvent = w.runner();
    let token_id = w.enter_with(
        &solvent,
        event_id,
        category_id,
        vec![&w.env, jersey, tumbler],
        2,
    );
    assert_eq!(
        w.records().record_of(&token_id).addon_ids,
        vec![&w.env, jersey, tumbler]
    );
}

// -- validation -------------------------------------------------------------

#[test]
fn enter_rejects_a_repeated_addon_id() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, _tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    w.env.mock_all_auths();
    let result = w.records().try_enter(
        &runner,
        &event_id,
        &category_id,
        &vec![&w.env, jersey, jersey],
        &phash(&w.env, 1),
    );

    assert_eq!(result, Err(Ok(Error::DuplicateAddOn)));
    // Rejected before any state was touched: not the category, not the stock.
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        0
    );
    assert_eq!(w.registry().get_addon(&event_id, &jersey).reserved_count, 0);
    assert_eq!(w.token().balance(&runner), FUNDING);
}

#[test]
fn enter_rejects_more_add_ons_than_the_event_has() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    // Two add-ons exist; three ids cannot be honest, whatever they name.
    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_enter(
            &runner,
            &event_id,
            &category_id,
            &vec![&w.env, jersey, tumbler, 99],
            &phash(&w.env, 1),
        ),
        Err(Ok(Error::TooManyAddOns))
    );

    // An event with no add-ons at all rejects even a single id.
    let (bare_event, bare_category) = w.open_event(5, PRICE);
    assert_eq!(
        w.records().try_enter(
            &runner,
            &bare_event,
            &bare_category,
            &vec![&w.env, 0],
            &phash(&w.env, 1),
        ),
        Err(Ok(Error::TooManyAddOns))
    );
}

/// The bound that does not depend on registry state: even an organiser who
/// publishes more than `MAX_ADDONS_PER_ENTRY` add-ons cannot make one entry
/// loop past it.
#[test]
fn enter_rejects_more_add_ons_than_the_hard_ceiling() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, 0);
    let mut ids: Vec<u32> = vec![&w.env];
    for _ in 0..(MAX_ADDONS_PER_ENTRY + 1) {
        ids.push_back(w.add_addon(event_id, symbol_short!("EXTRA"), 0, 100));
    }
    assert_eq!(
        w.registry().addon_count(&event_id),
        MAX_ADDONS_PER_ENTRY + 1
    );
    let runner = w.runner();

    w.env.mock_all_auths();
    assert_eq!(
        w.records()
            .try_enter(&runner, &event_id, &category_id, &ids, &phash(&w.env, 1)),
        Err(Ok(Error::TooManyAddOns))
    );

    // One fewer is exactly at the ceiling and goes through.
    ids.pop_back();
    assert_eq!(ids.len(), MAX_ADDONS_PER_ENTRY);
    let token_id = w
        .records()
        .enter(&runner, &event_id, &category_id, &ids, &phash(&w.env, 1));
    assert_eq!(
        w.records().record_of(&token_id).addon_ids.len(),
        MAX_ADDONS_PER_ENTRY
    );
}

#[test]
fn enter_propagates_add_on_not_found_for_an_unknown_id() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (_jersey, _tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    // Within the length bound, but id 7 does not exist.
    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_enter(
            &runner,
            &event_id,
            &category_id,
            &vec![&w.env, 7],
            &phash(&w.env, 1),
        ),
        Err(Err(InvokeError::Contract(14))),
        "EventRegistry's AddOnNotFound(14), propagated untouched"
    );
    assert_eq!(
        w.registry()
            .get_category(&event_id, &category_id)
            .entered_count,
        0
    );
    assert_eq!(w.records().total_supply(), 0);
}

/// Two runners can buy the same add-on while stock lasts, and each record says
/// so on its own.
#[test]
fn two_runners_can_buy_the_same_add_on_while_stock_lasts() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, _tumbler) = w.jersey_and_tumbler(event_id);
    let alice = w.runner();
    let bob = w.runner();

    let a = w.enter_with(&alice, event_id, category_id, vec![&w.env, jersey], 1);
    let b = w.enter_with(&bob, event_id, category_id, vec![&w.env, jersey], 2);

    assert_ne!(a, b);
    assert_eq!(w.records().record_of(&a).addon_ids, vec![&w.env, jersey]);
    assert_eq!(w.records().record_of(&b).addon_ids, vec![&w.env, jersey]);
    assert_eq!(w.registry().get_addon(&event_id, &jersey).reserved_count, 2);
    assert_eq!(w.token().balance(&w.organiser), 2 * (PRICE + JERSEY));

    // Quota was 2, so the third buyer is refused — and refused entirely.
    let carol = w.runner();
    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_enter(
            &carol,
            &event_id,
            &category_id,
            &vec![&w.env, jersey],
            &phash(&w.env, 3),
        ),
        Err(Err(InvokeError::Contract(15)))
    );
    assert_eq!(w.records().total_supply(), 2);
}

/// The add-on purchase survives the rest of the lifecycle: the merch desk can
/// still read it after the race is finished.
#[test]
fn add_ons_stay_on_the_record_through_the_whole_lifecycle() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    let token_id = w.enter_with(
        &runner,
        event_id,
        category_id,
        vec![&w.env, jersey, tumbler],
        1,
    );

    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);
    w.records().record_finish(&token_id, &3_161);

    let record = w.records().record_of(&token_id);
    assert_eq!(record.state, RecordState::Finished);
    assert_eq!(record.addon_ids, vec![&w.env, jersey, tumbler]);
}

/// The frozen emission order, with add-ons in it: the registry now also emits
/// one `addon_reserved` per unit, before the single SAC transfer.
#[test]
fn an_entry_with_add_ons_emits_one_addon_reserved_per_unit_before_the_transfer() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);
    let runner = w.runner();

    w.enter_with(
        &runner,
        event_id,
        category_id,
        vec![&w.env, jersey, tumbler],
        1,
    );

    let all = w.env.events().all();
    let seq = all.events();
    assert_eq!(
        event_names(seq),
        std::vec![
            "slot_reserved",
            "add_on_reserved",
            "add_on_reserved",
            "transfer",
            "mint",
            "record_entered"
        ],
    );

    // Positions 0-2 are EventRegistry's, so an indexer that keys on contract id
    // sees the add-on units without having to guess offsets.
    assert_eq!(all.filter_by_contract(&w.registry).events(), &seq[0..3]);
    assert_eq!(all.filter_by_contract(&w.token).events(), &seq[3..4]);
    assert_eq!(all.filter_by_contract(&w.contract).events(), &seq[4..6]);
}

// ---------------------------------------------------------------------------
// Untimed finish (v2.2, STE-41)
//
// `record_finish_untimed` is a twin of `record_finish` with no time: same
// organiser gate, same `RacepackClaimed` guard, same terminal `Finished`. What
// these tests hold down is that the twin really is a twin — and that the timed
// path it sits beside did not move at all.
// ---------------------------------------------------------------------------

impl World {
    /// A runner entered and checked in, ready for a result.
    fn claimed(&self, event_id: u32, category_id: u32, seed: u8) -> u32 {
        let token_id = self.enter(&self.runner(), event_id, category_id, seed);
        self.env.mock_all_auths();
        self.records().claim_racepack(&token_id, &self.organiser);
        token_id
    }

    /// The organiser signing exactly one `record_finish_untimed`, in enforcing
    /// auth mode.
    fn mock_organiser_untimed(&self, signer: &Address, token_id: u32) {
        self.env.mock_auths(&[MockAuth {
            address: signer,
            invoke: &MockAuthInvoke {
                contract: &self.contract,
                fn_name: "record_finish_untimed",
                args: (token_id,).into_val(&self.env),
                sub_invokes: &[],
            },
        }]);
    }
}

/// `enter` -> `claim_racepack` -> `record_finish_untimed`, organiser signing in
/// enforcing mode. The result is `Finished` with `finish_time_s == None` —
/// which is the on-chain marker for "finished, no official time".
#[test]
fn record_finish_untimed_finishes_with_no_time() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let runner = w.runner();
    let token_id = w.enter(&runner, event_id, category_id, 3);

    w.env.ledger().set_timestamp(NOW + 60);
    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);

    w.env.ledger().set_timestamp(NOW + 7_200);
    w.mock_organiser_untimed(&w.organiser, token_id);
    w.records().record_finish_untimed(&token_id);

    assert_eq!(
        w.records().record_of(&token_id),
        RecordData {
            event_id,
            category_id,
            bib_no: 1,
            addon_ids: vec![&w.env],
            participant_hash: phash(&w.env, 3),
            state: RecordState::Finished,
            entered_at: NOW,
            claimed_at: Some(NOW + 60),
            finish_time_s: None,
            result_at: Some(NOW + 7_200),
        }
    );
    // Ownership never moved, and the record still verifies.
    assert_eq!(w.records().owner_of(&token_id), runner);
    assert!(w.records().verify(&token_id, &phash(&w.env, 3)));
}

#[test]
fn emits_record_finished_untimed_and_not_record_finished() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.claimed(event_id, category_id, 10);

    w.env.mock_all_auths();
    w.records().record_finish_untimed(&token_id);

    // Exactly one event, and it is the new one: an indexer that only knows
    // `record_finished` must never see a `0` it would read as a time.
    let events = w.env.events().all().filter_by_contract(&w.contract);
    assert_eq!(
        events,
        std::vec![RecordFinishedUntimed { token_id, event_id }.to_xdr(&w.env, &w.contract)]
    );
    assert_eq!(event_names(events.events()), ["record_finished_untimed"]);
    // All fields are topics, so the data map is empty — the `RecordDnf` shape.
    let ContractEventBody::V0(body) = &events.events()[0].body;
    assert_eq!(body.topics.len(), 3);
    assert_eq!(
        body.data,
        ScVal::Map(Some(soroban_sdk::xdr::ScMap::default()))
    );
}

/// A runner who never collected a race pack cannot finish, timed or not.
#[test]
fn record_finish_untimed_before_claim_reverts_invalid_state() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.enter(&w.runner(), event_id, category_id, 1);

    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_record_finish_untimed(&token_id),
        Err(Ok(Error::InvalidState))
    );
    let record = w.records().record_of(&token_id);
    assert_eq!(record.state, RecordState::Entered);
    assert_eq!(record.result_at, None);
}

#[test]
fn record_finish_untimed_rejects_a_non_organiser() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.claimed(event_id, category_id, 1);
    let impostor = Address::generate(&w.env);

    w.mock_organiser_untimed(&impostor, token_id);
    assert_eq!(
        w.records().try_record_finish_untimed(&token_id),
        Err(Err(InvokeError::Abort))
    );

    // The runner cannot declare their own finish either.
    let runner = w.records().owner_of(&token_id);
    w.mock_organiser_untimed(&runner, token_id);
    assert_eq!(
        w.records().try_record_finish_untimed(&token_id),
        Err(Err(InvokeError::Abort))
    );

    assert_eq!(
        w.records().record_of(&token_id).state,
        RecordState::RacepackClaimed
    );
}

/// An allowlisted scanner may check a runner in, but a result is the
/// organiser's call — the same split as `record_finish`.
#[test]
fn record_finish_untimed_rejects_an_allowlisted_scanner() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.claimed(event_id, category_id, 1);
    let scanner = Address::generate(&w.env);
    w.env.mock_all_auths();
    w.registry().add_scanner(&event_id, &scanner);

    w.mock_organiser_untimed(&scanner, token_id);
    assert_eq!(
        w.records().try_record_finish_untimed(&token_id),
        Err(Err(InvokeError::Abort))
    );
    assert_eq!(
        w.records().record_of(&token_id).state,
        RecordState::RacepackClaimed
    );
}

/// `Finished` (timed or not) and `Dnf` are terminal, and an untimed finish is
/// no way out of either.
#[test]
fn record_finish_untimed_rejects_terminal_states() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let timed = w.claimed(event_id, category_id, 1);
    let dnf = w.claimed(event_id, category_id, 2);

    w.env.mock_all_auths();
    let records = w.records();
    records.record_finish(&timed, &3_600);
    records.record_dnf(&dnf);

    assert_eq!(
        records.try_record_finish_untimed(&timed),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        records.try_record_finish_untimed(&dnf),
        Err(Ok(Error::InvalidState))
    );
    // A published time is never erased into "no time".
    assert_eq!(records.record_of(&timed).finish_time_s, Some(3_600));
    assert_eq!(records.record_of(&dnf).state, RecordState::Dnf);
}

/// Once untimed-finished, every result path is closed: no time can be added
/// later, no DNF can replace it, and it cannot be finished twice.
#[test]
fn an_untimed_finish_is_terminal() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.claimed(event_id, category_id, 1);

    w.env.mock_all_auths();
    let records = w.records();
    records.record_finish_untimed(&token_id);
    let finished = records.record_of(&token_id);

    w.env.ledger().set_timestamp(NOW + 60);
    assert_eq!(
        records.try_record_finish(&token_id, &3_600),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        records.try_record_dnf(&token_id),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        records.try_record_finish_untimed(&token_id),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        records.try_claim_racepack(&token_id, &w.organiser),
        Err(Ok(Error::AlreadyClaimed))
    );
    // Not one field moved, `result_at` included.
    assert_eq!(records.record_of(&token_id), finished);
}

#[test]
fn record_finish_untimed_on_an_unknown_token_reverts_record_not_found() {
    let w = World::new();
    w.open_event(5, PRICE);

    w.env.mock_all_auths();
    assert_eq!(
        w.records().try_record_finish_untimed(&404),
        Err(Ok(Error::RecordNotFound))
    );
}

/// The two finish paths live side by side in one event without touching each
/// other: the timed one still emits `RecordFinished` with its time and still
/// refuses `0`, exactly as before v2.2.
#[test]
fn timed_and_untimed_finishes_coexist_and_the_timed_path_is_unchanged() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let timed = w.claimed(event_id, category_id, 1);
    let untimed = w.claimed(event_id, category_id, 2);

    w.env.mock_all_auths();
    let records = w.records();
    // Still refuses zero — `0` is not how "no time" is spelled.
    assert_eq!(
        records.try_record_finish(&timed, &0),
        Err(Ok(Error::InvalidFinishTime))
    );
    assert_eq!(
        records.record_of(&timed).state,
        RecordState::RacepackClaimed
    );

    records.record_finish(&timed, &2_750);
    assert_eq!(
        w.env.events().all().filter_by_contract(&w.contract),
        std::vec![RecordFinished {
            token_id: timed,
            event_id,
            finish_time_s: 2_750,
        }
        .to_xdr(&w.env, &w.contract)]
    );
    records.record_finish_untimed(&untimed);

    let timed_record = records.record_of(&timed);
    let untimed_record = records.record_of(&untimed);
    assert_eq!(timed_record.state, RecordState::Finished);
    assert_eq!(timed_record.finish_time_s, Some(2_750));
    assert_eq!(untimed_record.state, RecordState::Finished);
    assert_eq!(untimed_record.finish_time_s, None);
}

/// Add-ons bought at entry survive an untimed finish, like any other.
#[test]
fn an_untimed_finish_keeps_the_add_ons_on_the_record() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let (jersey, tumbler) = w.jersey_and_tumbler(event_id);
    let token_id = w.enter_with(
        &w.runner(),
        event_id,
        category_id,
        vec![&w.env, jersey, tumbler],
        1,
    );

    w.env.mock_all_auths();
    w.records().claim_racepack(&token_id, &w.organiser);
    w.records().record_finish_untimed(&token_id);

    let record = w.records().record_of(&token_id);
    assert_eq!(record.addon_ids, vec![&w.env, jersey, tumbler]);
    assert_eq!(record.state, RecordState::Finished);
}

/// The write re-extends the record's rent, like every other lifecycle write.
#[test]
fn record_finish_untimed_re_extends_a_decayed_ttl() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(5, PRICE);
    let token_id = w.claimed(event_id, category_id, 1);

    // Let the entry decay below the bump threshold, then finish.
    let seq = w.env.ledger().sequence();
    w.env
        .ledger()
        .set_sequence_number(seq + BUMP_TO - BUMP_THRESHOLD + DAY_IN_LEDGERS);
    let decayed = persistent_ttl(&w.env, &w.contract, DataKey::Record(token_id));
    assert!(decayed < BUMP_THRESHOLD, "fixture did not decay: {decayed}");

    w.env.mock_all_auths();
    w.records().record_finish_untimed(&token_id);
    assert_eq!(
        persistent_ttl(&w.env, &w.contract, DataKey::Record(token_id)),
        BUMP_TO
    );
}

// ---------------------------------------------------------------------------
// Many results in one call (v2.6, STE-60)
//
// `record_results` exists so an organiser signs once for a whole finish list
// instead of once per runner. What these tests hold down: every row obeys
// exactly the rules its single-call twin obeys, one bad row leaves the whole
// list unrecorded, a row from another race is refused, and what an indexer sees
// is the same events the single calls emit.
// ---------------------------------------------------------------------------
mod results {
    use super::*;
    use crate::{ResultEntry, ResultOutcome};

    fn row(token_id: u32, outcome: ResultOutcome) -> ResultEntry {
        ResultEntry { token_id, outcome }
    }

    impl World {
        /// The organiser signing exactly this batch, in enforcing auth mode.
        fn mock_batch(&self, signer: &Address, event_id: u32, rows: &Vec<ResultEntry>) {
            self.env.mock_auths(&[MockAuth {
                address: signer,
                invoke: &MockAuthInvoke {
                    contract: &self.contract,
                    fn_name: "record_results",
                    args: (event_id, rows.clone()).into_val(&self.env),
                    sub_invokes: &[],
                },
            }]);
        }
    }

    /// The ticket in one test: a timed finish, an untimed finish, a DNF after
    /// check-in and a no-show, recorded by one organiser signature, each record
    /// ending exactly as its single call would leave it.
    #[test]
    fn one_signature_records_a_mixed_finish_list() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let timed = w.claimed(event_id, category_id, 1);
        let untimed = w.claimed(event_id, category_id, 2);
        let dropped = w.claimed(event_id, category_id, 3);
        let no_show = w.enter(&w.runner(), event_id, category_id, 4);

        w.env.ledger().set_timestamp(NOW + 7_200);
        let rows = vec![
            &w.env,
            row(timed, ResultOutcome::Timed(3_161)),
            row(untimed, ResultOutcome::Untimed),
            row(dropped, ResultOutcome::Dnf),
            row(no_show, ResultOutcome::Dnf),
        ];
        w.mock_batch(&w.organiser, event_id, &rows);
        w.records().record_results(&event_id, &rows);

        let records = w.records();
        let t = records.record_of(&timed);
        assert_eq!(
            (t.state, t.finish_time_s, t.result_at),
            (RecordState::Finished, Some(3_161), Some(NOW + 7_200))
        );
        let u = records.record_of(&untimed);
        assert_eq!(
            (u.state, u.finish_time_s, u.result_at),
            (RecordState::Finished, None, Some(NOW + 7_200))
        );
        let d = records.record_of(&dropped);
        assert_eq!(
            (d.state, d.finish_time_s, d.result_at),
            (RecordState::Dnf, None, Some(NOW + 7_200))
        );
        let n = records.record_of(&no_show);
        assert_eq!(
            (n.state, n.claimed_at, n.result_at),
            (RecordState::Dnf, None, Some(NOW + 7_200))
        );
    }

    /// A batch leaves a record byte-for-byte as the single call would. Two
    /// worlds, the same entries, one recorded row by row and one in a batch.
    #[test]
    fn a_batch_writes_exactly_what_the_single_calls_write() {
        let single = World::new();
        let batch = World::new();
        let mut rows_for_batch = std::vec::Vec::new();
        for w in [&single, &batch] {
            let (event_id, category_id) = w.open_event(10, PRICE);
            let a = w.claimed(event_id, category_id, 1);
            let b = w.claimed(event_id, category_id, 2);
            let c = w.enter(&w.runner(), event_id, category_id, 3);
            w.env.ledger().set_timestamp(NOW + 5_000);
            rows_for_batch = std::vec![(event_id, a, b, c)];
        }
        let (event_id, a, b, c) = rows_for_batch[0];

        single.env.mock_all_auths();
        single.records().record_finish(&a, &2_900);
        single.records().record_finish_untimed(&b);
        single.records().record_dnf(&c);

        batch.env.mock_all_auths();
        batch.records().record_results(
            &event_id,
            &vec![
                &batch.env,
                row(a, ResultOutcome::Timed(2_900)),
                row(b, ResultOutcome::Untimed),
                row(c, ResultOutcome::Dnf),
            ],
        );

        for token_id in [a, b, c] {
            let one = single.records().record_of(&token_id);
            let many = batch.records().record_of(&token_id);
            assert_eq!(
                (
                    one.state,
                    one.finish_time_s,
                    one.claimed_at,
                    one.result_at,
                    one.bib_no
                ),
                (
                    many.state,
                    many.finish_time_s,
                    many.claimed_at,
                    many.result_at,
                    many.bib_no
                ),
                "token {token_id}"
            );
        }
    }

    /// The events are the single calls' events, one per row, in row order, so
    /// an indexer needs no new handler.
    #[test]
    fn emits_the_single_call_events_in_row_order() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let a = w.claimed(event_id, category_id, 1);
        let b = w.claimed(event_id, category_id, 2);
        let c = w.enter(&w.runner(), event_id, category_id, 3);

        w.env.mock_all_auths();
        w.records().record_results(
            &event_id,
            &vec![
                &w.env,
                row(b, ResultOutcome::Untimed),
                row(a, ResultOutcome::Timed(3_600)),
                row(c, ResultOutcome::Dnf),
            ],
        );

        let events = w.env.events().all().filter_by_contract(&w.contract);
        assert_eq!(
            events,
            std::vec![
                RecordFinishedUntimed {
                    token_id: b,
                    event_id
                }
                .to_xdr(&w.env, &w.contract),
                RecordFinished {
                    token_id: a,
                    event_id,
                    finish_time_s: 3_600
                }
                .to_xdr(&w.env, &w.contract),
                RecordDnf {
                    token_id: c,
                    event_id
                }
                .to_xdr(&w.env, &w.contract),
            ]
        );
    }

    /// Atomic: the last row is invalid, so the rows before it are not recorded
    /// either, and nothing is emitted.
    #[test]
    fn one_invalid_row_leaves_the_whole_list_unrecorded() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let a = w.claimed(event_id, category_id, 1);
        let b = w.claimed(event_id, category_id, 2);
        let never_claimed = w.enter(&w.runner(), event_id, category_id, 3);

        w.env.mock_all_auths();
        assert_eq!(
            w.records().try_record_results(
                &event_id,
                &vec![
                    &w.env,
                    row(a, ResultOutcome::Timed(3_000)),
                    row(b, ResultOutcome::Dnf),
                    row(never_claimed, ResultOutcome::Timed(3_100)),
                ],
            ),
            Err(Ok(Error::InvalidState))
        );
        assert_eq!(
            w.records().record_of(&a).state,
            RecordState::RacepackClaimed
        );
        assert_eq!(
            w.records().record_of(&b).state,
            RecordState::RacepackClaimed
        );
        assert_eq!(
            w.records().record_of(&never_claimed).state,
            RecordState::Entered
        );
        assert_eq!(
            w.env
                .events()
                .all()
                .filter_by_contract(&w.contract)
                .events(),
            &[]
        );
    }

    /// Every rule of the single calls holds per row.
    #[test]
    fn each_row_obeys_its_single_call_rules() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let claimed = w.claimed(event_id, category_id, 1);
        let entered = w.enter(&w.runner(), event_id, category_id, 2);
        let finished = w.claimed(event_id, category_id, 3);
        let dnf = w.enter(&w.runner(), event_id, category_id, 4);
        w.env.mock_all_auths();
        w.records().record_finish(&finished, &3_000);
        w.records().record_dnf(&dnf);

        let refused = |rows: Vec<ResultEntry>, expected: Error| {
            assert_eq!(
                w.records().try_record_results(&event_id, &rows),
                Err(Ok(expected))
            );
        };
        refused(
            vec![&w.env, row(claimed, ResultOutcome::Timed(0))],
            Error::InvalidFinishTime,
        );
        refused(
            vec![&w.env, row(entered, ResultOutcome::Timed(3_000))],
            Error::InvalidState,
        );
        refused(
            vec![&w.env, row(entered, ResultOutcome::Untimed)],
            Error::InvalidState,
        );
        refused(
            vec![&w.env, row(finished, ResultOutcome::Dnf)],
            Error::InvalidState,
        );
        refused(
            vec![&w.env, row(finished, ResultOutcome::Timed(2_000))],
            Error::InvalidState,
        );
        refused(
            vec![&w.env, row(dnf, ResultOutcome::Untimed)],
            Error::InvalidState,
        );
        refused(
            vec![&w.env, row(404, ResultOutcome::Dnf)],
            Error::RecordNotFound,
        );
        // A token listed twice: the second row finds a terminal record.
        refused(
            vec![
                &w.env,
                row(claimed, ResultOutcome::Timed(3_000)),
                row(claimed, ResultOutcome::Dnf),
            ],
            Error::InvalidState,
        );
        assert_eq!(
            w.records().record_of(&claimed).state,
            RecordState::RacepackClaimed
        );
    }

    /// A row from another race is refused, even when the caller organises
    /// both races: the batch is for one event.
    #[test]
    fn a_row_from_another_event_is_refused() {
        let w = World::new();
        let (race_a, cat_a) = w.open_event(10, PRICE);
        let (race_b, cat_b) = w.open_event(10, PRICE);
        let in_a = w.claimed(race_a, cat_a, 1);
        let in_b = w.claimed(race_b, cat_b, 2);

        w.env.mock_all_auths();
        assert_eq!(
            w.records().try_record_results(
                &race_a,
                &vec![
                    &w.env,
                    row(in_a, ResultOutcome::Timed(3_000)),
                    row(in_b, ResultOutcome::Timed(3_000))
                ],
            ),
            Err(Ok(Error::ResultForAnotherEvent))
        );
        assert_eq!(
            w.records().record_of(&in_a).state,
            RecordState::RacepackClaimed
        );
        assert_eq!(
            w.records().record_of(&in_b).state,
            RecordState::RacepackClaimed
        );
    }

    /// Another organiser cannot reach this race's records through a batch for
    /// their own race, and cannot sign a batch for this race either.
    #[test]
    fn another_organiser_cannot_record_this_race() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let token_id = w.claimed(event_id, category_id, 1);

        let rival = Address::generate(&w.env);
        w.env.mock_all_auths();
        w.registry().add_organiser(&rival);
        let rival_event = w.registry().create_event(
            &rival,
            &String::from_str(&w.env, "Rival Run"),
            &phash(&w.env, 9),
            &String::from_str(&w.env, "ipfs://rival"),
            &STARTS_AT,
        );

        let rows = vec![&w.env, row(token_id, ResultOutcome::Dnf)];
        w.mock_batch(&rival, rival_event, &rows);
        assert_eq!(
            w.records().try_record_results(&rival_event, &rows),
            Err(Ok(Error::ResultForAnotherEvent))
        );

        w.mock_batch(&rival, event_id, &rows);
        assert_eq!(
            w.records().try_record_results(&event_id, &rows),
            Err(Err(InvokeError::Abort))
        );
        assert_eq!(
            w.records().record_of(&token_id).state,
            RecordState::RacepackClaimed
        );
    }

    /// A scanner checks runners in; results stay the organiser's.
    #[test]
    fn a_scanner_and_a_runner_cannot_sign_a_batch() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let token_id = w.claimed(event_id, category_id, 1);
        let scanner = Address::generate(&w.env);
        w.env.mock_all_auths();
        w.registry().add_scanner(&event_id, &scanner);
        let runner = w.records().owner_of(&token_id);

        let rows = vec![&w.env, row(token_id, ResultOutcome::Timed(1_234))];
        for signer in [&scanner, &runner] {
            w.mock_batch(signer, event_id, &rows);
            assert_eq!(
                w.records().try_record_results(&event_id, &rows),
                Err(Err(InvokeError::Abort))
            );
        }
        assert_eq!(
            w.records().record_of(&token_id).state,
            RecordState::RacepackClaimed
        );
    }

    /// An empty list records nothing, emits nothing, and is not an error.
    #[test]
    fn an_empty_list_records_nothing() {
        let w = World::new();
        let (event_id, _category_id) = w.open_event(10, PRICE);
        w.mock_batch(&w.organiser, event_id, &vec![&w.env]);
        w.records().record_results(&event_id, &vec![&w.env]);
        assert_eq!(
            w.env
                .events()
                .all()
                .filter_by_contract(&w.contract)
                .events(),
            &[]
        );
    }

    /// Every row pays its record's rent, like the single calls.
    #[test]
    fn a_batch_extends_each_record_ttl() {
        let w = World::new();
        let (event_id, category_id) = w.open_event(10, PRICE);
        let a = w.claimed(event_id, category_id, 1);
        let b = w.enter(&w.runner(), event_id, category_id, 2);

        let aged_by = (BUMP_TO - BUMP_THRESHOLD) + DAY_IN_LEDGERS;
        w.env
            .ledger()
            .set_sequence_number(w.env.ledger().sequence() + aged_by);
        assert!(persistent_ttl(&w.env, &w.contract, DataKey::Record(a)) < BUMP_THRESHOLD);

        w.env.mock_all_auths();
        w.records().record_results(
            &event_id,
            &vec![
                &w.env,
                row(a, ResultOutcome::Timed(3_000)),
                row(b, ResultOutcome::Dnf),
            ],
        );
        assert_eq!(
            persistent_ttl(&w.env, &w.contract, DataKey::Record(a)),
            BUMP_TO
        );
        assert_eq!(
            persistent_ttl(&w.env, &w.contract, DataKey::Record(b)),
            BUMP_TO
        );
    }
}

// ---------------------------------------------------------------------------
// Upgrade (v2)
//
// Deployed from the BUILT WASM, because that is the only form
// `update_current_contract_wasm` can replace. Needs `stellar contract build`
// to have run first.
// ---------------------------------------------------------------------------
mod upgrade {
    use super::*;
    use soroban_sdk::Bytes;
    use std::path::PathBuf;

    fn wasm_bytes(name: &str) -> std::vec::Vec<u8> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/wasm32v1-none/release")
            .join(name);
        std::fs::read(&path).unwrap_or_else(|e| {
            panic!(
                "cannot read {}: {e}\nRun `cd sc && stellar contract build` first — the upgrade \
                 tests replace a real executable, so they need one.",
                path.display()
            )
        })
    }

    fn upload(env: &Env, name: &str) -> BytesN<32> {
        env.deployer()
            .upload_contract_wasm(Bytes::from_slice(env, &wasm_bytes(name)))
    }

    /// A World whose RaceRecord is deployed from wasm rather than natively.
    fn wasm_world() -> World {
        let w = World::new();
        // `set_race_record` is one-shot, so a RaceRecord deployed from wasm
        // needs a registry of its own to be the trusted caller of. It has to
        // exist BEFORE the contract, because the address is a constructor arg.
        let registry = w.env.register(EventRegistry, (w.admin.clone(),));
        let contract = w.env.register(
            wasm_bytes("race_record.wasm").as_slice(),
            (
                w.admin.clone(),
                registry.clone(),
                w.token.clone(),
                String::from_str(&w.env, NAME),
                String::from_str(&w.env, SYMBOL),
                String::from_str(&w.env, BASE_URI),
            ),
        );
        w.env.mock_all_auths();
        let registry_client = RegistryClient::new(&w.env, &registry);
        registry_client.set_race_record(&contract);
        // A second registry means a second allowlist (STE-36).
        registry_client.add_organiser(&w.organiser);
        World {
            contract,
            registry,
            ..w
        }
    }

    /// Records — including which add-ons they bought — read back unchanged
    /// after the executable is replaced.
    #[test]
    fn records_written_before_an_upgrade_read_back_after_it() {
        let w = wasm_world();
        let (event_id, category_id) = w.open_event(5, PRICE);
        let (jersey, tumbler) = w.jersey_and_tumbler(event_id);
        let runner = w.runner();
        let token_id = w.enter_with(
            &runner,
            event_id,
            category_id,
            vec![&w.env, jersey, tumbler],
            1,
        );
        let before = w.records().record_of(&token_id);

        w.env.mock_all_auths();
        w.records().upgrade(&upload(&w.env, "race_record.wasm"));

        assert_eq!(w.records().record_of(&token_id), before);
        assert_eq!(before.addon_ids, vec![&w.env, jersey, tumbler]);
        // The OpenZeppelin owner / balance / enumeration keys survive too.
        assert_eq!(w.records().owner_of(&token_id), runner);
        assert_eq!(w.records().balance(&runner), 1);
        assert_eq!(w.records().records_of(&runner), vec![&w.env, token_id]);
        assert_eq!(w.records().total_supply(), 1);
        assert_eq!(w.records().name(), String::from_str(&w.env, NAME));
        assert_eq!(w.records().get_token(), w.token);
        assert!(w.records().verify(&token_id, &phash(&w.env, 1)));

        // The lifecycle still works on a record minted by the old executable,
        // and the new one is still upgradeable.
        w.env.mock_all_auths();
        w.records().claim_racepack(&token_id, &w.organiser);
        assert_eq!(
            w.records().record_of(&token_id).state,
            RecordState::RacepackClaimed
        );
        w.records().upgrade(&upload(&w.env, "race_record.wasm"));
    }

    /// The same call against the NATIVELY registered contract the rest of this
    /// file uses. The wasm tests above are the ones that mean something on a
    /// real network, but they execute the contract as wasm, so the Rust source
    /// is never instrumented and `upgrade` reads as dead code in the coverage
    /// report. Running it natively too keeps the report honest.
    #[test]
    fn upgrade_runs_natively_too() {
        let w = World::new();
        w.env.mock_all_auths();
        w.records().upgrade(&upload(&w.env, "race_record.wasm"));
        assert_eq!(w.records().total_supply(), 0);
    }

    #[test]
    fn upgrade_rejects_a_non_admin() {
        let w = wasm_world();
        let stranger = Address::generate(&w.env);
        let hash = upload(&w.env, "race_record.wasm");

        w.env.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &w.contract,
                fn_name: "upgrade",
                args: (hash.clone(),).into_val(&w.env),
                sub_invokes: &[],
            },
        }]);

        assert_eq!(w.records().try_upgrade(&hash), Err(Err(InvokeError::Abort)));
    }

    #[test]
    fn emits_contract_upgraded() {
        let w = wasm_world();
        let hash = upload(&w.env, "race_record.wasm");

        w.env.mock_all_auths();
        w.records().upgrade(&hash);

        assert_eq!(
            w.env.events().all(),
            std::vec![crate::ContractUpgraded {
                new_wasm_hash: hash,
            }
            .to_xdr(&w.env, &w.contract)]
        );
    }

    // -- STE-41: the upgrade from the wasm genuinely live on testnet --------
    //
    // The tests above upgrade today's build to today's build. That proves
    // storage survives an executable swap, not that state written by the code
    // RUNNING ON THE CHAIN reads back under the new code. For that the "before"
    // has to be the live artifact, so it is committed: fetched from
    // CCVW7WVC… with `stellar contract fetch`, provenance in
    // `testdata/README.md`.

    /// RaceRecord v2.0.1, the executable at CCVW7WVC… before STE-41.
    const LIVE_PRE_UNTIMED_WASM: &[u8] =
        include_bytes!("../testdata/race_record_live_pre_untimed.wasm");
    /// What the ledger reports for that contract, and INTERFACE.md §0 freezes.
    const LIVE_PRE_UNTIMED_HASH: &str =
        "27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b";

    fn hex32(bytes: &BytesN<32>) -> std::string::String {
        bytes
            .to_array()
            .iter()
            .map(|b| std::format!("{b:02x}"))
            .collect()
    }

    /// A World whose RaceRecord runs the LIVE pre-STE-41 executable.
    fn live_world() -> World {
        let w = World::new();
        let registry = w.env.register(EventRegistry, (w.admin.clone(),));
        let contract = w.env.register(
            LIVE_PRE_UNTIMED_WASM,
            (
                w.admin.clone(),
                registry.clone(),
                w.token.clone(),
                String::from_str(&w.env, NAME),
                String::from_str(&w.env, SYMBOL),
                String::from_str(&w.env, BASE_URI),
            ),
        );
        w.env.mock_all_auths();
        let registry_client = RegistryClient::new(&w.env, &registry);
        registry_client.set_race_record(&contract);
        registry_client.add_organiser(&w.organiser);
        World {
            contract,
            registry,
            ..w
        }
    }

    /// Every lifecycle state the live code can write — Entered, RacepackClaimed,
    /// a timed Finished, Dnf — reads back identically after the upgrade, and
    /// the new function then works on records the OLD code minted.
    #[test]
    fn records_written_by_the_live_wasm_survive_the_untimed_upgrade() {
        let w = live_world();
        let live_hash = w
            .env
            .deployer()
            .upload_contract_wasm(Bytes::from_slice(&w.env, LIVE_PRE_UNTIMED_WASM));
        assert_eq!(hex32(&live_hash), LIVE_PRE_UNTIMED_HASH);

        // -- written by the OLD code ---------------------------------------
        let (event_id, category_id) = w.open_event(10, PRICE);
        let (jersey, _) = w.jersey_and_tumbler(event_id);
        let runner = w.runner();
        let entered = w.enter(&runner, event_id, category_id, 1);
        let claimed = w.enter_with(&w.runner(), event_id, category_id, vec![&w.env, jersey], 2);
        let timed = w.enter(&w.runner(), event_id, category_id, 3);
        let dnf = w.enter(&w.runner(), event_id, category_id, 4);
        w.env.mock_all_auths();
        let records = w.records();
        records.claim_racepack(&claimed, &w.organiser);
        records.claim_racepack(&timed, &w.organiser);
        records.record_finish(&timed, &3_161);
        records.record_dnf(&dnf);

        // The old code does not export the new function at all.
        assert!(records.try_record_finish_untimed(&claimed).is_err());

        let before: std::vec::Vec<RecordData> = [entered, claimed, timed, dnf]
            .iter()
            .map(|t| records.record_of(t))
            .collect();

        // -- the upgrade ----------------------------------------------------
        w.env.mock_all_auths();
        records.upgrade(&upload(&w.env, "race_record.wasm"));

        // -- everything the old code wrote still decodes, unchanged --------
        for (token_id, record) in [entered, claimed, timed, dnf].iter().zip(&before) {
            assert_eq!(&records.record_of(token_id), record);
        }
        assert_eq!(before[2].finish_time_s, Some(3_161));
        assert_eq!(before[1].addon_ids, vec![&w.env, jersey]);
        assert_eq!(records.owner_of(&entered), runner);
        assert_eq!(records.total_supply(), 4);
        assert!(records.verify(&timed, &phash(&w.env, 3)));

        // -- the new path, on records minted by the old code ---------------
        w.env.mock_all_auths();
        records.record_finish_untimed(&claimed);
        let untimed = records.record_of(&claimed);
        assert_eq!(untimed.state, RecordState::Finished);
        assert_eq!(untimed.finish_time_s, None);
        assert_eq!(untimed.addon_ids, vec![&w.env, jersey]);

        records.claim_racepack(&entered, &w.organiser);
        records.record_finish_untimed(&entered);
        assert_eq!(records.record_of(&entered).finish_time_s, None);

        // Terminal states written by the old code stay terminal.
        assert_eq!(
            records.try_record_finish_untimed(&timed),
            Err(Ok(Error::InvalidState))
        );
        assert_eq!(
            records.try_record_finish_untimed(&dnf),
            Err(Ok(Error::InvalidState))
        );

        // -- and the timed path is untouched by the upgrade ----------------
        let fresh = w.claimed(event_id, category_id, 5);
        assert_eq!(fresh, 4, "token ids continue across the upgrade");
        w.env.mock_all_auths();
        assert_eq!(
            records.try_record_finish(&fresh, &0),
            Err(Ok(Error::InvalidFinishTime))
        );
        records.record_finish(&fresh, &2_900);
        assert_eq!(records.record_of(&fresh).finish_time_s, Some(2_900));
    }

    // -- STE-60: how many results fit in one transaction --------------------
    //
    // Measured, not computed. Both contracts are deployed from wasm so VM and
    // cross-contract costs are real, and `Env::default()` enforces the mainnet
    // per-invocation limits. A timed result is the largest row (its event
    // carries the time). Per row: one record written, one more entry in the
    // footprint read, 136 event bytes. Measured totals for n rows:
    //
    //   footprint entries  (n + 7 read) + (n + 1 written) = 2n + 8   limit 100
    //   written entries    n + 1                                     limit 50
    //   event bytes        136n                                      limit 16,384
    //
    // The footprint binds first: 46 rows is 100 entries, 47 is 102. The
    // written-entries limit alone would have allowed 49, which is what a first
    // measurement that ignored the footprint concluded, and the wrong number
    // this test exists to keep out. `RECORD_RESULTS_MAX_BATCH` in the SDK is
    // this figure.

    const MAX_BATCH_MAINNET: u32 = 46;

    /// Registry and RaceRecord both from wasm, a free 10K, `n` runners checked
    /// in, and the timed rows to record them.
    fn full_batch(n: u32) -> (Env, RaceRecordClient<'static>, u32, Vec<crate::ResultEntry>) {
        let env = Env::default();
        env.ledger().set_timestamp(NOW);
        let admin = Address::generate(&env);
        let organiser = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let registry = env.register(
            wasm_bytes("event_registry.wasm").as_slice(),
            (admin.clone(),),
        );
        let contract = env.register(
            wasm_bytes("race_record.wasm").as_slice(),
            (
                admin.clone(),
                registry.clone(),
                token,
                String::from_str(&env, NAME),
                String::from_str(&env, SYMBOL),
                String::from_str(&env, BASE_URI),
            ),
        );
        env.mock_all_auths();
        let reg = RegistryClient::new(&env, &registry);
        reg.set_race_record(&contract);
        reg.add_organiser(&organiser);
        let event_id = reg.create_event(
            &organiser,
            &String::from_str(&env, "Jakarta Night Run 2026"),
            &phash(&env, 7),
            &String::from_str(&env, "ipfs://bafyjakartanightrun"),
            &STARTS_AT,
        );
        let category_id = reg.add_category(&event_id, &symbol_short!("10K"), &10_000, &1_000, &0);
        reg.set_event_status(&event_id, &EventStatus::Open);

        let records = RaceRecordClient::new(&env, &contract);
        let mut rows = Vec::new(&env);
        for i in 0..n {
            let runner = Address::generate(&env);
            let token_id = records.enter(
                &runner,
                &event_id,
                &category_id,
                &vec![&env],
                &phash(&env, (i % 250) as u8),
            );
            records.claim_racepack(&token_id, &organiser);
            rows.push_back(crate::ResultEntry {
                token_id,
                // The largest time a race will plausibly publish, so the event
                // is no smaller than a real one.
                outcome: crate::ResultOutcome::Timed(86_399 - i),
            });
        }
        // The clients borrow `env`; leaking it keeps the test body simple and
        // lives only as long as the test process.
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        (
            env.clone(),
            RaceRecordClient::new(env, &contract),
            event_id,
            rows,
        )
    }

    #[test]
    fn the_largest_batch_fits_the_mainnet_limits() {
        let (env, records, event_id, rows) = full_batch(MAX_BATCH_MAINNET);
        env.mock_all_auths();
        records.record_results(&event_id, &rows);
        let used = env.cost_estimate().resources();
        assert_eq!(used.write_entries, MAX_BATCH_MAINNET + 1);
        assert_eq!(
            used.memory_read_entries + used.write_entries,
            2 * MAX_BATCH_MAINNET + 8
        );
        assert_eq!(
            2 * MAX_BATCH_MAINNET + 8,
            100,
            "the largest batch is exactly the footprint limit"
        );
        assert!(used.contract_events_size_bytes <= 16_384);
        assert_eq!(
            records.record_of(&rows.get_unchecked(0).token_id).state,
            RecordState::Finished
        );
    }

    #[test]
    #[should_panic(expected = "total footprint ledger entries: 102 > 100")]
    fn one_row_more_exceeds_the_mainnet_limits() {
        let (env, records, event_id, rows) = full_batch(MAX_BATCH_MAINNET + 1);
        env.mock_all_auths();
        records.record_results(&event_id, &rows);
    }

    // -- STE-60: the upgrade from the RaceRecord live before it --------------

    /// RaceRecord v2.2, the executable at CCVW7WVC… before STE-60.
    const LIVE_PRE_RESULTS_WASM: &[u8] =
        include_bytes!("../testdata/race_record_live_pre_results.wasm");
    /// What the ledger reports for that contract, and INTERFACE.md §0 freezes.
    const LIVE_PRE_RESULTS_HASH: &str =
        "0e29026d2f87c09dc30c255854a28baaeecaa543ae5e98add61ba35b511e02ba";

    /// Records the running code minted and checked in take a batch of results
    /// after the upgrade, and a terminal record it wrote stays terminal.
    #[test]
    fn records_the_live_wasm_minted_take_a_batch_of_results() {
        let w = World::new();
        let registry = w.env.register(EventRegistry, (w.admin.clone(),));
        let contract = w.env.register(
            LIVE_PRE_RESULTS_WASM,
            (
                w.admin.clone(),
                registry.clone(),
                w.token.clone(),
                String::from_str(&w.env, NAME),
                String::from_str(&w.env, SYMBOL),
                String::from_str(&w.env, BASE_URI),
            ),
        );
        w.env.mock_all_auths();
        let registry_client = RegistryClient::new(&w.env, &registry);
        registry_client.set_race_record(&contract);
        registry_client.add_organiser(&w.organiser);
        let w = World {
            contract,
            registry,
            ..w
        };

        let live_hash = w
            .env
            .deployer()
            .upload_contract_wasm(Bytes::from_slice(&w.env, LIVE_PRE_RESULTS_WASM));
        assert_eq!(hex32(&live_hash), LIVE_PRE_RESULTS_HASH);

        // -- written by the OLD code ---------------------------------------
        let (event_id, category_id) = w.open_event(10, PRICE);
        let timed = w.claimed(event_id, category_id, 1);
        let untimed = w.claimed(event_id, category_id, 2);
        let no_show = w.enter(&w.runner(), event_id, category_id, 3);
        let already = w.claimed(event_id, category_id, 4);
        w.env.mock_all_auths();
        let records = w.records();
        records.record_finish(&already, &3_000);
        let rows = vec![
            &w.env,
            crate::ResultEntry {
                token_id: timed,
                outcome: crate::ResultOutcome::Timed(2_950),
            },
            crate::ResultEntry {
                token_id: untimed,
                outcome: crate::ResultOutcome::Untimed,
            },
            crate::ResultEntry {
                token_id: no_show,
                outcome: crate::ResultOutcome::Dnf,
            },
        ];
        // The running code has no batch function at all.
        assert!(records.try_record_results(&event_id, &rows).is_err());
        let before: std::vec::Vec<RecordData> = [timed, untimed, no_show, already]
            .iter()
            .map(|t| records.record_of(t))
            .collect();

        // -- the upgrade ----------------------------------------------------
        w.env.mock_all_auths();
        records.upgrade(&upload(&w.env, "race_record.wasm"));
        for (token_id, record) in [timed, untimed, no_show, already].iter().zip(&before) {
            assert_eq!(&records.record_of(token_id), record);
        }

        // -- the batch, on records the OLD code minted ----------------------
        w.env.mock_all_auths();
        records.record_results(&event_id, &rows);
        assert_eq!(records.record_of(&timed).finish_time_s, Some(2_950));
        assert_eq!(records.record_of(&untimed).state, RecordState::Finished);
        assert_eq!(records.record_of(&untimed).finish_time_s, None);
        assert_eq!(records.record_of(&no_show).state, RecordState::Dnf);
        assert_eq!(
            records.try_record_results(
                &event_id,
                &vec![
                    &w.env,
                    crate::ResultEntry {
                        token_id: already,
                        outcome: crate::ResultOutcome::Dnf
                    }
                ],
            ),
            Err(Ok(Error::InvalidState))
        );
        assert_eq!(records.record_of(&already), before[3]);
    }
}

mod spec_vectors {
    use super::*;

    use soroban_sdk::Bytes;
    use std::{path::PathBuf, string::String as StdString, vec::Vec as StdVec};

    struct Vector {
        id: StdString,
        preimage_hex: StdString,
        expected_hash_hex: StdString,
    }

    fn vectors_path() -> PathBuf {
        // CARGO_MANIFEST_DIR = sc/contracts/race_record
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../docs/specs/vectors/participant_hash.json")
    }

    /// Pulls `"key": "value"` out of the JSON starting at `from`.
    ///
    /// A hand-rolled scan rather than a JSON crate on purpose: the contract
    /// workspace must not grow a dependency just to read a fixture, and the
    /// file is machine-generated with a stable shape. It fails loudly (`None`
    /// -> assertion) rather than silently skipping, so drift breaks the test
    /// run instead of quietly reducing coverage.
    fn string_field(src: &str, key: &str, from: usize) -> Option<(StdString, usize)> {
        let needle = std::format!("\"{key}\": \"");
        let start = src[from..].find(&needle)? + from + needle.len();
        let end = start + src[start..].find('"')?;
        Some((StdString::from(&src[start..end]), end))
    }

    fn load_vectors() -> StdVec<Vector> {
        let path = vectors_path();
        let raw = std::fs::read_to_string(&path).unwrap_or_else(|e| {
            panic!(
                "cannot read {}: {e}.\n\
                 This test reads the FROZEN spec vectors (STE-10). If the file moved, the \
                 freeze moved with it — fix the path, do not delete the test.",
                path.display()
            )
        });
        // The `rejects` array reuses the `id` key but has no preimage, so stop
        // the scan before it.
        let src = match raw.find("\"rejects\"") {
            Some(i) => &raw[..i],
            None => panic!("participant_hash.json has no `rejects` array — file shape changed"),
        };

        let mut out = StdVec::new();
        let mut cursor = 0usize;
        while let Some((id, next)) = string_field(src, "id", cursor) {
            let (preimage_hex, next) = string_field(src, "preimage_hex", next)
                .unwrap_or_else(|| panic!("vector {id} has no preimage_hex"));
            let (expected_hash_hex, next) = string_field(src, "expected_hash_hex", next)
                .unwrap_or_else(|| panic!("vector {id} has no expected_hash_hex"));
            out.push(Vector {
                id,
                preimage_hex,
                expected_hash_hex,
            });
            cursor = next;
        }
        out
    }

    fn hex_bytes(hex: &str) -> StdVec<u8> {
        assert!(hex.len().is_multiple_of(2), "odd-length hex: {hex}");
        hex.as_bytes()
            .chunks(2)
            .map(|pair| {
                let nibble = |b: u8| match b {
                    b'0'..=b'9' => b - b'0',
                    // Lowercase only: the spec renders hex lowercase.
                    b'a'..=b'f' => b - b'a' + 10,
                    other => panic!("not lowercase hex: {:?}", other as char),
                };
                nibble(pair[0]) << 4 | nibble(pair[1])
            })
            .collect()
    }

    fn hex_string(bytes: &[u8]) -> StdString {
        let mut out = StdString::with_capacity(bytes.len() * 2);
        for b in bytes {
            out.push(char::from_digit((b >> 4) as u32, 16).unwrap());
            out.push(char::from_digit((b & 0x0f) as u32, 16).unwrap());
        }
        out
    }

    /// The host's SHA-256 must produce exactly the hash the frozen vectors
    /// declare. If this ever fails, the backend and the chain disagree about
    /// what a runner's identity commitment is.
    #[test]
    fn host_sha256_matches_every_participant_hash_vector() {
        let env = Env::default();
        let vectors = load_vectors();
        assert!(
            vectors.len() >= 4,
            "STE-10 froze at least 4 participant_hash vectors, found {}",
            vectors.len()
        );

        for v in &vectors {
            let preimage = Bytes::from_slice(&env, &hex_bytes(&v.preimage_hex));
            let digest = env.crypto().sha256(&preimage);
            assert_eq!(
                hex_string(&digest.to_bytes().to_array()),
                v.expected_hash_hex,
                "{}: env.crypto().sha256 disagrees with docs/specs/vectors",
                v.id
            );
        }
    }

    /// ...and the contract accepts it. Each vector's hash is minted into a real
    /// record through `enter`, then `verify` must say `true` for that exact
    /// value and `false` for the same value with one bit flipped.
    #[test]
    fn every_participant_hash_vector_is_accepted_by_enter_and_verify() {
        let w = World::new();
        let vectors = load_vectors();
        let (event_id, category_id) = w.open_event(vectors.len() as u32, PRICE);

        for v in &vectors {
            let runner = w.runner();
            let preimage = Bytes::from_slice(&w.env, &hex_bytes(&v.preimage_hex));
            let hash = w.env.crypto().sha256(&preimage).to_bytes();
            assert_eq!(
                hex_string(&hash.to_array()),
                v.expected_hash_hex,
                "{}",
                v.id
            );

            w.env.mock_all_auths();
            let token_id =
                w.records()
                    .enter(&runner, &event_id, &category_id, &vec![&w.env], &hash);

            assert!(
                w.records().verify(&token_id, &hash),
                "{}: the chain rejected a hash the frozen spec says is correct",
                v.id
            );
            assert_eq!(w.records().record_of(&token_id).participant_hash, hash);

            let mut flipped = hash.to_array();
            flipped[0] ^= 0x01;
            assert!(
                !w.records()
                    .verify(&token_id, &BytesN::from_array(&w.env, &flipped)),
                "{}: verify accepted a hash one bit off",
                v.id
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Non-transferable, asserted mechanically
// ---------------------------------------------------------------------------

/// Reads the built `race_record.wasm` and walks its export section.
///
/// This is the product claim, checked against the artifact that actually ships
/// rather than against the source: a record can never change hands because the
/// contract exports no function that could move it, and it carries none of
/// EventRegistry's surface either.
///
/// `sc/scripts/check-exports.sh` runs the same assertion against
/// `stellar contract info interface` for CI.
mod exports {
    extern crate std;

    use std::{path::PathBuf, string::String as StdString, vec::Vec as StdVec};

    /// Anything that could move, destroy, or delegate a record.
    const BANNED: [&str; 6] = [
        "transfer",
        "transfer_from",
        "approve",
        "approve_for_all",
        "burn",
        "burn_from",
    ];

    /// EventRegistry's surface. None of it may be re-exported here: RaceRecord
    /// talks to C1 as a client, it does not embed it.
    ///
    /// `upgrade` is deliberately absent from this list — both contracts export
    /// one of their own (v2), so finding it here is correct, not a leak.
    const REGISTRY_ONLY: [&str; 22] = [
        "create_event",
        "add_category",
        "set_event_status",
        "add_scanner",
        "remove_scanner",
        "reserve_slot",
        "set_race_record",
        "get_race_record",
        "get_event",
        "get_organiser",
        "is_scanner",
        "event_count",
        "add_addon",
        "reserve_addon",
        "get_addon",
        "addon_count",
        "add_organiser",
        "remove_organiser",
        "is_organiser",
        "increase_quota",
        "set_registration_closes",
        "get_registration_closes",
    ];

    fn wasm_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/wasm32v1-none/release/race_record.wasm")
    }

    fn read_u32(bytes: &[u8], cursor: &mut usize) -> u32 {
        let mut result = 0u32;
        let mut shift = 0;
        loop {
            let byte = bytes[*cursor];
            *cursor += 1;
            result |= u32::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return result;
            }
            shift += 7;
        }
    }

    /// Names in the wasm export section (section id 7).
    fn exported_names(wasm: &[u8]) -> StdVec<StdString> {
        assert_eq!(&wasm[..4], b"\0asm", "not a wasm module");
        let mut cursor = 8; // magic + version
        let mut names = StdVec::new();
        while cursor < wasm.len() {
            let section_id = wasm[cursor];
            cursor += 1;
            let section_len = read_u32(wasm, &mut cursor) as usize;
            let section_end = cursor + section_len;
            if section_id == 7 {
                let count = read_u32(wasm, &mut cursor);
                for _ in 0..count {
                    let name_len = read_u32(wasm, &mut cursor) as usize;
                    names.push(
                        StdString::from_utf8(wasm[cursor..cursor + name_len].to_vec())
                            .expect("export name must be utf8"),
                    );
                    cursor += name_len;
                    cursor += 1; // export kind
                    let _index = read_u32(wasm, &mut cursor);
                }
            }
            cursor = section_end;
        }
        names
    }

    #[test]
    fn race_record_wasm_exports_nothing_that_could_move_a_record() {
        let path = wasm_path();
        let wasm = std::fs::read(&path).unwrap_or_else(|e| {
            panic!(
                "cannot read {}: {e}.\n\
                 Run `stellar contract build` from `sc/` before `cargo test` — this test \
                 checks the shipped artifact, not the source.",
                path.display()
            )
        });
        let names = exported_names(&wasm);

        assert!(
            names.iter().any(|n| n == "enter"),
            "export section parsed but `enter` is missing — parser or build is wrong: {names:?}"
        );
        for banned in BANNED {
            assert!(
                !names.iter().any(|n| n == banned),
                "race_record.wasm exports `{banned}` — records would be transferable"
            );
        }
        for registry_fn in REGISTRY_ONLY {
            assert!(
                !names.iter().any(|n| n == registry_fn),
                "race_record.wasm re-exports EventRegistry's `{registry_fn}`"
            );
        }
    }
}
