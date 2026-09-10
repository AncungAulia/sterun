# Sterun — Instawards MVP (CLAUDE.md root)

Protokol **race record non-transferable** untuk event lari di **Stellar/Soroban**. Grant Instawards
$5k / 30 hari. Design lengkap: **`docs/SYSTEM_DESIGN.md`** (C1–C14, storage model, lifecycle, TOTP,
user flows). WAJIB dibaca sebelum kerja.

File ini adalah konvensi yang berlaku di **seluruh** repo. Tiap folder punya `CLAUDE.md` sendiri
berisi hal yang **cuma** berlaku di folder itu — baca yang folder-nya kamu sentuh:

| Folder | Isi `CLAUDE.md`-nya |
| --- | --- |
| [`sc/`](sc/CLAUDE.md) | cargo workspace kontrak: build, test, gate, versi pinned, band error |
| [`sc/contracts/event_registry/`](sc/contracts/event_registry/CLAUDE.md) | C1 — storage, kuota, add-on, scanner allowlist, `reserve_slot` |
| [`sc/contracts/race_record/`](sc/contracts/race_record/CLAUDE.md) | C2 — non-transferable, lifecycle, `enter` atomik, TTL |
| [`docs/`](docs/CLAUDE.md) | SYSTEM_DESIGN + `deployments.md` (bukti deploy) |
| [`docs/specs/`](docs/specs/CLAUDE.md) | spec BEKU C4: aturan mengubahnya, cara memverifikasinya |
| [`be/`](be/CLAUDE.md) | backend Node/TS (James) — API + PII vault + indexer + TTL keeper |
| [`sdk/`](sdk/CLAUDE.md) | `@sterunxyz/sdk` (James) — C5 `SterunClient` + C6 JSON Schema v1.0, packaging |
| [`fe/`](fe/CLAUDE.md) | web app Next.js (Ancung) — scaffolded |
| [`landing-page/`](landing-page/CLAUDE.md) | landing (Nabil) — scaffolded |

## Scope kerja (WAJIB)
- Kerja **HANYA di repo ini** (AncungAulia/sterun). JANGAN pernah sentuh repo `web3-rich`.
- Kerjakan tiket **berurutan** dari Linear, satu per satu, ikut `blockedBy`.

## Layout repo (pakai yang SUDAH ada, jangan diubah)
```
sc/            smart contracts (Soroban Rust) + bindings TS hasil generate — cargo workspace
be/            backend (Node/TS, Fastify) — API + helper Stellar + faucet sUSD
sdk/           @sterunxyz/sdk (Node/TS) — SterunClient di atas bindings (C5)
fe/            web app (Next.js) — scaffolded
landing-page/  landing (Next.js) — scaffolded
deploy/        Caddyfile + verify-deployment.sh (STE-31)
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
tanpa me-refresh SDK = test merah. Refresh: `pnpm --filter @sterunxyz/sdk vendor`.

Versi `@stellar/stellar-sdk` dipaksa satu (`^17.0.1`) lewat `pnpm.overrides` di `package.json`
root: generator bindings menuliskan `^14.5.0`, dan dua copy SDK dalam satu graph berarti dua RPC
client plus objek signer lintas-mayor. Bindings-nya sendiri **jangan** diedit.

## Status sekarang (per 2026-09-10)

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
| STE-15 | `@sterunxyz/sdk` — SterunClient (C5) | selesai, 84 test + e2e testnet live |
| STE-19 | JSON Schema v1.0 + packaging (C6) | kode selesai, 134 test — **`npm publish` menunggu kredensial npm** |
| STE-20 | results CSV + API hardening (C7/j6) | selesai, backend 586 test + e2e testnet live |
| STE-31 | deploy backend ke VPS | **SELESAI** — live di `https://api-sterun.jameshub.fun` (jameserver / pve02 / ct-sterun), Cloudflare Tunnel, verifikasi 14/14 |
| STE-8 | web app shell + wallet connect (C9) | selesai |
| STE-13 | directory + detail event dari chain (C9) | selesai, fe 161 test + e2e testnet live |
| — | file metadata event (`POST /events/files`) untuk STE-17 | selesai, backend 745 test + e2e live — **belum ada tiket Linear-nya** |
| — | object storage **R2** (`sterun-files`, APAC) | selesai — API jadi stateless, blocker replica hilang |
| STE-35 | **kontrak v2**: upgradeable + add-on berbayar + `Cancelled` | selesai, 114 test, **LIVE di testnet** |
| — | migrasi `be/` + `fe/` ke alamat v2 | selesai — index & vault di-truncate, e2e v2 lolos, 18/18 |
| STE-36 | **allowlist organiser** di EventRegistry (C1) | selesai, 66 test, **LIVE lewat `upgrade` in-place — alamat TETAP** |

Kontrak **sudah hidup di testnet**, dan sekarang ada **dua pasang**. Alamat + bukti transaksi
lengkap ada di [`docs/deployments.md`](docs/deployments.md):

```
# v2 (STE-35 + STE-36) — add-on berbayar, Cancelled, upgradeable, allowlist organiser.
# Interface: docs/specs/INTERFACE.md v2.1.0
EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW

# v1 (STE-33) — masih hidup di chain, TIDAK lagi dipakai be/ maupun fe/.
# Dicatat sebagai riwayat; jangan diarahkan ke sini lagi.
EVENT_REGISTRY_V1=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD_V1=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4

SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
```

