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
