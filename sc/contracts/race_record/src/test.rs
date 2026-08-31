#![cfg(test)]
extern crate std;

use event_registry::{EventRegistry, EventRegistryClient as RegistryClient, EventStatus};
use soroban_sdk::{
    symbol_short,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, Event as _, IntoVal, InvokeError, String, Symbol, TryFromVal, Val,
};
use stellar_tokens::non_fungible::{Mint, NonFungibleTokenError};

use crate::{
    DataKey, Error, RaceRecord, RaceRecordClient, RacepackClaimed, RecordData, RecordDnf,
    RecordEntered, RecordFinished, RecordState, BUMP_THRESHOLD, BUMP_TO, DAY_IN_LEDGERS,
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
        RegistryClient::new(&env, &registry).set_race_record(&contract);

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
        self.records()
            .enter(runner, &event_id, &category_id, &phash(&self.env, seed))
    }
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
            bib_no: 0,
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
            args: (runner.clone(), event_id, category_id, hash.clone()).into_val(&w.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &w.token,
                fn_name: "transfer",
                args: (runner.clone(), w.organiser.clone(), PRICE).into_val(&w.env),
                sub_invokes: &[],
            }],
        },
    }]);
    let token_id = w.records().enter(&runner, &event_id, &category_id, &hash);

    assert_eq!(
        w.env.auths(),
        std::vec![(
            runner.clone(),
            soroban_sdk::testutils::AuthorizedInvocation {
                function: soroban_sdk::testutils::AuthorizedFunction::Contract((
                    w.contract.clone(),
                    Symbol::new(&w.env, "enter"),
                    (runner.clone(), event_id, category_id, hash).into_val(&w.env),
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

/// Bib numbers are the registry's category sequence, not a local counter.
#[test]
fn bib_numbers_come_from_the_registry_sequence() {
    let w = World::new();
    let (event_id, category_id) = w.open_event(3, PRICE);

    for expected in 0..3u32 {
        let runner = w.runner();
        let token_id = w.enter(&runner, event_id, category_id, expected as u8);
        assert_eq!(token_id, expected);
        assert_eq!(w.records().record_of(&token_id).bib_no, expected);
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
    // Both are bib 0: the sequence is per category, not global.
    assert_eq!(records.record_of(&a).bib_no, 0);
    assert_eq!(records.record_of(&b).bib_no, 0);
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
            bib_no: 0,
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
                bib_no: 0,
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
        w.records()
            .try_enter(&runner, &event_id, &category_id, &phash(&w.env, 1)),
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
    ];
    let record: std::vec::Vec<u32> = std::vec![
        Error::NotInitialized as u32,
        Error::RecordNotFound as u32,
        Error::AlreadyClaimed as u32,
        Error::InvalidState as u32,
        Error::NotAuthorized as u32,
        Error::InvalidFinishTime as u32,
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
    assert_eq!(registry.len(), 13, "EventRegistry gained an error variant");
    assert_eq!(record.len(), 6, "RaceRecord gained an error variant");
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
            w.records()
                .try_enter(&runner, &event_id, &category_id, &phash(&w.env, 1)),
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
        w.records()
            .try_enter(&latecomer, &event_id, &category_id, &phash(&w.env, 2)),
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
        let result = w
            .records()
            .try_enter(&broke, &event_id, &category_id, &phash(&w.env, 1));
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

        // And the slot is still there for someone who can pay.
        let solvent = w.runner();
        assert_eq!(w.enter(&solvent, event_id, category_id, 2), 0);
        assert_eq!(w.records().record_of(&0).bib_no, 0);
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
            let token_id = w.records().enter(&runner, &event_id, &category_id, &hash);

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
    const REGISTRY_ONLY: [&str; 12] = [
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
