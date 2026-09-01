# Sterun

**Record lari yang tidak bisa pindah tangan, di Stellar.**

Peserta lari selesai balapan, lalu buktinya cuma ada di database panitia — kalau panitianya bubar,
buktinya ikut hilang. Sterun menaruh record itu on-chain sebagai token **non-transferable**: tidak
bisa dijual, tidak bisa dipindah, dan bisa diverifikasi siapa pun tanpa wallet.

Desain lengkap: **[`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)**.

## Live di testnet sekarang

| Apa | Address | Explorer |
| --- | --- | --- |
| EventRegistry (C1) | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` | [buka](https://stellar.expert/explorer/testnet/contract/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64) |
| RaceRecord (C2) | `CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4` | [buka](https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4) |
| sUSD SAC (token biaya pendaftaran) | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` | [buka](https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU) |

Bukti deploy lengkap — hash wasm on-chain, tiap transaksi, rehearsal `enter → claim → finish`
berikut kasus negatifnya: **[`docs/deployments.md`](docs/deployments.md)**.

## Layout

Empat folder, satu tanggung jawab masing-masing:

| Folder | Isi | Stack | Konvensi |
| --- | --- | --- | --- |
| [`sc/`](sc/) | smart contract Soroban + TS bindings hasil generate | Rust, `soroban-sdk =26.1.1`, target `wasm32v1-none` | [`sc/CLAUDE.md`](sc/CLAUDE.md) |
| [`be/`](be/) | backend API + helper Stellar (faucet, nanti PII vault & indexer) | Node 24, TypeScript, Fastify | [`be/CLAUDE.md`](be/CLAUDE.md) |
| [`fe/`](fe/) | web app peserta + panitia + scanner PWA | Next.js 16, React 19, Tailwind v4 | [`fe/CLAUDE.md`](fe/CLAUDE.md) |
| [`landing-page/`](landing-page/) | landing + design system | Next.js 16, React 19, Tailwind v4 | [`landing-page/CLAUDE.md`](landing-page/CLAUDE.md) |
| [`docs/`](docs/) | desain, spec **beku**, bukti deploy | Markdown | [`docs/CLAUDE.md`](docs/CLAUDE.md) |

`be/`, `fe/`, dan `landing-page/` adalah satu **pnpm workspace**. `sc/` adalah cargo workspace yang
berdiri sendiri — dua ekosistem, dua tool, tidak dicampur.

## Jalankan

Butuh: **Node ≥ 22** (dipakai: 24), **pnpm 10**, dan — hanya kalau menyentuh kontrak —
**Rust 1.93** + **Stellar CLI 27**.

```bash
pnpm install          # sekali, dari root
pnpm dev              # backend di http://127.0.0.1:3001
curl localhost:3001/health   # {"status":"ok",...}
curl localhost:3001/config   # alamat kontrak yang dipakai proses ini
```

Perintah lain, semuanya dari root dan berlaku ke seluruh workspace:

```bash
pnpm build      # be (tsc) + fe (next build) + landing-page (next build)
pnpm lint
pnpm typecheck
pnpm test
```

Per app: `pnpm --filter fe dev`, `pnpm --filter landing-page dev`, `pnpm --filter be test`.

Kontrak (ekosistem terpisah, dari `sc/`):

```bash
cd sc
stellar contract build            # WAJIB sebelum cargo test — ada test yang membaca wasm-nya
cargo test                        # 33 + 42 test
node scripts/check-interface.mjs  # spec beku vs wasm vs bindings
```

## Dapat sUSD testnet dalam < 10 menit

Kategori berbayar menagih biaya pendaftaran dalam **sUSD**, asset classic Stellar. Akun tidak bisa
memegangnya tanpa **trustline**, dan `RaceRecord.enter` akan ter-rollback kalau tidak ada. Satu
perintah membereskan semuanya:

```bash
pnpm faucet --new
```

Yang dia lakukan, tiap langkah aman diulang:

```
account GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE
  1/3 XLM       account created and funded by Friendbot
  2/3 trustline opened for sUSD
  3/3 payout    50 sUSD sent, tx 3688fa62…
  balance seen by contracts (SAC): 50 sUSD
```

Baris terakhir dibaca lewat **SAC**, bukan lewat explorer — itu saldo yang dilihat kontrak waktu
`enter` menagih biaya, jadi itulah satu-satunya angka yang membuktikan akunnya benar-benar bisa
bayar.

| Kamu | Perintah |
| --- | --- |
| butuh akun baru sekalian | `pnpm faucet --new` |
| sudah punya akun | `pnpm faucet --secret S...` |
| **tidak** pegang kunci distributor | `pnpm faucet --new --no-payout` → akun + trustline siap, tinggal minta sUSD ke PM |
| mau jumlah lain | `pnpm faucet --secret S... --amount 25` |

Membayar sUSD butuh `SUSD_DISTRIBUTOR_SECRET` di `be/.env` (lihat [`be/.env.example`](be/.env.example)).
Tanpa itu, dua langkah pertama tetap jalan dan tool-nya bilang apa yang kurang. Alamat issuer dan
SAC **tidak** di-hardcode di mana pun — dibaca dari `docs/deployments.md`.

## Spec beku — baca sebelum bikin backend, SDK, atau app

Interface kontrak, layout event, kode error, dan definisi `participant_hash` + TOTP sudah
**dibekukan** di [`docs/specs/`](docs/specs/). Kalau kamu menulis client, itu sumber kebenarannya —
bukan `lib.rs`, bukan file ini.

```bash
bash docs/specs/verify.sh   # dua implementasi referensi harus sepakat di tiap vector
```

Aturan mengubahnya ada di [`docs/specs/CLAUDE.md`](docs/specs/CLAUDE.md). Kode error adalah ABI
publik dan **tidak pernah di-renumber**.

## CI

| Workflow | Yang dijaga |
| --- | --- |
| [`contracts.yml`](.github/workflows/contracts.yml) | build + test kontrak, coverage ≥80% (sekarang 99%), spec beku vs wasm vs bindings, export surface non-transferable, kesepakatan dua implementasi referensi |
| [`typescript.yml`](.github/workflows/typescript.yml) | install dari lockfile, lint, typecheck, build, dan test seluruh workspace TS |

sha256 wasm dan tabel coverage ditulis ke **job summary**, jadi bisa dibaca tanpa meng-install Rust.

## Lisensi & konteks

Dibangun untuk grant **Instawards** (30 hari). Testnet memakai **sUSD** yang kami issue sendiri;
mainnet nanti memakai USDC (Circle) — satu-satunya yang berubah adalah alamat SAC yang dipegang
RaceRecord, tanpa perubahan kode kontrak.
