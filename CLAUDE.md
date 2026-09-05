# Sterun — Instawards MVP (CLAUDE.md root)

Protokol **race record non-transferable** untuk event lari di **Stellar/Soroban**. Grant Instawards
$5k / 30 hari. Design lengkap: **`docs/SYSTEM_DESIGN.md`** (C1–C14, storage model, lifecycle, TOTP,
user flows). WAJIB dibaca sebelum kerja.

File ini adalah konvensi yang berlaku di **seluruh** repo. Tiap folder punya `CLAUDE.md` sendiri
berisi hal yang **cuma** berlaku di folder itu — baca yang folder-nya kamu sentuh:

| Folder | Isi `CLAUDE.md`-nya |
| --- | --- |
| [`sc/`](sc/CLAUDE.md) | cargo workspace kontrak: build, test, gate, versi pinned, band error |
| [`sc/contracts/event_registry/`](sc/contracts/event_registry/CLAUDE.md) | C1 — storage, kuota, scanner allowlist, `reserve_slot` |
| [`sc/contracts/race_record/`](sc/contracts/race_record/CLAUDE.md) | C2 — non-transferable, lifecycle, `enter` atomik, TTL |
| [`docs/`](docs/CLAUDE.md) | SYSTEM_DESIGN + `deployments.md` (bukti deploy) |
| [`docs/specs/`](docs/specs/CLAUDE.md) | spec BEKU C4: aturan mengubahnya, cara memverifikasinya |
| [`be/`](be/CLAUDE.md) | backend Node/TS (James) — API + PII vault + indexer + TTL keeper |
| [`sdk/`](sdk/CLAUDE.md) | `@sterun/sdk` (James) — C5 `SterunClient` + C6 JSON Schema v1.0, packaging |
| [`fe/`](fe/CLAUDE.md) | web app Next.js (Ancung) — scaffolded |
| [`landing-page/`](landing-page/CLAUDE.md) | landing (Nabil) — scaffolded |

## Scope kerja (WAJIB)
- Kerja **HANYA di repo ini** (AncungAulia/sterun). JANGAN pernah sentuh repo `web3-rich`.
- Kerjakan tiket **berurutan** dari Linear, satu per satu, ikut `blockedBy`.

## Layout repo (pakai yang SUDAH ada, jangan diubah)
```
sc/            smart contracts (Soroban Rust) + bindings TS hasil generate — cargo workspace
be/            backend (Node/TS, Fastify) — API + helper Stellar + faucet sUSD
sdk/           @sterun/sdk (Node/TS) — SterunClient di atas bindings (C5)
fe/            web app (Next.js) — scaffolded
landing-page/  landing (Next.js) — scaffolded
docs/          SYSTEM_DESIGN.md + deployments.md (bukti deploy) + specs/ (spec BEKU)
```
Ikuti layout `sc/be/sdk/fe/landing-page` ini (bukan `contracts/packages/apps` dari draft tiket).
`sdk/` ditambahkan di STE-15 karena C5 harus bisa di-`import` browser (`fe/`, scanner PWA) —
tidak bisa hidup di dalam `be/`, yang menyeret Fastify dan `pg`.

`be/` + `sdk/` + `fe/` + `landing-page/` adalah **satu pnpm workspace** (root
`pnpm-workspace.yaml`); `sc/` cargo workspace terpisah. `sc/bindings/*` **tidak** masuk pnpm
workspace — itu output generator, dikonsumsi lewat `file:` dependency. Dari root:
`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm faucet`, `pnpm indexer`, `pnpm keeper`.

`sdk/` **tidak** memakai `file:` dependency: `sc/bindings/*/src/index.ts` di-*vendor* ke
`sdk/vendor/` sebagai salinan byte-identical (paket yang di-publish ke npm tidak bisa membawa
`file:` dep). `sdk/test/vendor.test.ts` gagal kalau salinannya melenceng, jadi regenerate bindings
tanpa me-refresh SDK = test merah. Refresh: `pnpm --filter @sterun/sdk vendor`.

