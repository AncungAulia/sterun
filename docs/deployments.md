# Deployments — Sterun (Instawards MVP)

This file is the **mandatory deploy evidence** (working agreement, point 8): every deployment has to
be recorded here with the real contract or account address plus a clickable explorer link, so that a
reviewer, the PM, or a grant judge can verify it themselves without running anything.

> **Everything in this file is TESTNET** (`Test SDF Network ; September 2015`).
> Nothing here has real value. Mainnet gets its own section if it ever exists.
>
> **No secret key (`S...`) or seed phrase ever appears in this file.** Only public addresses
> (`G...`), contract addresses (`C...`) and transaction hashes. Secret keys live in
> `~/.config/stellar/identity/*` on each person's own machine and never enter the repository.

---

## Address index — all of them, with clickable links

One table so nobody has to scroll: **every** contract and account address Sterun uses on testnet,
what it does, and the ticket that produced it. The details are in the sections below.

### Contracts

| Contract | Role | Address (click = explorer) | Ticket |
| --- | --- | --- | --- |
| **EventRegistry v1** (C1) | events, categories, quota, prices, scanner allowlist, `reserve_slot` | [`CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64`](https://stellar.expert/explorer/testnet/contract/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64) | STE-33 |
| **RaceRecord v1** (C2) | non-transferable race records + lifecycle, atomic `enter` | [`CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4`](https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4) | STE-33 |
| **SAC sUSD** | the entry-fee token (SEP-41) that `enter` calls | [`CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`](https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU) | STE-30 |
| **EventRegistry** (C1) | v1 + paid add-ons, `Cancelled` status, `upgrade` | [`CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`](https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) | STE-35 |
| **RaceRecord** (C2) | v1 + `enter(addon_ids)` charging atomically, `upgrade` | [`CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW`](https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) | STE-35 |

> **Two pairs of addresses live side by side, deliberately.** v1 is non-upgradeable, so add-ons could
> not be fitted into it — v2 is a new pair. The **EventRegistry**/**RaceRecord** rows without a suffix
> are the **v2** pair, because that is what `be/` and `fe/` run against as of 2026-09-09; the older
> pair carries the `v1` label. The parser reads these rows (see `be/src/deployments.ts`), and a test
> fails if it ever resolves the v1 pair. New integrations use the unqualified rows.

### Accounts

| Account | Role | Address (click = explorer) | Ticket |
| --- | --- | --- | --- |
| `sterun-susd-issuer` | issues the `sUSD` asset | [`GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW`](https://stellar.expert/explorer/testnet/account/GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW) | STE-30 |
| `sterun-susd-distributor` | holds the initial supply; the faucet's source | [`GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO`](https://stellar.expert/explorer/testnet/account/GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO) | STE-30 |
| `sterun-admin` | deployer + admin of both contracts | [`GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP`](https://stellar.expert/explorer/testnet/account/GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP) | STE-33 |
| `sterun-organiser` | organiser of the rehearsal event; receives the entry fees | [`GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN`](https://stellar.expert/explorer/testnet/account/GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN) | STE-33 |
| `sterun-runner-a` | rehearsal runner — `token_id 0`, full lifecycle through to `Finished` | [`GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR`](https://stellar.expert/explorer/testnet/account/GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR) | STE-33 |
| `sterun-runner-b` | runner produced by `pnpm faucet` — `token_id 1` | [`GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE`](https://stellar.expert/explorer/testnet/account/GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE) | STE-6 |
| STE-11 e2e runner | the account whose PII went through the API — `token_id 2` | [`GCYYG7CP3RCOSRSAFPQGY6MTAT2DVF5HTSLNCWRIR2PF626CHZMVGIEE`](https://stellar.expert/explorer/testnet/account/GCYYG7CP3RCOSRSAFPQGY6MTAT2DVF5HTSLNCWRIR2PF626CHZMVGIEE) | STE-11 |
| `sterun-test-a` | SEP-41 `transfer` testing | [`GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF`](https://stellar.expert/explorer/testnet/account/GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF) | STE-30 |
| `sterun-test-b` | SEP-41 `transfer` testing | [`GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS`](https://stellar.expert/explorer/testnet/account/GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS) | STE-30 |

The `sUSD` asset itself:
<https://stellar.expert/explorer/testnet/asset/sUSD-GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW>

> **Everything here is TESTNET.** Nothing has real value. What gets committed is only public
> addresses (`G...`), contract addresses (`C...`) and tx hashes — never a secret key.

Environment variables for clients (the STE-15 SDK, the STE-16 indexer, the STE-17/18/21/22 apps):

```bash
STELLAR_NETWORK=testnet
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
# v2 — add-ons + upgradeable + Cancelled (STE-35). This is what be/ and fe/ use.
# Interface: docs/specs/INTERFACE.md v2.1.0
EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW
# v1 — still on chain and still verifiable; nothing in this repository points at it.
# EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
# RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
SUSD_ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
```

v2's `enter` takes a different signature (`addon_ids` as the fourth argument), so do **not** point v2
bindings at a v1 address or the other way round — the host rejects the call rather than failing
gracefully.

---
## sUSD (Sterun USD) — the testnet payment asset

`sUSD` is a classic Stellar asset we issue ourselves for testnet, used as the entry-fee token in
RaceRecord. Its design is in `docs/SYSTEM_DESIGN.md` §3.3: the fee flows **straight from runner to
organiser** through a cross-contract `transfer` to the SAC, and the price is stored as an `i128` in a
**7-decimal** representation.

### Identity and parameters

| Item | Value |
| --- | --- |
| Asset code | `sUSD` |
| Full name | Sterun USD |
| Network | Stellar **testnet** (`Test SDF Network ; September 2015`) |
| Issuer (`G...`) | `GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW` |
| Distributor (`G...`) | `GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO` |
| SAC contract address (`C...`) | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| Initial supply | **1,000,000 sUSD** (`10000000000000` raw units / stroops) |
| Decimals | **7** (inherent to a classic Stellar asset) |
| Issuer auth flags | **none** — `auth_required=false`, `auth_revocable=false`, `auth_immutable=false`, `auth_clawback_enabled=false` |

**No auth flags** was a deliberate choice for v1: without `AUTH_REQUIRED` anyone can open a trustline
and receive sUSD without the issuer approving it, so there is zero friction in testing.

### Local identity aliases (Stellar CLI)

These aliases are used in every command below. An alias only exists on one person's machine; the
`G...` address is what is authoritative.

| Alias | Address (`G...`) | Purpose |
| --- | --- | --- |
| `sterun-susd-issuer` | `GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW` | issues the asset |
| `sterun-susd-distributor` | `GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO` | holds the supply, the faucet's source |
| `sterun-test-a` | `GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF` | `transfer` test account |
| `sterun-test-b` | `GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS` | `transfer` test account |

### Explorer links (stellar.expert, testnet)

- Issuer: <https://stellar.expert/explorer/testnet/account/GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW>
- Distributor: <https://stellar.expert/explorer/testnet/account/GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO>
- The `sUSD` asset: <https://stellar.expert/explorer/testnet/asset/sUSD-GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW>
- **The SAC contract**: <https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU>
- Test account `sterun-test-a`: <https://stellar.expert/explorer/testnet/account/GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF>
- Test account `sterun-test-b`: <https://stellar.expert/explorer/testnet/account/GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS>

### Issuance transactions (classic)

All successful on testnet (`successful=true`):

| Step | Tx hash | Ledger |
| --- | --- | --- |
| `change-trust` distributor → sUSD | [`5d5df86f…`](https://stellar.expert/explorer/testnet/tx/5d5df86f8b686177d17af9dcbb8610d61022cdf2e042b1ab55144e42f0f334f8) | 4431614 |
| `change-trust` test-a → sUSD | [`703d83a7…`](https://stellar.expert/explorer/testnet/tx/703d83a7fa531a487ea4ac274072527287532e25f27c54bf98bed6fe3f1e5f9a) | 4431615 |
| `change-trust` test-b → sUSD | [`5ae1e0fb…`](https://stellar.expert/explorer/testnet/tx/5ae1e0fb1fdcdb128615662f457f4b26ee0dda5217ed8ba05ba85e6760c50984) | 4431616 |
| `payment` issuer → distributor, 1,000,000 sUSD | [`d26d2b42…`](https://stellar.expert/explorer/testnet/tx/d26d2b425aeaa667933b4cec07509352270a113bf315bb6f5022bfb1cce888c5) | 4431619 |

The commands that were run (an issuer needs no trustline to its own asset):

```bash
ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
DIST=GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO

# 1. create + fund the identities (Friendbot)
stellar keys generate sterun-susd-issuer      --network testnet --fund
stellar keys generate sterun-susd-distributor --network testnet --fund

# 2. the distributor's trustline
stellar tx new change-trust \
  --source-account sterun-susd-distributor \
  --line "sUSD:$ISSUER" \
  --network testnet

# 3. issue 1,000,000 sUSD (--amount is in stroops: 1,000,000 x 10^7)
stellar tx new payment \
  --source-account sterun-susd-issuer \
  --destination "$DIST" \
  --asset "sUSD:$ISSUER" \
  --amount 10000000000000 \
  --network testnet
```

> ⚠️ `--amount` in `stellar tx new payment` is always in **stroops** (1 stroop = 0.0000001 of the
> asset). So 1,000,000 sUSD is `10000000000000`. Getting this wrong puts the supply out by a factor
> of ten million.

---

## The sUSD Stellar Asset Contract (SAC)

For the classic `sUSD` asset to be usable from inside a Soroban contract, it has to be exposed
through its **Stellar Asset Contract**. The SAC is what implements the **SEP-41** token interface
(CAP-46-6), and this address is the one RaceRecord holds in order to call
`transfer(runner, organiser, price)` cross-contract.

| Item | Value |
| --- | --- |
| SAC contract address | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| Wrapped asset | `sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW` |
| Network | testnet |
| Deploy tx | [`92ffd8e2…`](https://stellar.expert/explorer/testnet/tx/92ffd8e2fb1b4562834011e5bc97ad73153750d38409e3671ebad5f3574e1f72) (ledger 4431623) |
| Explorer | <https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU> |

A SAC **has no wasm hash of its own** — the implementation is built into the Soroban host rather than
being wasm we uploaded. So a "wasm hash" column genuinely does not apply to this row.

The deploy command:

```bash
stellar contract asset deploy \
  --asset sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW \
  --source-account sterun-susd-issuer \
  --network testnet
# => CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
```

This SAC address is **deterministic** from `(asset, network passphrase)`: anyone running
`stellar contract id asset --asset sUSD:<ISSUER> --network testnet` gets the same address. It only
needs deploying once; running the command above again yields the same address (or an "already
deployed" error), not a new contract.

---

## Getting a trustline + sUSD for testing (for James and Ancung)

To hold sUSD at all, an account **must** have a trustline first. Without one, `transfer` through the
SAC fails — and because `enter` is atomic, the whole entry rolls back with it.

**Since STE-6 this is one command** (from the repository root):

```bash
pnpm install     # once
pnpm faucet --new
```

```
generated a new testnet keypair — the secret is printed once and saved nowhere:
  public  GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE
  secret  S…

account GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE
  1/3 XLM       account created and funded by Friendbot
  2/3 trustline opened for sUSD
  3/3 payout    12.5 sUSD sent, tx 3688fa62…
  balance seen by contracts (SAC): 12.5 sUSD
```

That last line is read through the **SAC**, not Horizon. Deliberately: `RaceRecord.enter` calls
`balance` on the SAC when it charges the fee, so that is the number deciding whether a runner can
pay. A balance visible in an explorer but invisible to the contract is of no use.

| Your situation | Command |
| --- | --- |
| no account yet | `pnpm faucet --new` |
| already have an account | `pnpm faucet --secret S...` |
| do **not** hold the distributor key | `pnpm faucet --new --no-payout` → account + trustline ready, then ask the PM for sUSD |
| need a different amount | `pnpm faucet --secret S... --amount 25` |

Every step is safe to repeat: run it twice and the second run only reads and reports `already
present`. Paying out sUSD needs `SUSD_DISTRIBUTOR_SECRET` in `be/.env`; without it the first two
steps still run and the tool says what is missing.

The issuer, distributor and SAC addresses are **not hardcoded** in the backend — they are read from
this file. If anything is ever redeployed, change the table in this document and the faucet follows
on its own.

### Evidence: an account made by the faucet really can `enter`

This is what makes the faucet more than "appeared to work". The account `GD7DHD3F…YVCE` above —
which five minutes earlier did not exist on the network — called `enter` on the live RaceRecord:

Tx: [`60948206…`](https://stellar.expert/explorer/testnet/tx/609482066aa04f3147e11c5cbdc3a2a88025ad83e31e459f4cac56c22e232c97)

```
slot_reserved   CDL6A734…  event_id 0, category_id 0, seq 1
transfer        CBQ6444…   GD7DHD3F… → GBGUI5MP…, 50000000 (5 sUSD)
mint            CDWFNF42…  to GD7DHD3F…, token_id 1
record_entered  CDWFNF42…  event_id 0, token_id 1, bib_no 1
```

From nothing to holding a record: one faucet command, one `enter` call.

### Doing it by hand (if you would rather not use Node)

```bash
ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW

# 1. have a funded testnet account
stellar keys generate <your-name> --network testnet --fund

# 2. open a trustline to sUSD (the default limit is the i64 maximum, fine for testing)
stellar tx new change-trust \
  --source-account <your-name> \
  --line "sUSD:$ISSUER" \
  --network testnet
```

Once the trustline is active, ask whoever holds the `sterun-susd-distributor` alias (the PM) for a
balance.

From a frontend or wallet (Freighter, Stellar Wallets Kit) this trustline is a classic `changeTrust`
operation with the `sUSD` asset and the issuer above — not a contract call.

---

## An important note: testnet vs mainnet

- **sUSD is a testnet-only asset.** It exists so the team does not depend on a third-party USDC
  faucet and so the payment flow can be tested end to end right now.
- **Mainnet will use USDC (Circle)**, not sUSD. sUSD is **out of scope for mainnet** and must not
  travel to a production deployment.
- Because both are classic Stellar assets with **7 decimals** and both are exposed to contracts
  through a SAC (SEP-41), swapping sUSD for USDC only changes the **SAC address** RaceRecord holds.
  No contract logic changes.

---

## Verifying SEP-41 through the SAC

Every command below was **genuinely run** and its output copied verbatim. A reviewer can re-run the
read-only ones (`decimals`, `name`, `symbol`, `balance`) at any time — they need no secret key, just
any testnet account as `--source-account`.
```bash
SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
DIST=GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO
A=GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF
B=GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS
```

### 1. Token metadata

```bash
$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- decimals
7

$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- name
"sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW"

$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- symbol
"sUSD"
```

| Function | Returned value | Note |
| --- | --- | --- |
| `decimals` | `7` | ✅ matches `SYSTEM_DESIGN.md` §3.3 — prices are `i128` in a 7-decimal representation |
| `name` | `"sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW"` | the SAC's built-in format is `CODE:ISSUER`, not "Sterun USD" |
| `symbol` | `"sUSD"` | ✅ exactly the asset code |

> A note for the frontend: the SAC's `name` is **not** a name fit to show a user (it contains
> `CODE:ISSUER`). For UI, use the label "sUSD (Sterun USD)" from the application side rather than
> whatever `name` returns.

### 2. The initial supply is visible through the SAC

```bash
$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- balance --id $DIST
"10000000000000"
```

`10000000000000` = 1,000,000 sUSD × 10^7. ✅ matches the initial supply.

### 3. Positive case — `transfer` really does move a balance

Funding `sterun-test-a` was deliberately done **through the SAC** (`transfer`) rather than with a
classic `payment`, so the exact contract path RaceRecord uses is exercised too.

```bash
# distributor -> A, 250 sUSD
$ stellar contract invoke --id $SAC --source-account sterun-susd-distributor --network testnet --send=yes \
    -- transfer --from $DIST --to $A --amount 2500000000
✅ Transaction submitted successfully!
📅 CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU - Success - Event: TransferWithAmountOnly (transfer),
   from: "GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO",
   to: "GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF", amount: "2500000000"

# A -> B, 100 sUSD, signed by A itself
$ stellar contract invoke --id $SAC --source-account sterun-test-a --network testnet --send=yes \
    -- transfer --from $A --to $B --amount 1000000000
✅ Transaction submitted successfully!
📅 CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU - Success - Event: TransferWithAmountOnly (transfer),
   from: "GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF",
   to: "GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS", amount: "1000000000"
```

Balances through `balance` (raw units, 7 decimals) — before and after the 100 sUSD (`1000000000`)
`transfer` from A to B:

| Account | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `sterun-test-a` | `2500000000` (250 sUSD) | `1500000000` (150 sUSD) | −`1000000000` |
| `sterun-test-b` | `0` | `1000000000` (100 sUSD) | +`1000000000` |
| `sterun-susd-distributor` | `10000000000000` | `9997500000000` | −`2500000000` (funding A) |

✅ The balance genuinely moved, the total is conserved, and no sUSD was created or destroyed.

Tx hashes:

| Action | Tx hash | Ledger |
| --- | --- | --- |
| SAC `transfer` distributor → A, 250 sUSD | [`18a4a517…`](https://stellar.expert/explorer/testnet/tx/18a4a5178194ad597218b184ba0687879ce862248dc22049f961867f803b37a7) | 4431631 |
| SAC `transfer` A → B, 100 sUSD | [`3c94cf52…`](https://stellar.expert/explorer/testnet/tx/3c94cf524d8760f73ab33f71e6fa9222b343dbfe33af6be9dccf7ce551dfb3d0) | 4431635 |

### 4. Negative case — the `transfer`s that should fail, do

```bash
# B (holding 100 sUSD) tries to send 999 sUSD
$ stellar contract invoke --id $SAC --source-account sterun-test-b --network testnet --send=yes \
    -- transfer --from $B --to $A --amount 9990000000
❌ error: transaction simulation failed: HostError: Error(Contract, #10)
   [Diagnostic Event] ... data:["resulting balance is not within the allowed range", 0, -8990000000, 9223372036854775807]

# A tries to transfer a negative amount
$ stellar contract invoke --id $SAC --source-account sterun-test-a --network testnet --send=yes \
    -- transfer --from $A --to $B --amount -1
❌ error: transaction simulation failed: HostError: Error(Contract, #8)
   [Diagnostic Event] ... data:["negative amount is not allowed", -1]
```

✅ Both are rejected at simulation, so no transaction reaches the ledger and no balance changes. This
matters for STE-9: RaceRecord does not need to write balance guards of its own — the SAC already
reverts, and because `enter` is atomic, a failed `transfer` cancels the quota reservation and the
mint with it.

Separately, an account **without an sUSD trustline** cannot receive sUSD at all. That is a
consequence of classic assets rather than a bug — which is why STE-6 (the faucet / trustline helper)
has to make sure a runner has a trustline **before** they try to `enter`.

---

## Handoff — who uses these addresses

The SAC address `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` is the **only** token
address used on testnet. Its consumers:

- **STE-9 — the RaceRecord contract.** `enter` makes a cross-contract call to
  `transfer(runner, organiser, price)` on this SAC. The SAC address is stored as contract config (set
  at init/deploy) and must **not** be hardcoded inside the contract, so that switching to USDC on
  mainnet is a config value change.
- **STE-6 — the faucet / trustline helper (James).** Needs the issuer `G...` (to build the
  `changeTrust` operation in the frontend or backend) and the distributor alias as the faucet's
  source of balance. Mind the ordering: fund the account → trustline → only then send sUSD.
- **STE-33 — testnet deploy + wiring.** When EventRegistry and RaceRecord were deployed, this SAC
  address was installed as the payment token, and the results were recorded in the **Soroban
  contracts** section below.

---

## Soroban contracts — LIVE on testnet (STE-33, 2026-09-01)

Both Sterun contracts are live on Stellar testnet and wired to each other. The deploy was done by
[`sc/scripts/deploy-testnet.sh`](../sc/scripts/deploy-testnet.sh) rather than typed by hand, so it is
auditable and repeatable.

| Contract | Contract address (`C...`) | Wasm hash (on-chain) | Explorer link |
| --- | --- | --- | --- |
| **EventRegistry v1** (C1, STE-5) | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` | `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` | <https://stellar.expert/explorer/testnet/contract/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64> |
| **RaceRecord v1** (C2, STE-9) | `CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4` | `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` | <https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4> |
| **SAC sUSD** (STE-30) | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` | — (built into the host, not wasm) | <https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU> |

### The wasm hashes are read from the chain, not from a local file

The "Wasm hash" column above is **not** the output of `shasum` on anybody's laptop — it is what
`stellar contract info hash --contract-id <C...> --network testnet` returns, so what is reported is
the code the contract actually executes. Anyone can repeat it:

```bash
stellar contract info hash --contract-id CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64 --network testnet
# 61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474
```

And **both match exactly** the frozen artefact hashes in `docs/specs/INTERFACE.md` §0 and
`sc/README.md`. So the contracts live on testnet are the same wasm that produced the TS bindings in
`sc/bindings/` — not some other, similar build.

> That is a pleasant coincidence rather than a promise. `sc/README.md` records that Rust builds are
> not bit-for-bit reproducible across machines (Linux CI produces a different `event_registry.wasm`
> hash than macOS). What makes the rows above match is that the deploy ran from the same machine that
> froze the spec, **and** that `deploy-testnet.sh` uses `stellar contract upload --optimize=false`
> followed by `deploy --wasm-hash` — rather than `deploy --wasm`, which would re-optimise and change
> the bytes.

### Deploy parameters

| Item | Value |
| --- | --- |
| Network | Stellar **testnet** (`Test SDF Network ; September 2015`) |
| Admin / deployer | `GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` (alias `sterun-admin`) |
| EventRegistry constructor | `admin` = the address above |
| RaceRecord constructor | `admin` = the address above · `registry` = `CDL6A734…GTA64` · `token` = `CBQ6444…MOOU` (the sUSD SAC) · `name` = `Sterun Race Record` · `symbol` = `STERUN` · `base_uri` = `https://sterun.xyz/record/` |
| Upgradeability | **none** — v1 is non-upgradeable, per `docs/SYSTEM_DESIGN.md` §11 |

`token` is deliberately a constructor parameter rather than a constant: moving to Circle's USDC on
mainnet only changes this value, without a single line of contract code changing.

### Deploy transactions

| Step | Tx |
| --- | --- |
| `upload` the EventRegistry wasm | [`1f088e37…`](https://stellar.expert/explorer/testnet/tx/1f088e37c97e246bbe11aee484bd35d14864cbac1c855e41781ccefdb3d3ba9c) |
| `upload` the RaceRecord wasm | [`295000e0…`](https://stellar.expert/explorer/testnet/tx/295000e0defa1b995bd72572c41a881819b7663aa3cba0c8f2a3076f3e0fd825) |
| `deploy` EventRegistry (+ `__constructor`) | [`0d50c6f0…`](https://stellar.expert/explorer/testnet/tx/0d50c6f008ac15ff34431b74690d0cfcfe1a8fc529ff93de5df35824ce2d8751) |
| `deploy` RaceRecord (+ `__constructor`) | [`ab95f07c…`](https://stellar.expert/explorer/testnet/tx/ab95f07cf49dba9fc3cd35d5a6a06fed48118c3fa2a2c6064572b0968e1abd5f) |
| `set_race_record` (wiring, once and only once) | [`25e6c16d…`](https://stellar.expert/explorer/testnet/tx/25e6c16d41e7445940be05d6b99a2775ab7a477ca990c3dc314ebf571bead30d) |

### The wiring, verified (read-only, anyone can repeat it)

```bash
ER=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RR=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4

$ stellar contract invoke --id $ER --source-account <any-testnet-account> --network testnet -- get_race_record
"CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4"

$ stellar contract invoke --id $RR --source-account <any-testnet-account> --network testnet -- get_registry
"CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64"

$ stellar contract invoke --id $RR --source-account <any-testnet-account> --network testnet -- get_token
"CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU"

$ stellar contract invoke --id $ER --source-account <any-testnet-account> --network testnet -- event_count
1
```

`set_race_record` is **one-shot**: a second call is rejected with `Error(Contract, #7)`
(`RaceRecordAlreadySet`) — demonstrated below. So the trusted caller of `reserve_slot` cannot be
swapped by anyone, the admin included.

---

## On-chain sanity check — a full rehearsal on real testnet

Not a simulation and not a unit test: everything below is a transaction that genuinely reached the
testnet ledger.
### The accounts used

| Role | Alias | Address |
| --- | --- | --- |
| Admin / deployer | `sterun-admin` | `GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` |
| Organiser | `sterun-organiser` | `GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN` |
| Runner | `sterun-runner-a` | `GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR` |

### 1. Setting up the event (organiser)

| Step | Result | Tx |
| --- | --- | --- |
| `create_event` | `event_id = 0`, `EventCreated` emitted | [`4d1590cb…`](https://stellar.expert/explorer/testnet/tx/4d1590cbe9f34624b181d45d467392ea7648b48843db6fe2449465a5f114ac2a) |
| `add_category` `10K`, quota 5, price 5 sUSD | `category_id = 0`, `CategoryAdded` emitted | [`fe0cc483…`](https://stellar.expert/explorer/testnet/tx/fe0cc48398ddb5519095130fe7be672cb74966749f7be56a96d98a49d8db5106) |
| `set_event_status` → `Open` | `EventStatusChanged` emitted | [`a4f3a72a…`](https://stellar.expert/explorer/testnet/tx/a4f3a72adb3e09ee7bbd836d9774dcdf88c054c64fcdfdf9094e599755b11f03) |

### 2. `enter` — one transaction, and the frozen event order proven on chain

The runner called `enter` once; the price is 5 sUSD (`50000000` stroops). What is interesting is not
only that it worked but the **event log**: four events from **three different emitters**, in exactly
the order frozen in `docs/specs/INTERFACE.md` §2.3 and guarded by the test
`enter_emits_four_events_from_three_emitters_in_the_frozen_order`.

Tx: [`3947eae3…`](https://stellar.expert/explorer/testnet/tx/3947eae36c104a6f880d09216ca83d75a08cacbb6db24180d057a1e71cedb85a)

| # | Event | Emitter | Contents |
| --- | --- | --- | --- |
| 1 | `slot_reserved` | `CDL6A734…` EventRegistry | `event_id: 0, category_id: 0, seq: 0` |
| 2 | `transfer` | `CBQ6444…` sUSD SAC | runner → organiser, `50000000` |
| 3 | `mint` | `CDWFNF42…` RaceRecord | `to: runner, token_id: 0` |
| 4 | `record_entered` | `CDWFNF42…` RaceRecord | `runner, event_id: 0, token_id: 0, bib_no: 0` |

This is why the indexer (STE-16) has to key on **contract id** rather than position: a free category
(`price_usdc == 0`) does not emit event number 2 at all.

The balance genuinely moved, checked through the SAC:

| Account | Before | After |
| --- | ---: | ---: |
| Runner | `500000000` (50 sUSD) | `450000000` (45 sUSD) |
| Organiser | `0` | `50000000` (5 sUSD) |

### 3. The record that was born can be verified by anyone

```bash
$ stellar contract invoke --id $RR --source-account <testnet-account> --network testnet -- record_of --token_id 0
{"bib_no":0,"category_id":0,"claimed_at":null,"entered_at":1788252277,"event_id":0,
 "finish_time_s":null,
 "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
 "result_at":null,"state":"Entered"}

$ ... -- verify --token_id 0 --participant_hash feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29
true
$ ... -- verify --token_id 0 --participant_hash 0000000000000000000000000000000000000000000000000000000000000000
false

$ ... -- owner_of --token_id 0      => "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR"
$ ... -- records_of --runner GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR   => [0]
$ ... -- total_supply               => 1
```

The `participant_hash` used is **not an invented number**: it is `expected_hash_hex` from the
`ph-04-messy-whitespace` vector in
[`docs/specs/vectors/participant_hash.json`](specs/vectors/participant_hash.json). So anyone can
derive that hash themselves from its raw input with `bash docs/specs/verify.sh` and match it against
what is stored on chain.

### 4. The full lifecycle: Entered → RacepackClaimed → Finished

| Step | Result | Tx |
| --- | --- | --- |
| `claim_racepack` by the organiser | `RacepackClaimed` emitted, `claimed_at` filled in | [`d3d4b5b3…`](https://stellar.expert/explorer/testnet/tx/d3d4b5b39f25db4ebc5a356d9f3cae34ec3a30ea0526f5adfec4ad3819df8156) |
| `record_finish` 3161 seconds (00:52:41) | `RecordFinished` emitted | [`bb03229e…`](https://stellar.expert/explorer/testnet/tx/bb03229e880230defac4d1dab73bd5e7e550eb87d5f78b93fd3779a7d78ae52a) |

The final state:

```json
{"bib_no":0,"category_id":0,"claimed_at":1788252342,"entered_at":1788252277,"event_id":0,
 "finish_time_s":3161,
 "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
 "result_at":1788252352,"state":"Finished"}
```

### 5. Negative cases — the guards are alive on chain, not only in tests

The three calls below were run **deliberately** and failed **deliberately**. None of them reached the
ledger as a state change.

| Call | Result | What it means |
| --- | --- | --- |
| `record_finish` while the state is still `Entered` | `Error(Contract, #103)` | `InvalidState` — a finish cannot be recorded for a race pack that was never collected |
| `claim_racepack` a second time | `Error(Contract, #102)` | `AlreadyClaimed` — the **anti-double-race-pack guard**; one pack per entry is guaranteed by the chain, not by a volunteer's discipline |
| `set_race_record` a second time (by the admin themselves) | `Error(Contract, #7)` | `RaceRecordAlreadySet` — the trusted caller of `reserve_slot` cannot be swapped, not even by the admin |
| `reserve_slot` called directly from an EOA | the CLI demands a signature from the contract address `CDWFNF42…` | the invoker-contract gate: only RaceRecord can reserve a slot; an EOA will never hold that key |

Notice the first two numbers against the third: `#103` and `#102` are in the `100..=199` band
(RaceRecord), `#7` is in the `1..=99` band (EventRegistry). The tooling shows only a bare number with
no contract identity — **the band** is what lets the SDK (STE-15) pick the right error map. This is a
direct demonstration of why the bands exist.

### 6. Non-transferable, checked against the live contract

```bash
$ stellar contract info interface \
    --contract-id CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4 \
    --network testnet \
  | grep -cE '^[[:space:]]*fn (transfer|transfer_from|approve|approve_for_all|burn|burn_from)\('
0
```

Zero. The contract people actually call exports **18 functions**, and not one of them can move a
record. Not because a guard refuses — because the function does not exist. (EventRegistry: 16
functions.)

---

## The v2 contracts — LIVE on testnet (STE-35, 2026-09-09)

A **second** pair rather than a replacement in place: v1 has no `upgrade` function, so adding the
paid add-ons Ancung asked for (STE-35) **had** to mean new addresses. An upgrade mechanism was fitted
at the same time, so that this is the last time an address changes.

| Contract | Address | On-chain wasm hash (sha256) | Explorer |
| --- | --- | --- | --- |
| **EventRegistry** (C1) | `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | <https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU> |
| **RaceRecord** (C2) | `CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW` | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | <https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW> |

> The RaceRecord hash in this table is **not** the hash it was deployed with. That address was
> upgraded once after deployment, to genuinely different wasm — section 7 below. That is what v2 is
> for: the address stays, the code changes.

The frozen interface that applies to this pair: **`docs/specs/INTERFACE.md` v2.0.0**. What was
deployed is `bash sc/scripts/deploy-testnet.sh` as-is, and **all** of the output below is copied from
a single run of that script.

### Deploy parameters

| Contract | Constructor arguments |
| --- | --- |
| EventRegistry v2 | `admin = GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` |
| RaceRecord v2 | `admin = GA5CC…HNYP`, `registry = CAPB6…SHJU`, `token = CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (the sUSD SAC), `name = "Sterun Race Record"`, `symbol = "STERUN"`, `base_uri = "https://sterun.xyz/record/"` |

The `set_race_record` wiring (admin, once and only once):
<https://stellar.expert/explorer/testnet/tx/1d518f9d1701d0283605e9a6dcf4e57b43da94d3d995db2d3db5f32fc6ed27b8>

```
EventRegistry.get_admin        "GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP"
EventRegistry.get_race_record  "CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW"
RaceRecord.get_registry        "CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU"
RaceRecord.get_token           "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU"
```

### 1. Paid add-ons, charged in ONE transfer

Rehearsal event `event_id 0`: a `10K` category at 5 sUSD, plus two add-ons — a jersey at 5 sUSD with
a quota of 2, and a tumbler at 3 sUSD with a quota of 1.

```
event_id=0 category_id=0 quota=5 price=5 sUSD
addon jersey=0 (5 sUSD, quota 2)  tumbler=1 (3 sUSD, quota 1)
addon_count=2
```

`enter` with both add-ons:

```
token_id=0
record_of  {"addon_ids":[0,1],"bib_no":0,"category_id":0,"claimed_at":null,
            "entered_at":1788925832,"event_id":0,"finish_time_s":null,
            "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
            "result_at":null,"state":"Entered"}
organiser received 130000000 stroops = category 5 + jersey 5 + tumbler 3 sUSD, in one transfer
jersey  {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":1}
tumbler {"code":"TUMBLER","price_usdc":"30000000","quota":1,"reserved_count":1}
```

That `130000000` is **asserted by the script**, not merely printed: the organiser's balance is read
before and after, and a difference that is not 5+5+3 sUSD fails the deploy. The record carries
`addon_ids` `[0,1]`, so the merchandise desk can verify a purchase from the chain rather than from an
order email.

### 2. The add-on guards fire on a real network

```
the same add-on id twice:                       reverted with #107, as designed
more add-on ids than the event has:             reverted with #106, as designed
the tumbler, whose quota of 1 is already gone:  reverted with #15, as designed
```

`#106`/`#107` belong to RaceRecord (band `100..=199`), `#15` to EventRegistry (band `1..=99`),
propagating out of `enter` unchanged — exactly what the error bands are for.

**All-or-nothing, read back from the chain** after the three rejections above:

```
category {"code":"10K","distance_m":10000,"entered_count":1,"price_usdc":"50000000","quota":5}
jersey   {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":1}
runner-b sUSD "975000000" (unchanged: nothing was charged)
```

`entered_count` is still 1 (only the first entry), one jersey is still the stock used, and runner-b's
balance did not move at all. No slot was burned and no money was taken.

The stock that remains is still purchasable:

```
token_id=1 charged 100000000 stroops = category 5 + jersey 5 sUSD
record {"addon_ids":[0],"bib_no":1,...,"state":"Entered"}
jersey {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2} (sold out now)
a third buyer for the jersey:  reverted with #15, as designed
```

### 3. `Cancelled`

Event `event_id 1` was created, opened, then cancelled:

```
{"metadata_hash":"a4ea685c…","name":"Sterun Cancelled Rehearsal",
 "organiser":"GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
 "starts_at":1789000000,"status":"Cancelled","uri":"https://sterun.xyz/events/cancelled.json"}

entering a cancelled event:    reverted with #4, as designed
re-opening a cancelled event:  reverted with #11, as designed
```
`#4` is EventRegistry's `EventNotOpen`: `reserve_slot` demands `Open`, so no extra guard had to be
written to stop entries into a cancelled event. `#11` is `InvalidStatus`: `Cancelled` is terminal.

### 4. Upgrade — actually run on testnet, not only in `cargo test`

A non-admin is refused before the transaction is even formed (the CLI simulates, and the simulation
says the signature required is the **stored** admin's, not the caller's):

```
a non-admin upgrading EventRegistry:
  rejected: the call requires GA5CCSCQ… (the stored admin) to sign, as designed
```

Then the admin upgraded **both** contracts. A `contract_upgraded` event was emitted by each:

| Contract | Upgrade tx | Event |
| --- | --- | --- |
| EventRegistry v2 | <https://stellar.expert/explorer/testnet/tx/0785274b240b43625abb6270b94d392e2ac234e503e85cffb55c9dfc2f1892a9> | `ContractUpgraded new_wasm_hash: "22bb432e…"` |
| RaceRecord v2 | <https://stellar.expert/explorer/testnet/tx/c89d4f7cde7633ca15fada634ec0fd84e8523156bf2ef383ee6d770f86593280> | `ContractUpgraded new_wasm_hash: "c90a4281…"` |

State written **before** the upgrade, read **after** it:

```
event      {"…","name":"Sterun Testnet Rehearsal","status":"Open",…}
category   {"code":"10K","distance_m":10000,"entered_count":2,"price_usdc":"50000000","quota":5}
jersey     {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2}
record     {"addon_ids":[0,1],"bib_no":0,…,"finish_time_s":3161,"state":"Finished"}
owner_of   "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR"
verify     true
addon_count 2
```

Including OpenZeppelin's own keys (`owner_of`) and a record already `Finished` — intact, and `verify`
still `true` against the same `participant_hash`.

That upgrade installed the **same** wasm that was already running. It is not a weaker test for it:
what was under test is the mechanism, the admin gate, and storage surviving. Installing different
wasm would have meant deploying a second, unreviewed artefact only to throw it away.

### 5. Non-transferable, checked against the upgraded contract

```
0 transfer-ish exports on the upgraded RaceRecord
```

Read from `stellar contract info interface --contract-id` against the live network, **after** the
upgrade. Note where the claim now stops (`docs/specs/INTERFACE.md` §4): what is proven is the wasm
that is **installed**; that the admin key will not install different wasm is a trust assumption, and
that is exactly why every upgrade leaves a `contract_upgraded` in the ledger.

### 6. The v1 lifecycle is still intact

The old guards were re-tested on the new pair and behaved identically:

```
record_finish before the racepack is claimed:  reverted with #103, as designed
set_race_record a second time:                 reverted with #7, as designed
claim_racepack a second time:                  reverted with #102, as designed
```

### 7. Upgrading in place — DIFFERENT wasm, the same address

Section 4 above upgraded to the same wasm that was already running. This one is different: an
internal optimisation in `RaceRecord.enter` (skipping the cross-contract `addon_count` call when
`addon_ids` is empty, so an entry without add-ons costs exactly what it did in v1) produced new wasm,
and that wasm was installed at the **already-live address** with `bash sc/scripts/upgrade-testnet.sh`.

```
=== EventRegistry (CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) ===
  live  22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f
  built 22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f
  identical — skipped, so the ledger records no upgrade that did not happen

=== RaceRecord (CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) ===
  live  c90a428152f0d8605cbb7466128b32b6dc821aa4735d930c280fe6fd4b58c0fc
  built 27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b
  uploaded 27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b
  now running 27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b
```

EventRegistry was **skipped** because its wasm had not changed. That is not laziness: an upgrade to
an identical hash still costs a transaction and still writes `contract_upgraded` to the ledger, which
would make the audit trail claim a code change that never happened.

The RaceRecord upgrade tx:
<https://stellar.expert/explorer/testnet/tx/db3a27434e1e5da9f5eac38b3ca23c7670d0c773137b46fa13e5262697420488>

```
Event: ContractUpgraded (contract_upgraded),
new_wasm_hash: "27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b"
```

State written by the old code, read by the new:

```
event 0     {…,"name":"Sterun Testnet Rehearsal","status":"Open",…}
category 0  {"code":"10K","distance_m":10000,"entered_count":2,"price_usdc":"50000000","quota":5}
addon 0     {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2}
addon_count 2
record 0    {"addon_ids":[0,1],"bib_no":0,…,"finish_time_s":3161,"state":"Finished"}
owner_of 0  "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR"
supply      2
0 transfer-ish exports
```

And the very path the optimisation changed was exercised **after** the upgrade — an `enter` with
`addon_ids: []` against the contract whose code had just changed:

```
participant_hash = 764ec34cb935be1954e1205cac16b650d9f4ab100e421c97453ced4bdfb67243
token_id = 2   charged = 50000000 stroops (the category price only, no add-ons)
record   {"addon_ids":[],"bib_no":2,"category_id":0,"entered_at":1788926622,"event_id":0,
          "state":"Entered",…}
addon 0  {"code":"JERSEY",…,"quota":2,"reserved_count":2}   ← stock untouched
```

The third record was born from **different** code than the code that produced records 0 and 1, at the
same contract and the same address, with `total_supply` continuing across. That is the most direct
evidence that the promise "this is the last time an address changes" can be held to.

---

## STE-11 e2e evidence — a hash from the backend accepted by the live contract

The rehearsal above used a `participant_hash` from a vector file. This is what proves the **real
backend** produces a value the contract accepts: PII goes in through the API, the hash comes out, and
that hash is what `enter` uses.

| # | Step | Result |
| --- | --- | --- |
| 1 | `pnpm faucet` for a freshly created account | account `GCYYG7CP…GIEE` holds 50 sUSD |
| 2 | `POST /auth/challenge` + a signed nonce | single-use nonce, verified |
| 3 | `POST /participants` with messy PII (NBSP, TAB, LF, a hyphenated national ID) | `participant_hash = dc86cb0d…15d1`, salt + `totp_secret` returned **once**; the response carries no fragment of PII |
| 4 | `enter` on the **live** RaceRecord with that hash | `token_id = 2`, `bib_no = 2` — [`54c24055…`](https://stellar.expert/explorer/testnet/tx/54c24055a7bdc36e86531bbf686f8eebfd27f59be596258e8cbc89e90914630e) |
| 5 | `verify(2, dc86cb0d…15d1)` on the contract | **`true`** |
| 6 | `POST /participants/2/confirm` | the vault row is linked to `token_id 2` and its tx hash |
| 7 | `GET /participants/:id` | metadata only — zero PII in the body |
| 8 | the roster handoff (STE-16) | `totp_secret` found from the `token_id`, producing a 6-digit check-in code |
| 9 | `SELECT name_enc` straight out of Postgres | 62 bytes of ciphertext; `includes("Siti")` → **false** |

What steps 4 and 5 prove, and no local test could: the backend's normalisation (NFC, collapsing
whitespace, stripping national-ID separators) produces **byte-for-byte the same** input that
`env.crypto().sha256()` hashes inside the Soroban host. If the backend and the spec ever diverged by
a single byte, step 5 would return `false`.

The `token_id 2` record in RaceRecord: <https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4>

---

## STE-16 e2e evidence — the indexer, rebuild and TTL keeper against live testnet

Run on **2026-09-02**, against the contracts live in the sections above and the testnet RPC
(`https://soroban-testnet.stellar.org`). No mocks and no fixtures: every row below derives from an
`enter`, a `claim_racepack` and a `record_finish` that genuinely happened on chain during the STE-33
and STE-11 rehearsals.

Local Postgres 17.6, empty database. The commands are exactly the ones in `be/OPERATIONS.md`.

### 1. The poller: `getEvents` -> Postgres

```
$ pnpm indexer poll        # repeated until lastLedger >= latestLedger
poll  1: fetched=0  applied=0  last=4348835  latest=4469782
...
poll  9: fetched=14 applied=14 last=4446532  latest=4469791
poll 12: fetched=0  applied=0  last=4469794  latest=4469794   -> caught up
```

The RPC scans 10,000 ledgers per request, so walking the retention window takes twelve requests.
Eight of them are empty, and **an empty page does not mean caught up** — which is why `last_ledger` is
read from the cursor rather than from `latestLedger` (see `be/OPERATIONS.md`).

The 14 Sterun events that arrived, by name:

| `chain_events.name` | count |
| --- | ---: |
| `event_created` | 1 |
| `category_added` | 1 |
| `event_status_changed` | 1 |
| `slot_reserved` | 3 |
| `mint` | 3 |
| `record_entered` | 3 |
| `racepack_claimed` | 1 |
| `record_finished` | 1 |

What materialised:

```
events      | 0 | GBGUI5MP…C4TN | Sterun Testnet Rehearsal 2026 | Open | source=event | ledger 4445728
categories  | 0 | 0 | 10K | 10000 m | quota 5 | 50000000 stroop | entered_count 3
records     | 0 | bib 0 | Finished | finish_time_s 3161 | source=event | ledger 4445753
            | 1 | bib 1 | Entered  |                    | source=event | ledger 4446148
            | 2 | bib 2 | Entered  |                    | source=event | ledger 4446532
```

`record_transitions`, with real ledgers and tx hashes:

| token | from | to | `occurred_at` | ledger |
| ---: | --- | --- | --- | ---: |
| 0 | — | `Entered` | 1788252277 | 4445738 |
| 0 | `Entered` | `RacepackClaimed` | 1788252342 | 4445751 |
| 0 | `RacepackClaimed` | `Finished` | 1788252352 | 4445753 |
| 1 | — | `Entered` | 1788254327 | 4446148 |
| 2 | — | `Entered` | 1788256247 | 4446532 |

**This is the check the ticket asked for** ("run `enter` on testnet → a record row appears in Postgres
with state `Entered`"): records 1 and 2 are two genuine `enter`s, and both landed as rows in state
`Entered` with the right bib. `occurred_at` comes from the contract's clock
(`env.ledger().timestamp()`), not from the indexer's.
### 2. `doctor` after following

```
$ pnpm indexer doctor
{ "ok": true,
  "chain": { "events": 1, "records": 3 },
  "index": { "events": 1, "records": 3 },
  "findings": [] }
```

### 3. Drop -> rebuild -> consistent again

The ticket's second scenario, run against the real chain.

```
$ psql -c 'TRUNCATE records, events RESTART IDENTITY CASCADE'
   events=0  records=0  transitions=0  chain_events=14      # the raw log deliberately survives

$ pnpm indexer rebuild
reading contract state — nothing is written until the walk finishes
rebuilt in 4536ms: 1 events, 1 categories, 3 records, 5 transitions.
Following resumes at ledger 4469811.
doctor: index matches the chain
```

The rebuild read no events at all — everything came from `event_count`, `get_event`,
`category_count`, `get_category`, `total_supply`, `record_of` and `owner_of`. The transition history
is reconstructed from `entered_at`/`claimed_at`/`result_at` in `RecordData` and marked
`source = 'state'`, `ledger IS NULL` — honest about what state cannot know.

### 4. The fast query endpoints, against the rebuilt data above

```
$ curl -s localhost:3011/indexer/status
{"stream":"contracts","last_ledger":4469811,"counts":{"events":1,"categories":1,"records":3,
 "record_transitions":5,"event_scanners":0,"chain_events":14},"cursor":null,...}

$ curl -s localhost:3011/events
{"events":[{"event_id":0,"organiser":"GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
 "event_name":"Sterun Testnet Rehearsal 2026","starts_at":"1789000000","status":"Open",
 "last_ledger":4469811,"metadata_hash":"2d548a2b…3b68",
 "uri":"https://sterun.xyz/events/sanity-2026-09-01.json","source":"state"}],"count":1}

$ curl -s localhost:3011/records/0
{"record":{"token_id":0,"bib_no":0,"runner_address":"GAJVXTF5…PWVR","state":"Finished",
 "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
 "entered_at":"1788252277","claimed_at":"1788252342","finish_time_s":3161,
 "result_at":"1788252352",…},"transitions":[…3 rows…]}

$ curl -s localhost:3011/runners/GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR/records
{"records":[{"token_id":0,…,"state":"Finished",…}],"count":1}
```

The `participant_hash` `feb3cea9…fe29` on that row is exactly what `record_of(0)` returns straight
from the contract — the index is a cache, not a second source that can hold a different opinion.

### 5. The roster: the allowlist is read from the chain, not from the database

```
$ curl -s localhost:3011/events/0/roster
401 {"error":"missing-credentials",…}

# a random keypair, with a valid challenge and signature:
/events/0/roster  403 {"error":"forbidden","message":"the authenticated account is neither the
                        organiser of this event nor an allowlisted scanner for it on-chain"}
/events/9/roster  404 {"error":"not_found","message":"no such event on-chain"}
```

That 403 is the answer from `is_scanner(0, addr)` + `get_organiser(0)` on the **live**
EventRegistry; the 404 is an `EventNotFound(2)` revert mapped through the error bands. The positive
path — a complete bundle with `totp_secret`, bib and `state` — is demonstrated in section 7 below,
after the organiser ran `add_scanner`.

### 6. The TTL keeper — rent genuinely paid on chain

```
$ pnpm keeper scan
threshold 2073600 ledgers (~120.0 days), extend to 3110399 (~180.0 days)
run #2 (dry-run) at ledger 4477717: scanned 14 keys, 9 due, 0 extended, 0 not served by RPC

$ pnpm keeper run
run #5 (ok) at ledger 4477738: scanned 14 keys, 9 due, 9 extended, 0 not served by RPC
  SUCCESS 3ced4284f84850d37d2e0928f5bad958bc672c014daefd9e4a2b9e4055dd5a4c (9 keys)

$ pnpm keeper run          # again, a few seconds later
run #6 (ok) at ledger 4477753: scanned 14 keys, 0 due, 0 extended, 0 not served by RPC
```

**The transaction:**
[`3ced4284…`](https://stellar.expert/explorer/testnet/tx/3ced4284f84850d37d2e0928f5bad958bc672c014daefd9e4a2b9e4055dd5a4c)
— one `ExtendFootprintTTLOp` over 9 ledger keys.
The keeper account: [`GCYM7TQB…XV26`](https://stellar.expert/explorer/testnet/account/GCYM7TQBS7U6KSVJCFCYDHREYKO6UFINLSJ3K3EJAL2VHWIYRQLPXV26)
— XLM only, owning no record.

Run #6 finding **0 due** seconds after #5 is the proof: the extension genuinely landed, and those
nine entries now sit at ~180 days rather than ~120.

The 14 ledger keys were obtained by simulating `record_of`, `owner_of` and `records_of` for every
record and every runner in the index and taking the footprint the host computed — including
OpenZeppelin's `Owner` entries and the per-owner enumerable index, which
`RaceRecord::extend_record_ttl` does **not** touch. The TTLs are real, read through
`getLedgerEntries`.

9 of the 14 were due on the first run because a freshly written persistent entry starts at around 120
days, the same as the threshold. `0 not served by RPC` means nothing had been archived, so the
restore runbook has never been needed.

> **A bug that only showed up by sending a real transaction.** Runs #3 and #4 failed with
> `txFailed {"op_inner":{"extend_footprint_ttl":"malformed"}}`. The cause: `ExtendFootprintTTLOp`
> validates `extendTo` as **strictly** below `max_entry_ttl`, so `3110400` (= 180 days, the same
> number as `BUMP_TO` in the contract) is rejected and `3110399` is accepted. The contract's constant
> is still right — the `extend_ttl` host function **clamps** to the maximum while the operation
> **rejects**. Two validators, one intent, one ledger apart. It is now written out explicitly in
> `be/src/keeper/ttl.ts` so nobody "fixes" it back.

---

### 7. The whole chain: PII → `enter` → indexer → roster, all live

Run on **2026-09-03**, after Axel funded the runner with 50 sUSD and ran
`add_scanner(0, GCXOLP4L…ASSJ)`. This closes the last two holes in the STE-16 evidence — before it,
the indexed `enter` was somebody else's, and the roster had only been shown to *refuse* a stranger.

| Identity | Address | Role |
| --- | --- | --- |
| runner | [`GAGDD5EP…E4SK`](https://stellar.expert/explorer/testnet/account/GAGDD5EPZKCBKCDDM373LDCUT2U5TMQHF675UAJ37CF6CQY3OGPBE4SK) | enters and pays 5 sUSD |
| scanner | [`GCXOLP4L…ASSJ`](https://stellar.expert/explorer/testnet/account/GCXOLP4LINZ4VDGFYBGA623YDGLID4Q6UT3T5O6N6LFCCDXK5T7NASSJ) | allowlisted on-chain by the organiser |
| TTL keeper | [`GCYM7TQB…XV26`](https://stellar.expert/explorer/testnet/account/GCYM7TQBS7U6KSVJCFCYDHREYKO6UFINLSJ3K3EJAL2VHWIYRQLPXV26) | pays rent, XLM only |

**The steps and their results:**

| # | Step | Result |
| --- | --- | --- |
| 1 | `POST /participants` with messy PII (NBSP, TAB, a hyphenated national ID, a bracketed phone number) | `participant_hash = a8c22e0f…a655`; the response carries no fragment of PII |
| 2 | `enter(runner, 0, 0, hash)` on the **live** RaceRecord, signed by the runner | `token_id = 3`, `bib_no = 3`, ledger 4480668 — [`6d411b39…`](https://stellar.expert/explorer/testnet/tx/6d411b3921ca4b4e76e4c8498e02cfbff7924244b2f66e96f0c48fd2591eec0b) |
| 3 | `POST /participants/3/confirm` | the vault row is linked to `token_id 3` and its tx hash |
| 4 | `verify(3, a8c22e0f…a655)` on the contract | **`true`** |
| 5 | `pnpm indexer poll` (twice, catching up ~11,000 ledgers) | `fetched=3 applied=3`, `last_ledger=4480673` |
| 6 | `GET /records/3` | `state: "Entered"`, `source: "event"`, `bib_no: 3`, the transition carrying ledger 4480668 and its tx hash |
| 7 | `GET /events/0/roster` as the scanner | **200**, `count=1`, `missing_from_index=0` |
| 8 | a TOTP code from the `totp_secret` in the bundle | the scanner recomputes it → **matches**; a code from 5 minutes ago → **refused** |
| 9 | `GET /events/0/roster` as a random keypair | **403** from the live `is_scanner` |

**The rows that appeared in the index** (`GET /events/0/records`) — note the `source` column:

```
token_id  bib  state       source   last_ledger
       0    0  Finished    state    4469811
       1    1  Entered     state    4469811
       2    2  Entered     state    4480673
       3    3  Entered     event    4480668     <- the enter from step 2
```

The first three came from a rebuild (`state`); the fourth came from `getEvents` (`event`) and
therefore carries its ledger and tx hash. The `source` column says which is which, with no guessing.

**The roster bundle's contents:**

```
event_id=0  snapshot_ledger=4480673  count=1  missing_from_index=0
totp = {"digits":6,"step_seconds":30,"tolerance_steps":1}
token 3  bib 3  Entered  fragment="Ulin N. S."  secret=b927f7a6…
```

The name submitted in step 1 was `"  Ulin Nuha\tSidiki "`. What comes out in the roster is
`"Ulin N. S."` — the full given name, initials for the rest. The response body was checked to contain
neither `"Ulin Nuha"`, `"Sidiki"`, any fragment of the national ID, nor any fragment of the phone
number.

What step 4 proves and no local test could: the backend's normalisation (NFC, collapsing whitespace,
stripping national-ID separators) produces **byte-for-byte the same** input that
`env.crypto().sha256()` hashes inside the Soroban host. One byte apart and step 4 returns `false`.

What step 8 proves: the `totp_secret` handed to the scanner really is the same secret the runner's
device uses, so check-in verification can genuinely happen **offline** on both sides — and its ±1 step
window really does refuse a stale code.

---

## STE-33 handoff — who uses these addresses

| Ticket | What it needs |
| --- | --- |
| **STE-15** `SterunClient` (James) | **DONE** — `EVENT_REGISTRY` + `RACE_RECORD` + `SUSD_SAC`; the bindings are in `sc/bindings/` (generated from the same wasm that is live above). Live evidence in the "STE-15 e2e evidence" section |
| **STE-19** JSON Schema + publish (James) | **code DONE**, `npm publish` awaiting npm credentials. Packaging evidence in the "STE-19 evidence" section |
| **STE-16** indexer (James) | **DONE** — both contract ids, to filter `getEvents`; the topic/data shapes are frozen in `INTERFACE.md` §1.3 and §2.3. Live evidence in the section above |
| **STE-11** PII vault (James) | `participant_hash` per `HASH_AND_TOTP.md`; a real example is stored in `record_of(0)` |
| **STE-17/18/21/22** apps (Ancung) | both contract ids + the SAC, for the entry flow, the QR pass and the scanner |
| **STE-31/32** backend and web deploys | the three addresses above as environment variables |

```bash
# The v1 pair, as handed off at STE-33. The pair in use now is at the top of this file.
STELLAR_NETWORK=testnet
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
SUSD_ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
```

> **A runner must hold an sUSD trustline before `enter`** when the category is paid. Without one, the
> `transfer` inside `enter` fails and the whole `enter` rolls back (no quota used, no mint). A
> **free** category (`price_usdc == 0`) skips the `transfer` entirely and needs no trustline at all.

### Re-deploying? Read this first

The v1 contracts are **non-upgradeable**. Running `deploy-testnet.sh` again upgrades nothing — it
produces a **new pair of contract addresses** (deploys use a random salt), and the old addresses stay
alive with their own data. If that is genuinely what is wanted, change the table in this section and
tell every consumer in the handoff table; do not let two pairs of addresses circulate quietly.

---
## STE-15 e2e evidence — the whole flow through `@sterunxyz/sdk`, zero Rust

Run on **2026-09-05** with `pnpm --filter @sterunxyz/sdk e2e` against live testnet, using the
`EVENT_REGISTRY` and `RACE_RECORD` from the table at the top of this file (read from this document
rather than hardcoded). Every actor is a fresh Friendbot account created at the time and discarded
afterwards — so this run uses nobody's secret and does **not** piggyback on the STE-33 rehearsal event
(that event's category had one slot left; using it would have taken the STE-25 mock race's share).

What it proves: the whole chain `createEvent → addCategory → setEventStatus(Open) → enter →
recordsOf → addScanner → claimRacepack → recordFinish → verify` can be driven **only** through
`SterunClient` — no Rust, no Stellar CLI, no assembling XDR by hand.

### The actors

| Role | Address |
| --- | --- |
| organiser | [`GB2V3PI26Y57G2BHK5QRDPELZTKKHSMNA26LRHLAZOXFKVVFTOBYQA5X`](https://stellar.expert/explorer/testnet/account/GB2V3PI26Y57G2BHK5QRDPELZTKKHSMNA26LRHLAZOXFKVVFTOBYQA5X) |
| runner | [`GDIN3Z63PDERDBZMCOTSPRHWUMR5FLRBUOPY3OLYVAMHPSSXGE2PO6JB`](https://stellar.expert/explorer/testnet/account/GDIN3Z63PDERDBZMCOTSPRHWUMR5FLRBUOPY3OLYVAMHPSSXGE2PO6JB) |
| scanner | [`GCQ6S5LVQDMMQHNG3FDLPR7IUZ4MKD6UKGR5Y3EJKFF5Z7QUNHWMCYQR`](https://stellar.expert/explorer/testnet/account/GCQ6S5LVQDMMQHNG3FDLPR7IUZ4MKD6UKGR5Y3EJKFF5Z7QUNHWMCYQR) |

### The transactions (click = explorer)

`event_id 1`, `token_id 4`, bib `0`, finishing in `3161` seconds, final state **`Finished`**.

| Step | Tx hash |
| --- | --- |
| `createEvent` | [`d099ced765c315b852edb799f5cdf76b5d600bf983b6e9d141d4c2dd4f756120`](https://stellar.expert/explorer/testnet/tx/d099ced765c315b852edb799f5cdf76b5d600bf983b6e9d141d4c2dd4f756120) |
| `setEventStatus(Open)` | [`40c07a20a7760fc601ad4d137be5291f2ed3a206afdc3660bb46b75031c9ee2a`](https://stellar.expert/explorer/testnet/tx/40c07a20a7760fc601ad4d137be5291f2ed3a206afdc3660bb46b75031c9ee2a) |
| `enter` | [`21fd47cd4a4434c96f2011c7bd265b9cd3cebf368552bbd864afc5542bf66f89`](https://stellar.expert/explorer/testnet/tx/21fd47cd4a4434c96f2011c7bd265b9cd3cebf368552bbd864afc5542bf66f89) |
| `claimRacepack` | [`93dd8c71c773b3bb4498c1a719c532aae3d776f76001b2e807a0ff3bec408488`](https://stellar.expert/explorer/testnet/tx/93dd8c71c773b3bb4498c1a719c532aae3d776f76001b2e807a0ff3bec408488) |
| `recordFinish` | [`1551d85420a4ab16285243a9732d4d61a2f8affd6f1c5a1245478499b156c647`](https://stellar.expert/explorer/testnet/tx/1551d85420a4ab16285243a9732d4d61a2f8affd6f1c5a1245478499b156c647) |

### Negative cases — and importantly, the **band** is right

Each of these lines is more than "it failed": the SDK names the variant **and** the contract it came
from. That is the band rule from `INTERFACE.md` §3, demonstrated against genuinely deployed contracts
rather than against a fake.

| What was attempted | Result |
| --- | --- |
| `enter` while the event is still `Draft` | `EventNotOpen` **#4** (event-registry) |
| `setEventStatus(Open)` when it is already `Open` | `InvalidStatus` **#11** (event-registry) |
| `enter` into a category whose quota is gone | `QuotaFull` **#5** (event-registry) |
| `recordFinish` before the race pack is collected | `InvalidState` **#103** (race-record) |
| `claimRacepack` from a device that is not allowlisted | `NotAuthorized` **#104** (race-record) |
| `claimRacepack` a second time | `AlreadyClaimed` **#102** (race-record) |
| `recordDnf` after `Finished` | `InvalidState` **#103** (race-record) |

Note the first three rows: those are **EventRegistry** reverts propagating out through RaceRecord's
`enter`/`set_event_status`. Without disjoint bands, `#4` could easily be mistaken for RaceRecord's
`InvalidState`.

### `verify` and reading without a wallet

The `participant_hash` is computed with the frozen reference implementation
(`docs/specs/reference/node/`), so the hash the SDK sends is the same hash the contract tests pin.

- `verify(token_id, the correct hash)` → **`true`**
- `verify(token_id, a wrong hash)` → **`false`**
- `verify(999999, hash)` → **`false`** (an unknown token does not revert)

Every read was repeated through a client with **no `publicKey` and no signer at all**
(`sterun.readOnly()`): `recordsOfDetailed`, `verify` and `getCategory` all work. That is what lets the
public profile page (STE-24) be genuinely public.

### The paid leg — DONE (2026-09-06)

The first run skipped the paid `enter` because `SUSD_DISTRIBUTOR_SECRET` was not on that machine. The
secret became available later, and the leg was run:

```
▸ Paid entry (5 sUSD), fee moving runner → organiser inside `enter`
  runner-p  GBG2UYH2XOGQ76FLCH4U3FCYMZKXD7GQ4SMMXLUWFCNZGGTNJOLDCCYC
  funded GBG2UYH2XOGQ76FLCH4U3FCYMZKXD7GQ4SMMXLUWFCNZGGTNJOLDCCYC with 10 sUSD
  ✓ token_id 9, organiser received exactly 5 sUSD
  ✓ one transaction did quota + fee + mint
```

| Item | Value |
| --- | --- |
| event_id | 3 |
| organiser | [`GCROPABZJK5KDTUYMQAVSCYX5V25ZSQ5MVPGORB5UNEUQ4K6C3IEQ6XH`](https://stellar.expert/explorer/testnet/account/GCROPABZJK5KDTUYMQAVSCYX5V25ZSQ5MVPGORB5UNEUQ4K6C3IEQ6XH) |
| token_id (free) | 8 — bib 0, `Finished` 3161s |
| token_id (paid) | 9 |
| `enter` (5 sUSD) | [`d379b26958a981a304701c958606f1fa5cb4e4e1c8fcc698b15bd11046058c97`](https://stellar.expert/explorer/testnet/tx/d379b26958a981a304701c958606f1fa5cb4e4e1c8fcc698b15bd11046058c97) |
| fee received by the organiser | **exactly 5 sUSD** |

This is what carries the atomicity claim for `enter` all the way: **one transaction**, **one runner
signature**, and inside it a SEP-41 `transfer` that was never signed separately. The organiser's
balance was checked before and after, and the difference is exactly the entry fee — not approximately.

> A **free** category (`price_usdc == 0`) skips the `transfer` entirely, so the leg already run above
> genuinely does not touch the SAC — correct behaviour per `INTERFACE.md` §2.1, not a shortcut.

---

## STE-19 evidence — `@sterunxyz/sdk` installed from a tarball into an empty project

Run on **2026-09-05**. What it proves: the package that would be `npm publish`ed really is usable by
someone outside the team, with no access to this repository.

Every step before the upload was verified with `npm pack`, which produces **exactly** the tarball that
gets uploaded. The publish itself happened later — see "The publish" below.

### The tarball's contents

```
$ npm pack
sterun-sdk-0.1.0.tgz    33 files, 55 KB

package/dist/*.js + *.d.ts          SterunClient, errors, schema, document
package/vendor-dist/*.js + *.d.ts   the contract bindings, bundled along
package/schema/race-record-v1.0.json
package/README.md
package/package.json
```

The tarball's `dependencies`: `@stellar/stellar-sdk ^17.0.1` and `zod ^4.1.13` — and **no `file:`
dependency**, which cannot be published at all. That is why the bindings are vendored into
`sdk/vendor/`.

### A third-party project

An empty TypeScript project **outside the repository** (`/tmp/…/thirdparty`), holding only a
`package.json` and a `tsconfig.json`, then:

```bash
npm install ./sterun-sdk-0.1.0.tgz
npx tsc --noEmit     # clean — zero errors from @sterunxyz/sdk
npx tsx quickstart.ts
```

The quickstart is the README's contents as-is; there is not a single relative import back into this
repository.

```
getEvent(0)      : Sterun Testnet Rehearsal 2026 | Open
recordsOf        : #0 Finished
verify           : true for the real hash, false for a wrong one
document         : valid against RaceRecord JSON Schema v1.0.0
  event          : Sterun Testnet Rehearsal 2026
  category       : 10K 10000m 50000000 stroops
  state          : Finished | finish 3161s
  link           : https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
schema $id       : https://sterun.xyz/schemas/race-record/v1.0.json
typed error      : EventNotFound #2 (event-registry)

✅ third-party quickstart passed from a clean project
```

Four things proven at once:

1. **Reading without a wallet** — zero `publicKey`, zero signers, and the data still comes out.
2. **The document validates against its own schema** — `JSON.stringify`d and then re-`parse`d through
   `parseRaceRecordDocument`, so what is validated is real JSON, not an in-memory object.
3. **Typed errors survive packaging** — `EventNotFound #2` still carries the `event-registry` band
   rather than being a bare string.
4. **`price_stroops` stays a string** (`"50000000"`), so an `i128` never travels through a double.

### The publish

Published on **2026-09-10** as **[`@sterunxyz/sdk`](https://www.npmjs.com/package/@sterunxyz/sdk)**.

```bash
npm login                                   # an account that owns the @sterunxyz scope
cd sdk
pnpm --filter @sterunxyz/sdk test           # every test must be green
npm publish --access public                 # prepack runs the build automatically
```

Verifying from a clean machine:

```bash
mkdir /tmp/verify && cd /tmp/verify && npm init -y
npm install @sterunxyz/sdk
node -e "import('@sterunxyz/sdk').then(m => console.log(m.RACE_RECORD_SCHEMA_VERSION))"   # 1.0.0
```

> The scope is **`@sterunxyz`**, not `@sterun`. `@sterun` on npm was already taken by an unrelated
> account, and npm does not release a name because somebody else wants it. The package name is
> therefore `@sterunxyz/sdk` everywhere — in `package.json`, in the imports, and in the README.

---
## STE-20 e2e evidence — CSV results review against live testnet

Run on **2026-09-05** with `pnpm --filter be e2e:results`. Not a simulation: the event was genuinely
created on testnet through `@sterunxyz/sdk`, indexed by the STE-16 indexer from **contract state**,
then read back through the same routes `pnpm dev` serves. Every account is a throwaway Friendbot
account, so no one's secret is needed; the category is free, so the SEP-41 `transfer` path is
deliberately untouched.

```
event_id        2
organiser       GBMAOPRWUEX3DKNESZ2SVQLP2UIZ4A66NQHEOAK6EQCZQ45P5BY75E4S
categories      0 (10km), 1 (5km)   ← both number their bibs from 0
token_ids       5, 6, 7             ← two RacepackClaimed, one still Entered
source_sha256   2d09063479983e69160f269e2164ce48fe91a7f2791aeb592364bdfab3167c27
publishable     2 of 8 rows
```

### The CSV that was uploaded, and the answer per row

| Row | Contents | Result |
| --- | --- | --- |
| 2 | `0,0,52:41` | **ok** — and `52:41` is read as **3161 seconds**, not 5241 |
| 3 | `1,0,3200` | **ok** |
| 4 | `1,0,3300` | `duplicate_bib` (*wrong*) — "bib 1 already appears on line 3 of this file" |
| 5 | `99,0,3161` | `unknown_bib` (*reverts*) — "no entry with bib 99 in category 0 for this event" |
| 6 | `0,,3161` | `ambiguous_bib` (*wrong*) — "bib 0 exists in categories 0, 1 …" |
| 7 | `2,0,3161` | `unknown_bib` (*reverts*) — entered in category 1, not 0 |
| 8 | `0,1,120` | `not_claimed` (*reverts*) **and** `impossible_time` (*wrong*) — "120s over 5000m is 41.7 m/s" |
| 9 | `xx,0,3161` | `malformed_row` (*wrong*) — "bib number \"xx\" is not a whole number" |

Every anomaly arrives with an **actionable reason** rather than a code whose meaning has to be looked
up. Row 8 proves that one row can fail for more than one thing at once — an organiser told only about
the first problem would re-upload and be told about the next one.

### `ambiguous_bib` proven real, not theoretical

Row 6 is a finding that was not on the ticket's list of anomalies. `reserve_slot` returns the
**category's** `entered_count`, so in this event bib 0 genuinely exists twice: once in category 0
(10km) and once in category 1 (5km). A bare `(bib_no, finish_time)` CSV — exactly the shape the ticket
asked for — cannot say which. Guessing means publishing one runner's time onto another runner's
record, and `Finished` is terminal.

### What else is proven

- **`source_sha256`** is computed from exactly the bytes uploaded, before parsing. That is the value
  recorded in the event metadata so published results stay tamper-evident (SYSTEM_DESIGN §11, risk 4).
- **The response carries no runner address** — checked explicitly against the raw payload.
- **Auth is the organiser's, read from the chain.** Even an allowlisted scanner is refused with 403:
  they may check people in, not publish results.

---

## STE-31 — the backend LIVE on jameserver

A real deployment, 2026-09-06/07. The Sterun backend runs in James's homelab, on its own domain,
through a Cloudflare Tunnel.

### Base URL

```
https://api-sterun.jameshub.fun
```

A Cloudflare certificate, HTTP/2. External verification: **14 of 14 passing**.

> **Not `api.sterun.jameshub.fun` as the ticket worded it**, and the reason is not configuration:
> Cloudflare's Universal SSL only issues certificates **one level deep**. Details and the evidence
> below.

### Where it runs

| Item | Value |
| --- | --- |
| Proxmox node | `pve02` (cluster `homelab`) |
| Container | LXC **203** `ct-sterun`, Debian 13, unprivileged + `nesting=1` |
| LAN IP | `192.168.18.42` |
| Path | `/opt/sterun` |
| Processes | Postgres 17, the API, the poller (`indexer follow`), the TTL keeper (`keeper run`) |
| Restart | `unless-stopped` + `onboot=1` on the LXC — survives reboots and power cuts |
| TTL keeper | [`GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4`](https://stellar.expert/explorer/testnet/account/GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4) — a new account made for this VPS |

Conventions followed from the existing cluster: vmid `2xx` for pve02, the `ct-` prefix, IP
`192.168.18.4x`, bridge `vmbr0`.

### That it is alive and correct

Migrations run themselves before the socket opens — `001_pii_vault`, `002_indexer`,
`003_name_fragment`, `004_auth_nonces`. The startup log reports `"nonces":"postgres"`, meaning the
nonce path that is safe for more than one instance is genuinely active in production rather than
merely existing in the code.

The poller ingested events from live testnet from the first minute; the keeper scanned the records and
reported `0 due` (correct — nothing is near its TTL limit yet).

### Why `api-sterun` and not `api.sterun`

A two-level name needs a `*.sterun.jameshub.fun` certificate. Universal SSL only issues
`jameshub.fun` and `*.jameshub.fun` — **one level**. Two levels needs Advanced Certificate Manager
(paid) or Total TLS.

Demonstrated rather than guessed:

| Hostname | Result |
| --- | --- |
| `api.sterun.jameshub.fun` | `SSL alert number 40` — the handshake is refused at the Cloudflare edge |
| `api-sterun.jameshub.fun` | **14/14 passing** |

What makes the symptom misleading: the request **never reaches** the tunnel, so the cloudflared log is
clean and all four connections are healthy. It looks exactly like a dead tunnel.

That two-level name is **no longer registered** anywhere: its CNAME was deleted from the zone, and its
ingress rule was removed from `deploy/cloudflared-config.yml` in the same change. A rule without DNS
is dead code implying a URL that is really NXDOMAIN. If ACM or Total TLS is ever enabled, both come
back together.

### Ingress: Cloudflare Tunnel

The `sterun-api` tunnel, **4 connections** (Jakarta ×2, Singapore ×2). It dials outwards, so a router
that forwards nothing stops being a problem; TLS is Cloudflare's; the DNS record is created by the
tunnel itself.

**Locally-managed**: the routing rules live in `deploy/cloudflared-config.yml` inside the repository
rather than in the dashboard — reviewable in a PR and rolled back with everything else. The
credentials are in `secrets/`, gitignored.

The Tailscale Funnel that served as a temporary ingress has been **turned off** — one public door,
not two with only one looked after.

### Why NOT Caddy

This homelab router does **not** forward ports 80/443. Tested rather than assumed: a temporary
listener was put on port 80 of pve01, and its WAN IP (`182.253.126.14` — a genuine public IP, not
CGNAT) was probed from the internet through an external proxy. Timeout (522).

The consequence: **ACME HTTP-01 is impossible**, so the Caddy inside `compose.prod.yml` would never
get a certificate here. The `caddy` profile still exists for hosts that do forward ports; on this
host it is never started.

That is what selected **Cloudflare Tunnel** (the section above): a tunnel dials **outwards**, so a
router that forwards nothing stops being a problem, TLS is Cloudflare's, and the DNS record is created
by the tunnel itself — no A record has to be added by hand.

**Tailscale Funnel** on pve01 served as a temporary ingress before the tunnel was authenticated. It
was turned off (`tailscale funnel --https=443 off`) as soon as the tunnel came up — one public door,
not two with only one looked after. The procedure for bringing it back if the tunnel misbehaves is in
`be/OPERATIONS.md`.

### Verification from outside, without SSH

`./deploy/verify-deployment.sh https://api-sterun.jameshub.fun` — **18 of 18 passing**,
2026-09-08T01:33:54Z (14/14 at STE-31; the four file checks were added afterwards):

```
▸ TLS
  ✓ serves over HTTPS with a certificate curl trusts
  ✓ sends HSTS
▸ Liveness and readiness
  ✓ /health -> {"status":"ok","uptimeSeconds":20138}
  ✓ /ready -> database reachable
▸ Pointing at the right chain
  ✓ EventRegistry CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
  ✓ RaceRecord    CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
  ✓ network       testnet
  ✓ vault mounted · indexer mounted · results mounted
▸ The sensitive endpoints still say no
  ✓ GET /events/0/roster -> 401 without a signature
  ✓ GET /participants/… -> 401 without a signature
  ✓ POST /events/0/results/preview -> 401 without a signature
▸ Documentation
  ✓ /openapi.json describes the API
```

> This capture predates the move to v2 (2026-09-09), which is why the two contract addresses in it are
> the v1 pair. The same script run today reports the v2 addresses from the table at the top of this
> file.

The most important lines are not `/health` but the three before the documentation section: the
sensitive endpoints **still refuse** a caller without a signature. A deployment that gets that wrong
would serve identity-adjacent data to the internet while looking perfectly healthy in every other
check.

### Surviving a reboot — tested, not claimed

STE-31 requires automatic restart on crash or reboot. The LXC container was `pct reboot`ed and then
left alone:

```
before : {"status":"ok","uptimeSeconds":556}
[pct reboot 203]
after  : {"status":"ok","uptimeSeconds":14}      ← a new process
         {"status":"ready","checks":{"database":"ok"}}
         api|Up 19s (healthy)  indexer|Up 20s  keeper|Up 19s  postgres|Up 19s (healthy)
```

**Without a single command** after the reboot. `onboot=1` on the LXC starts the container, and
`restart: unless-stopped` starts all four services.

Two nice details from the log:

- The indexer received SIGTERM and **stopped cleanly** — `finishing the current page, then stopping`
  — rather than being killed mid-page.
- After coming back it **resumed from the cursor** rather than starting over: the counts stayed at 4
  events / 10 records / 56 chain events, and `last_ledger` moved forward. Had it re-ingested, those
  numbers would have climbed.

### Event metadata files — LIVE

`POST /events/files` + `GET /files/:sha256`, live on the same deployment. Asked for by Ancung for the
organiser console (STE-17): the wizard needs a `uri` + `metadata_hash` for `create_event`, and before
this organisers were told to host it themselves.

**Content-addressed**: the filename is the sha256 of the contents, so the URL and the fingerprint are
one object. That is what makes it impossible for the on-chain `metadata_hash` and the file served to
disagree.

Run against `https://api-sterun.jameshub.fun` on 2026-09-08T01:34Z:

```
1. upload            -> 201 https://api-sterun.jameshub.fun/files/40e511e6…678d.json
   sha256 matches    -> true
2. fetch             -> 200 application/json
   bytes identical   -> true
   CSP               -> default-src 'none'; sandbox
   cache-control     -> public, max-age=31536000, immutable
3. re-upload         -> 201 created: false same url: true
4. SVG (labelled PNG)-> 415 unsupported-file-type
5. no signature      -> 401
```
Rows 3 and 4 are the ones worth reading. **Row 3**: the same bytes produce the same URL and
`created: false` — the upload is idempotent, so a retry after a dropped connection duplicates
nothing. **Row 4**: that file is an SVG sent with a `Content-Type: image/png` header and it is still
refused, because the type is decided by the bytes rather than the header. SVG can carry `<script>`,
and this origin also serves the PII vault.

The file uploaded above is still live and clickable:
[`…40e511e6…678d.json`](https://api-sterun.jameshub.fun/files/40e511e6def7b3bc72da94edc96cd040570704c8faa1e1f79e8a82ef4778678d.json)

**Volume evidence, run against the image built before the deploy** — this is the failure most likely
to reach production unnoticed:

| Attempt | Result |
| --- | --- |
| container restarted, volume attached | the file **still 200s** |
| container recreated **without** the volume | **404** — the event is permanently broken |
| image **without** `mkdir /app/data/files` in the Dockerfile | the directory is owned by `root`, writes **refused** (`EACCES`) |
| image **with** `mkdir` + `chown node` | the directory is owned by `node`, writes **succeed** |

That third row is the same shape of bug as the cloudflared permission one: Docker seeds an empty named
volume from the image's directory, and when the path is absent from the image the volume is created
owned by root. The result is that the first upload fails in production and nowhere before it.

External verification rose to **18 of 18 passing** (four new checks: uploads refuse without a
signature, the file store is enabled, SVG is absent from the accepted types, and
`/files/<unknown hash>` → 404).

### Event metadata files moved to Cloudflare R2

The file bytes now live in **R2** rather than on the box's disk. What **serves** them is still this
API at `/files/:sha256` — that URL is committed on-chain permanently, so it must not point at any
storage provider.

| | |
| --- | --- |
| Bucket | `sterun-files`, location **APAC** |
| S3 endpoint | `https://<account id>.r2.cloudflarestorage.com` |
| SigV4 region | `auto` (not `us-east-1`, even though that is aliased) |
| Client | hand-written SigV4, `be/src/files/sigv4.ts` — **no** `@aws-sdk/client-s3` |

**The three existing files were migrated BEFORE the store changed**, because a dead URL means a
permanently broken event. After the switch, all three were fetched again through their public URLs and
their hashes recomputed:

```
40e511e6def7…  -> HTTP 200, hash MATCHES
420033984720…  -> HTTP 200, hash MATCHES
6bf7567756b1…  -> HTTP 200, hash MATCHES
```

Not one URL changed. That follows from content addressing: the same file produces the same key in any
store, so this migration is safe to repeat and cannot produce a new URL.

**E2E through R2**, 2026-09-08T06:08Z against `https://api-sterun.jameshub.fun`:

```
1. upload            -> 201  sha256 matches: true
2. fetch             -> 200  application/json  | bytes identical: true
   CSP               -> default-src 'none'; sandbox
   cache-control     -> public, max-age=31536000, immutable
3. re-upload         -> 201  created: false
4. SVG (labelled PNG)-> 415  unsupported-file-type
5. no signature      -> 401
```

**Row 2 is the important one here**: the security headers are still ours. Were the bytes served
straight from the bucket, that `sandbox` CSP would be gone — and with it the reason a file uploaded by
anyone is safe to serve from the origin that also serves the PII vault.

**The signature is proven three ways**, because the SigV4 is hand-written:

| Layer | What it proves | Where |
| --- | --- | --- |
| An independent second implementation | two readings of the specification agree | `be/test/files-r2.test.ts` |
| Structural rules | header ordering, RFC 3986 encoding, the payload hash | the same test |
| **R2 itself accepting it** | the only real known-answer test | the run above |

The third layer cannot run in CI (it needs credentials), which is why it is recorded here. Its failure
mode is loud: a signature one byte out is `403 SignatureDoesNotMatch` on the first request.

**The architectural consequence:** the API is now **stateless**, so the blocker in front of a second
replica is gone. What remains before actually starting one: scheduled Postgres backups (first — a
replica is availability, a backup is recovery) and then Redis for the rate limiter. The poller and the
keeper **stay singletons**.

### The backend moved to the v2 contracts — LIVE

2026-09-09. `be/` and `fe/` now point at the v2 pair. James's decision: move now, because the longer it
waits the more data has to be thrown away.

**The cost of the move was small precisely because it was done early** — the database held 3
participants, all three with a NULL `token_id`, so **no identity document was linked to any on-chain
record**. A backup was taken first (`/opt/sterun/backups/pre-v2-*.sql.gz`, 11 tables).

The addresses moved through `docs/deployments.md` rather than an environment variable: the unqualified
rows carry v2 and the old ones are labelled `v1`. A test fails if the parser resolves the v1 pair —
both are valid contract ids in the same file, so a regex that is too loose would parse cleanly while
pointing at a dead contract.

**The index and the vault were truncated**, because no column distinguishes one contract from another:
`events.event_id` and `records.token_id` are bare primary keys, and v2 numbers events from 0 again. The
full procedure and its ordering (the poller stopped **before** the truncate) is in `be/OPERATIONS.md`.

The result of rebuilding from v2 state:

```
rebuilt in 6361ms: 2 events, 2 categories, 3 records, 5 transitions.
doctor: index matches the chain
```

The verification afterwards:

| Check | Result |
| --- | --- |
| `verify-deployment.sh` | **18/18** |
| the addresses in `/config` | `CAPB6NQ…` + `CCVW7WV…` (v2) |
| what the poller follows | `CAPB6NQ…` and `CCVW7WV…` |
| an old v1 event (`/events/4`) | **404** — gone, as it should be |
| the old R2 files | **200** — not deleted with it; files are not tied to a contract version |
| the full add-ons e2e on v2 | passed: submit → `enter` → confirm → index → roster |

Two items on that list are worth dwelling on.

**The index holds an event with status `Cancelled`** (`Sterun Cancelled Rehearsal`). That status is
v2-only, and its presence proves the previous day's three-layer work genuinely functions against a real
event — the decoder, the route's JSON schema, and the database CHECK constraint. The third layer is the
one `INTERFACE.md` §8 does not mention and the only one Postgres enforces.

**The poller, not just `rebuild`, caught a new v2 event.** Event 2 was created by the e2e script after
everything was running, and it appeared in the production index within one poll cycle. That is the
difference between "can read state once" and "follows the chain".

### For the web app (STE-8/13/21/22/24/32)

```bash
NEXT_PUBLIC_API_URL=https://api-sterun.jameshub.fun
```

CORS is an **allow-list**, not `*` — authenticated requests carry a wallet signature in a header, and
`*` would let any page a runner visits ask their browser to send it. The origins already allowed:
`https://sterun.jameshub.fun` and `http://localhost:3000` (for dev). Adding a new origin means adding
it to `STERUN_WEB_ORIGIN` in `be/.env.production`, comma-separated.


---

## STE-13 — a demo event on testnet, whose document genuinely exists

The four events already in the registry all pointed their `uri` at `https://sterun.xyz/...`, which
serves no file, so the only event-page state anyone had ever seen was **"the event document could not
be read"**. This event was created so the other path — a document that passes its hash check — can be
seen by people, grant reviewers included.

| What | Value |
| --- | --- |
| `event_id` | **4** |
| Name | `Sterun Demo Run 2026` |
| Organiser | `GBQBCEJTUNDAVJ2NQE43AZ7FUBO3OOYJXSYM6RY4WSCXCS3BPZNNO2OR` |
| `starts_at` | `1791068400` (2026-10-04 06:00 +07:00) |
| Status | `Open` |
| `metadata_hash` | `bca56c511de5c61fa5744488a3a6b95a900ba465b040e4cfb9ac6f7a290b96ad` |
| `uri` | https://raw.githubusercontent.com/AncungAulia/sterun/9505ed0478e04c864be085dc096146504436e2a2/docs/events/sterun-demo-run-2026.json |

The transactions (testnet, 2026-09-07):

| Step | Hash |
| --- | --- |
| `create_event` | [`bc40f345…`](https://stellar.expert/explorer/testnet/tx/bc40f3455a66b1973689211ba9ca39e9b07295ebc792ac1de51ae5882af5b87f) |
| `add_category` FUN5K (5 km, quota 100, free) | [`30d47abc…`](https://stellar.expert/explorer/testnet/tx/30d47abcd1ad4ab7b77e756a51a175ddbe15508a87517ca9acc3c1445afb7eca) |
| `add_category` R10K (10 km, quota 50, 25 sUSD) | [`9719ff5d…`](https://stellar.expert/explorer/testnet/tx/9719ff5dc556db5f6be93d40e14b065fc96c278e87594ff39921563bc2084b7f) |
| `set_event_status` → `Open` | [`bf5ead6d…`](https://stellar.expert/explorer/testnet/tx/bf5ead6d76b22e8cb30843314eee257d912e0f8f7b995ac24a44481d29fb1143) |

### Checking it yourself, without the app

```bash
curl -s https://raw.githubusercontent.com/AncungAulia/sterun/9505ed0478e04c864be085dc096146504436e2a2/docs/events/sterun-demo-run-2026.json | sha256sum
# bca56c511de5c61fa5744488a3a6b95a900ba465b040e4cfb9ac6f7a290b96ad
```

That number is the same `metadata_hash` stored in `EventRegistry` for `event_id` 4. That is the entire
claim: this event's poster, location and schedule cannot be changed quietly after people have entered.

### Why the `uri` points at a commit SHA rather than `main`

An event is **frozen** (`WEB_APP_IA.md` §2.2) and `metadata_hash` cannot be changed. A URL whose
contents can change — say `.../main/docs/...` — means that one day the file is edited, the hash stops
matching, and **there is no way to fix it**. A commit SHA is immutable, so this document will serve the
same bytes for as long as the repository is public. The `poster_url` inside the document is pinned by
the same rule.

The limit, deliberately recorded: `metadata_hash` locks the **JSON document**, not the image. What is
hashed is only the poster's URL, not the poster's contents. Closing that gap needs a `poster_sha256`
field in the document and a check on the page side — not done yet, a candidate for STE-17.

> This event's organiser secret key is **not** stored in the repository. It exists only in the log of
> the session that created it. If this event ever needs changing (`set_event_status`, say) and that key
> is gone, nobody can touch the event — us included. That is how the contract works.

---
## STE-36 — the organiser allowlist, installed by an IN-PLACE `upgrade` (2026-09-09/10)

**The address did not change.** This is the first upgrade that adds a *function* and a *storage key* to
a contract already holding other people's events — not a new pair deployed. `EventRegistry` at
`CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` is the same address before and after; the
seven events already inside it are untouched.

`RaceRecord` was **not** upgraded: its wasm did not change by a single byte, and
`upgrade-testnet.sh` skipped it deliberately so the ledger does not record a code change that did not
happen.

### Why

`create_event` accepts a free-form `name: String` and its only gate is `organiser.require_auth()`.
Auth proves the caller holds the keypair, and can say nothing about whether that keypair is entitled to
the name just used. Anyone could publish "Jakarta Marathon 2026" and sell entries to it. STE-36 option
A: an allowlist of addresses held by the admin.

### The wasm — old → new

| | sha256 | Size |
| --- | --- | ---: |
| before (v2.0.1) | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | 22,952 B |
| after (v2.1.0) | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | 26,948 B |

Toolchain: `rustc 1.93.0`, `stellar 27.0.0`, `soroban-sdk =26.1.1`. The frozen interface it
represents: `docs/specs/INTERFACE.md` **v2.1.0**.

The old wasm is **committed** in `sc/contracts/event_registry/testdata/`, fetched with
`stellar contract fetch` before the upgrade. Not nostalgia: the test
`state_written_by_the_live_wasm_survives_the_allowlist_upgrade` deploys those bytes, writes an event +
category + add-on + scanner + bib with them, then upgrades to the v2.1 build and reads it all back
again. That is the only pair of wasm that can prove `DataKey::Organiser` was appended safely, and the
test runs without a network.

### The transactions (testnet)

| Step | Ledger | Time (UTC) | Hash |
| --- | ---: | --- | --- |
| `upgrade` EventRegistry → `cf009033…` | 4592124 | 2026-09-09T20:03:27Z | [`f6beac51…`](https://stellar.expert/explorer/testnet/tx/f6beac513006cc186e3b15f020be763bc82ad0dc2aadfdcd96c15e6df8ae4d13) |
| `add_organiser` `GBGUI5MP…` (sterun-organiser) | 4592130 | 2026-09-09T20:03:57Z | [`a7888574…`](https://stellar.expert/explorer/testnet/tx/a7888574b28a189d63d350817f39c198b5f1319a54e1c799f4afe349c0945e81) |
| `add_organiser` `GA5VKC7Q…` (the `fe/` demo organiser) | 4592132 | 2026-09-09T20:04:07Z | [`4074d74f…`](https://stellar.expert/explorer/testnet/tx/4074d74f6b34789e39690d1452a47df194eb2ba73cc55d98ed95a730081fa1b3) |
| `create_event` sanity check by an allowlisted organiser → `event_id` 7 | 4592134 | 2026-09-09T20:04:17Z | [`f758b116…`](https://stellar.expert/explorer/testnet/tx/f758b11622e235e6fa10c27b68c6b41fc6eb688a54f195b23b471c0af37df58a) |

The admin that signed the `upgrade` and both `add_organiser` calls:
`GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` (sterun-admin, `STERUN_ADMIN` in the
gitignored `.env`).

### The allowlisted wallets, and why

| Address | Role | Reason |
| --- | --- | --- |
| `GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN` | `sterun-organiser` | the pilot organiser; owner of events 0 and 1 |
| `GA5VKC7QHIIC7GBXMHLILU2LMKKXYAHOFNE77CUOGMLO4GB3ZKP5HZS7` | the web app's demo organiser | owner of events 3 and 4 (`LARI TEKNIK (TESTING)` / `… 2`), created through `fe/`. Without this, that demo would stop being able to create events |

The throwaway e2e wallets (`GA7OMUVJ…`, `GDRQFV4Z…`, `GCIRTDFY…`) are **not** allowlisted: each run
makes a fresh keypair, so the scripts call `add_organiser` themselves with the admin key.

Revoking one is a single call:

```bash
stellar contract invoke --id CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU \
  --source-account sterun-admin --network testnet -- remove_organiser --organiser G…
```

Revocation is **forward-only**: events already created stay with their organiser, along with every
per-event power. What is lost is only the ability to create new events.

### On-chain sanity check — two negatives, one positive

`bash sc/scripts/allowlist-testnet.sh`, run after the upgrade:

```
=== negative: an address the admin never allowlisted cannot create an event ===
  ✓ GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF → Error(Contract, #18) NotAllowlistedOrganiser

=== positive: the seeded organiser can ===
  ✓ event_id 7 created by GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN (event_count 7 -> 8)

=== state written before the upgrade, read after it ===
  event 0  Sterun Testnet Rehearsal
  event 1  Sterun Cancelled Rehearsal
  event 2  Sterun add-ons e2e 2026-09-09
  event 3  LARI TEKNIK (TESTING)
  event 4  LARI TEKNIK (TESTING 2)
  event 5  Sterun SDK e2e 2026-09-09
  event 6  Sterun SDK e2e 2026-09-09
  category 0/0 {"code":"10K","distance_m":10000,"entered_count":3,"price_usdc":"50000000","quota":5}
  addon 0/0    {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2}
```

The negative case has **no tx hash**, and that is correct: a refused `create_event` fails in
**simulation**, so no transaction reaches the ledger at all. The address `GDHETLPD…` (sterun-test-a)
still has 2026-08-31 as the date of its last transaction. The gate refuses before there is anything to
pay for.

`upgrade-testnet.sh` also re-read the RaceRecord side against the upgraded code — `record_of 0` is
still `Finished` with `addon_ids [0,1]`, `owner_of 0` is still the same runner, `total_supply` is 7,
and there are **0 transfer-ish exports**.

### The full e2e after the upgrade — three scripts, all green

| Script | Result |
| --- | --- |
| `pnpm --filter @sterunxyz/sdk e2e` | ✅ event 9, token 7 (free) + 8 (paid, 5 sUSD), **8 negative cases** including `NotAllowlistedOrganiser(18)` |
| `pnpm --filter be e2e:results` | ✅ event 10, tokens 9/10/11, 8 CSV rows, 2 publishable, `source_sha256 2d090634…` |
| `pnpm --filter be e2e:addons` | ✅ event 11, tokens 12/13, jersey order `{"L":1,"S":1}`, a roster with no PII |

Evidence from the SDK e2e (the second run, against the upgraded wasm):

```
▸ Allowlisting the throwaway organiser (admin, STE-36)
  ✓ GDWDABONMVS6I33CEQMPGNTWEIZVEEZEKE5LB45TGMCYKJFQHPXBUYXC may create events

▸ Negative: an address the admin never allowlisted cannot create an event
  ✓ createEvent by a non-allowlisted address → NotAllowlistedOrganiser #18 (event-registry)
```

All three scripts now **require** `STERUN_ADMIN_SECRET`: each creates a throwaway organiser, and an
organiser cannot grant permission to itself — which is exactly what this gate is for.

### What an operator has to remember

**After an upgrade, the allowlist is EMPTY.** `upgrade` replaces code, not storage, and no migration
moves the organisers of existing events into it. Between tx `f6beac51…` (20:03:27Z) and `a7888574…`
(20:03:57Z) — thirty seconds — **not one** address on this network could create an event. If you
upgrade again to wasm that adds a similar gate, schedule the seeding for the same minute, not the next
day.

The `be/` index did **not** need truncating this time: the address did not change, `event_id`s are not
reused, and no existing entry changed meaning. That is the difference between an in-place upgrade and
moving addresses (compare `be/OPERATIONS.md`, "Moving to the v2 contracts").