**Migrasi client ke v2 SUDAH dikerjakan.** `be/` dan `fe/` menunjuk pasangan v2; `docs/deployments.md`
memakai nama tanpa sufiks untuk v2 dan melabeli v1 sebagai `v1`, jadi parser alamat di
`be/src/deployments.ts` me-resolve v2 dan ada test yang gagal kalau dia me-resolve v1.

Index dan vault di box produksi **di-truncate** saat perpindahan: `events.event_id` dan
`records.token_id` primary key telanjang tanpa pembeda kontrak, jadi menumpuk data dua kontrak di
satu database berarti v2 event 0 menimpa v1 event 0 — dan `participants` menautkan PII ke
`token_id` yang sama. Prosedur + alasannya: `be/OPERATIONS.md` bagian "Pindah ke kontrak v2".

**M1 (D1 — kontrak) SELESAI.** M2 (D2 — `@sterunxyz/sdk` + backend) tinggal satu langkah manual:
~~**STE-11** PII vault~~ → ~~**STE-16** indexer + TTL keeper~~ → ~~**STE-15** SterunClient~~ →
~~**STE-19** JSON Schema + packaging~~ → **`npm publish @sterunxyz/sdk`** (butuh akun npm James).

Seluruh rantai publish sudah diverifikasi tanpa registry: `npm pack` menghasilkan tarball yang
dipasang di project TypeScript kosong di luar repo, typecheck bersih, quickstart jalan ke testnet
live, dan dokumen hasilnya valid terhadap RaceRecord JSON Schema v1.0. Yang tersisa cuma
meng-upload-nya.

**M3 (D3 — web + scanner + landing) jalan.** Web app-nya hidup: `/` dan `/events/[id]` membaca
EventRegistry langsung lewat RPC, tanpa database dan tanpa wallet. Event `event_id` 4
(`Sterun Demo Run 2026`) dibuat di STE-13 sebagai bukti yang bisa diklik: dokumen metadata-nya
benar-benar disajikan dan lolos pengecekan `metadata_hash`, jadi keadaan "Document verified" bisa
dilihat, bukan cuma diceritakan. Sisanya: STE-17 console → STE-21 entry+pass → STE-22 scanner →
STE-24 profile → STE-32 deploy Vercel.

Backend sudah bisa dijalankan: API (`pnpm dev`), poller (`pnpm indexer follow`), dan TTL keeper
(`pnpm keeper run`) — tiga proses dari satu paket `be/`. Rangkaian penuhnya sudah dijalankan
terhadap testnet yang live, dari PII masuk sampai roster keluar: bukti langkah demi langkah ada di
[`docs/deployments.md`](docs/deployments.md) section "Bukti e2e STE-16".

Kontrak v1 **non-upgradeable**: alamatnya permanen untuk versi itu, dan itulah kenapa add-on
STE-35 butuh pasangan baru. **v2 upgradeable** (`upgrade(new_wasm_hash)`, admin-gated, di kedua
kontrak), jadi seharusnya ini terakhir kalinya alamat berganti. **STE-36 sudah membuktikannya**:
allowlist organiser mendarat di EventRegistry lewat `upgrade` — fungsi baru, storage key baru,
alamat sama, event lama utuh.

Harganya satu aturan yang tidak bisa dijaga compiler: **storage key append-only selamanya** —
jangan hapus/rename/ganti tipe varian `DataKey`, dan jangan tambah field wajib ke struct yang sudah
tersimpan. Alasan lengkap di [`sc/CLAUDE.md`](sc/CLAUDE.md). Dan klaim non-transferable RaceRecord
sekarang tentang wasm yang **ter-deploy** plus kunci admin, bukan tentang alamat selamanya —
tabelnya di `docs/specs/INTERFACE.md` §4, jangan menyalin kalimat v1 apa adanya ke materi grant.

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
- **TOTP 6 digit**. PII off-chain (cuma `participant_hash` on-chain).
- **v1 non-upgradeable, v2 upgradeable** (native Soroban `update_current_contract_wasm`, bukan
  proxy). Konsekuensi: storage key append-only selamanya.
- **Add-on berbayar hidup on-chain** (STE-35): `enter` menagih `category.price + Σ addon.price`
  dalam **satu** transfer atomik, dan `RecordData.addon_ids` mencatat yang dibeli.
- **`create_event` gated allowlist organiser** (STE-36, Opsi A). `require_auth` saja tidak cukup:
  `name` adalah `String` bebas, jadi tanpa allowlist siapa pun bisa menerbitkan
  "Jakarta Marathon 2026". Admin = **STERUN_ADMIN**, pengajuan akses off-chain. **B/KYC =
  pasca-pilot, bukan sekarang.** Allowlist-nya contract-wide dan pencabutannya maju saja —
  detail di `sc/contracts/event_registry/CLAUDE.md`.
- **Tanpa escrow.** Refund tetap janji off-chain. Karena v2 upgradeable, escrow bisa ditambahkan
  in-place nanti — jangan dibangun sekarang.
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