Versi `@stellar/stellar-sdk` dipaksa satu (`^17.0.1`) lewat `pnpm.overrides` di `package.json`
root: generator bindings menuliskan `^14.5.0`, dan dua copy SDK dalam satu graph berarti dua RPC
client plus objek signer lintas-mayor. Bindings-nya sendiri **jangan** diedit.

## Status sekarang (per 2026-09-05)

| Tiket | Komponen | Status |
| --- | --- | --- |
| STE-5 | EventRegistry (C1) | selesai, 33 test |
| STE-30 | sUSD + SAC testnet | selesai, SAC `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| STE-9 | RaceRecord (C2) | selesai, 42 test |
| STE-10 | freeze interface + hash/TOTP (C4) | selesai, spec v1.0.1 |
| STE-14 | TS bindings + gate + CI (C3) | selesai |
| STE-33 | deploy kontrak ke testnet | selesai — **kontrak LIVE** |
| STE-6 | monorepo pnpm + CI TS + backend skeleton + faucet sUSD | selesai |
| STE-11 | PII vault + hash/TOTP backend (C7) | selesai |
| STE-16 | indexer + TTL keeper + roster bundle (C8) | selesai, backend 479 test |
| STE-15 | `@sterun/sdk` — SterunClient (C5) | selesai, 84 test + e2e testnet live |
| STE-19 | JSON Schema v1.0 + packaging (C6) | kode selesai, 134 test — **`npm publish` menunggu kredensial npm** |
| STE-20 | results CSV + API hardening (C7/j6) | selesai, backend 586 test + e2e testnet live |

Kontrak **sudah hidup di testnet**. Alamat + bukti transaksi lengkap ada di
[`docs/deployments.md`](docs/deployments.md):

```
EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
```

**M1 (D1 — kontrak) SELESAI.** M2 (D2 — `@sterun/sdk` + backend) tinggal satu langkah manual:
~~**STE-11** PII vault~~ → ~~**STE-16** indexer + TTL keeper~~ → ~~**STE-15** SterunClient~~ →
~~**STE-19** JSON Schema + packaging~~ → **`npm publish @sterun/sdk`** (butuh akun npm James).

Seluruh rantai publish sudah diverifikasi tanpa registry: `npm pack` menghasilkan tarball yang
dipasang di project TypeScript kosong di luar repo, typecheck bersih, quickstart jalan ke testnet
live, dan dokumen hasilnya valid terhadap RaceRecord JSON Schema v1.0. Yang tersisa cuma
meng-upload-nya.

Backend sudah bisa dijalankan: API (`pnpm dev`), poller (`pnpm indexer follow`), dan TTL keeper
(`pnpm keeper run`) — tiga proses dari satu paket `be/`. Rangkaian penuhnya sudah dijalankan
terhadap testnet yang live, dari PII masuk sampai roster keluar: bukti langkah demi langkah ada di
[`docs/deployments.md`](docs/deployments.md) section "Bukti e2e STE-16".

Kontrak v1 **non-upgradeable**: alamat di atas permanen untuk versi ini. Deploy ulang =
pasangan alamat baru, bukan upgrade.

## Workflow (berlaku sejak 2026-09-01, override aturan lama "tunggu approval sebelum merge")

1. **Branch baru per tiket**, pakai nama branch dari deskripsi tiket (mis.
   `feat/1-event-registry-contract`).
2. **Commit kecil-kecil**, satu langkah bermakna per commit, pesan commit rujuk `STE-#`. Badan
   commit menjelaskan **kenapa**, bukan mengulang diff.
3. Tiket beres + test hijau → **merge ke `main` langsung** (`git checkout main && git merge <branch>
   && git push origin main`), lalu **update status tiket di Linear jadi Done**. Satu tiket per satu
   merge, urut dependency. Axel sudah memberi izin; tidak perlu menunggu approval per PR lagi.
