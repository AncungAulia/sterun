# Sterun — Instawards MVP (CLAUDE.md)

Protokol **race record non-transferable** untuk event lari di **Stellar/Soroban**. Grant Instawards $5k / 30 hari.
Design lengkap: **`docs/SYSTEM_DESIGN.md`** (C1-C14, storage model, lifecycle, TOTP, user flows). WAJIB dibaca sebelum kerja.

## Scope kerja (WAJIB)
- Kerja **HANYA di repo ini** (AncungAulia/sterun). JANGAN pernah sentuh repo `web3-rich`.
- Kerjakan tiket **berurutan** dari Linear.

## Layout repo (pakai yang SUDAH ada, jangan diubah)
```
sc/            smart contracts (Soroban Rust) — masih kosong (.gitkeep)
be/            backend (Node/TS) — masih kosong (.gitkeep)
fe/            web app (Next.js) — scaffolded
landing-page/  landing (Next.js) — scaffolded
docs/          SYSTEM_DESIGN.md + deployments.md (bukti deploy)
```
Ikuti layout `sc/be/fe/landing-page` ini (bukan `contracts/packages/apps` dari draft tiket).

## Tiket (Linear MCP)
- Workspace "Sterun", team key **STE**, project **"Sterun Instawards MVP"**. Tiket **STE-5 .. STE-33**.
- Baca tiap tiket via Linear MCP (Requirements / Not in this / Left to the owner / Tasks lengkap ada di deskripsi).
- Urutan build: **STE-5** EventRegistry → **STE-30** issue sUSD + deploy SAC → **STE-9** RaceRecord → **STE-10** tests+bindings → **STE-33** deploy testnet → dst (ikuti `blockedBy`).

## Tooling WAJIB
- **MCP Stellar Raven** (`mcp__stellar-raven__search` / `execute` via ToolSearch) — verifikasi SETIAP keputusan Stellar/Soroban (OZ non-fungible base, SEP-41/SAC, Wallets Kit, state archival/TTL, `stellar contract bindings typescript`, `stellar contract asset deploy`).
- **Skill Stellar Soroban** (stellar-dev smart-contracts) — pola scaffold/build/test kontrak.

## Keputusan FINAL
- Asset testnet = **sUSD (Sterun USD)** issue sendiri via SAC/SEP-41; mainnet = USDC (Circle).
- **TOTP 6 digit**.
- v1 non-upgradeable; PII off-chain (cuma `participant_hash` on-chain).
- **Versi crate kontrak (pinned EXACT di `sc/Cargo.toml`)**: `soroban-sdk = "=26.1.1"` (protocol 26),
  OZ `stellar-tokens`/`stellar-access`/`stellar-contract-utils`/`stellar-macros` = `"=0.7.2"`.
  Alasan: OZ 0.7.2 (rilis terbaru per 2026-08-31) mensyaratkan `soroban-sdk ^26.1.0`, jadi kita
  TIDAK bisa pakai soroban-sdk 27/28 selama masih memakai OZ non-fungible base. Naikkan hanya
  setelah OZ merilis versi kompatibel protocol 27. Stellar CLI 27 tetap dipakai (build/deploy
  kompatibel mundur).
- **Layout kontrak**: cargo workspace di `sc/`, member `sc/contracts/<nama_kontrak>/`
  (`event_registry`, lalu `race_record`). Bukan `contracts/` di root (draft tiket) — ikuti `sc/`.
- **Band kode error `#[contracterror]` (WAJIB, disjoint per kontrak)**:
  `1..=99` EventRegistry (C1) · `100..=199` RaceRecord (C2) · `200+` dipakai OZ
  `NonFungibleTokenError` · kontrak baru ambil ratusan berikutnya.
  Alasan: `ScError` Soroban cuma membawa `u32` **tanpa identitas kontrak**. `enter` cross-call
  ke EventRegistry + SAC, dan revert mereka merambat apa adanya ke pemanggil — tanpa band
  disjoint, `Error(Contract, #4)` dari `enter` bisa `EventNotOpen` (C1) ATAU `InvalidState` (C2),
  dan SDK D2 harus menebak. Kode error = ABI publik: **jangan pernah di-renumber** setelah
  STE-10 (freeze) merged. Test `error_codes_of_the_two_contracts_are_disjoint_bands` menjaga ini.
- **Caveat test auth (soroban-sdk 26.1.1)**: `mock_all_auths()` memakai *recording* auth mode di
  mana `require_auth` pada root frame dipenuhi untuk address apa pun — **termasuk contract
  address**. Jadi `mock_all_auths()` TIDAK bisa membuktikan gate auth di root frame (mis. gate
  invoker-contract `reserve_slot`). Pakai `env.mock_auths(&[...])` (enforcing) untuk setiap
  assertion gate auth.
- **Kontrak tidak boleh dipakai sebagai dependency biasa antar-member**: menautkan rlib kontrak
  lain ke cdylib bikin simbol `#[export_name]`-nya bentrok (`__constructor` multiply defined) /
  bocor ke wasm. Untuk cross-call pakai `#[contractclient]` lokal (atau `contractimport!`);
  crate kontrak lain hanya boleh jadi `[dev-dependencies]` untuk test.

## Testing (WAJIB, no bug)
- **e2e** + **edge case** + **positive case** + **negative case** untuk tiap tiket.
- Kontrak: unit + integration (soroban testutils), `cargo llvm-cov` **>80%**, semua revert path (QuotaFull, EventNotOpen, AlreadyClaimed, finish-before-claim), quota race, TTL extension, assert non-transferable (tidak ada export transfer/approve/burn).
- Jangan lanjut tiket berikutnya sebelum tiket sekarang lolos test.

## Git & workflow
- **Branch baru per tiket** (pakai nama branch dari deskripsi tiket, mis. `feat/1-event-registry-contract`).
- **Commit kecil-kecil** (per langkah bermakna), pesan commit rujuk STE-#.
- **PR mention @Axel (PM) + @fable (AI co-PM)** sebelum merge. **JANGAN self-merge ke `main`**.
- Deploy WAJIB commit bukti (CA + link stellar.expert, atau URL live) di **`docs/deployments.md`**.
- Update CLAUDE.md ini kalau ada konvensi/keputusan baru yang relevan.