4. Model **Opus** untuk PM maupun worker (`claude --model opus`). Jangan fable.
5. **Update `CLAUDE.md` folder yang kamu sentuh** di commit yang sama kalau konvensinya berubah.
6. Deploy WAJIB commit bukti (CA + link stellar.expert, atau URL live) di **`docs/deployments.md`**.
7. Update worktree comment tiap checkpoint:
   `orca worktree set --worktree active --comment "..."`.

## Tooling WAJIB
- **MCP Stellar Raven** (`mcp__stellar-raven__search` / `execute` via ToolSearch) — verifikasi
  **SETIAP** keputusan Stellar/Soroban (OZ non-fungible base, SEP-41/SAC, Wallets Kit, state
  archival/TTL, `stellar contract bindings typescript`, `stellar contract asset deploy`, cara
  install CLI di CI). Jangan mengandalkan ingatan.
- **Skill Stellar Soroban** (`stellar-dev:smart-contracts`) — pola scaffold/build/test kontrak.

## CI — dua workflow, jalan tiap push dan PR
- **`contracts.yml`** — tiga job: `contracts` (fmt, clippy `-D warnings`, build, `cargo test`,
  `check-exports.sh`, `check-interface.mjs`, coverage gate 80%), `bindings` (kedua paket TS compile
  apa adanya), `spec` (`docs/specs/verify.sh` — dua implementasi referensi sepakat).
- **`typescript.yml`** — install dari lockfile (`--frozen-lockfile`), lint, typecheck, build, test
  seluruh workspace TS. Tidak menyentuh network, jadi tidak bisa merah gara-gara testnet.

sha256 wasm dan tabel coverage ditulis ke **job summary**, jadi bisa dibaca orang yang tidak
meng-install Rust sama sekali (mis. reviewer grant yang cuma pegang URL run-nya).

## Testing (WAJIB, no bug)
- **e2e** + **edge case** + **positive case** + **negative case** untuk tiap tiket.
- Kontrak: unit + integration (soroban testutils), `cargo llvm-cov` **>80%** (sekarang 99%), semua
  revert path (QuotaFull, EventNotOpen, AlreadyClaimed, finish-before-claim), quota race, TTL
  extension, assert non-transferable (tidak ada export transfer/approve/burn).
- **Jangan lanjut tiket berikutnya sebelum tiket sekarang lolos test dan ter-merge.**

## Keputusan FINAL (jangan diputuskan ulang)
- Asset testnet = **sUSD (Sterun USD)** issue sendiri via SAC/SEP-41; mainnet = USDC (Circle).
- **TOTP 6 digit**. v1 non-upgradeable. PII off-chain (cuma `participant_hash` on-chain).
- **Versi crate kontrak (pinned EXACT di `sc/Cargo.toml`)**: `soroban-sdk = "=26.1.1"` (protocol
  26), OZ `stellar-tokens`/`stellar-access`/`stellar-contract-utils`/`stellar-macros` = `"=0.7.2"`.
  Alasan + syarat menaikkannya: `sc/CLAUDE.md`.
- **Layout kontrak**: cargo workspace di `sc/`, member `sc/contracts/<nama_kontrak>/`.
- **Band kode error** `1..=99` C1 · `100..=199` C2 · `200+` OZ — alasan dan konsekuensinya di
  `sc/CLAUDE.md`. Kode error **tidak pernah di-renumber**.
- **Spec `docs/specs/` BEKU.** Mengubah signature / layout event / kode error / definisi
  hash-TOTP butuh prosedur di `docs/specs/CLAUDE.md`.

## Bahasa
Dokumen (`*.md`) dan pesan ke Axel: **Bahasa Indonesia**. Komentar di dalam kode dan pesan commit:
**Inggris** — itu yang dibaca James, Ancung, Nabil, dan reviewer grant di diff.
