# Sterun web app (`fe/`)

Web app Sterun: directory event, flow pendaftaran, console panitia, QR pass, dan scanner
volunteer. Next.js App Router + Tailwind v4, membaca kontrak Soroban di Stellar testnet.

Sebelum menulis kode, baca [`guides/ARCHITECTURE.md`](guides/ARCHITECTURE.md) (struktur folder dan
aturannya) dan [`../docs/WEB_APP_IA.md`](../docs/WEB_APP_IA.md) (peta halaman).

## Menjalankan

Semua perintah dari **root repo**, bukan dari `fe/` — folder ini anggota pnpm workspace dan tidak
punya lockfile sendiri.

```bash
pnpm install                     # sekali, dari root
cp fe/.env.example fe/.env.local # isi sudah benar untuk testnet
pnpm --filter fe dev             # http://localhost:3000
```

Perintah lain:

```bash
pnpm --filter fe build
pnpm --filter fe typecheck       # next typegen && tsc --noEmit
pnpm --filter fe lint
```

`next typegen` di `typecheck` bukan hiasan: `app/layout.tsx` memakai `LayoutProps<"/">`, tipe global
yang di-generate Next ke `.next/types/` dan tidak ikut ter-commit. Tanpa langkah itu, `tsc` di mesin
yang belum pernah build akan gagal dengan `TS2304: Cannot find name 'LayoutProps'`.

## Konfigurasi

`.env.local` (salin dari `.env.example`). Alamat kontrak **tidak** di-hardcode di kode — sumbernya
[`../docs/deployments.md`](../docs/deployments.md), dan divalidasi saat boot di `src/lib/env.ts`.

| Variabel | Isi |
| --- | --- |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `NEXT_PUBLIC_EVENT_REGISTRY` | contract id EventRegistry |
| `NEXT_PUBLIC_RACE_RECORD` | contract id RaceRecord |
| `NEXT_PUBLIC_SUSD_SAC` | contract id SAC sUSD |
| `NEXT_PUBLIC_API_URL` | base URL backend `be/`, boleh kosong sampai dipakai |

Salah satu variabel hilang atau bukan contract id yang sah → app gagal saat boot dengan pesan yang
menyebut nama variabelnya, bukan error samar di tengah halaman.

## Wallet

Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`), dipasang lewat **npm** — dokumentasi
resminya menyebut JSR dengan ejaan scope berbeda (`@creit-tech`, pakai tanda hubung), tapi paket npm
`@creit.tech/...` adalah yang cocok dengan pnpm workspace ini dan menuntut
`@stellar/stellar-sdk ^17.0.0`, sama dengan `pnpm.overrides` di root.

Kit v2 memakai class **static**, bukan instance, dan menyimpan sendiri wallet terpilih plus address
ke localStorage. Itu yang membuat refresh halaman tetap terhubung tanpa kita menyimpan apa pun.
Semua pemakaiannya terkurung di `src/lib/wallet.ts`.

Untuk menguji: pasang [Freighter](https://freighter.app), arahkan ke **testnet**, lalu klik
`Connect wallet` di header.

## Struktur

```
app/                routing saja, tanpa logic
  (browse)/         halaman publik, network-only
src/
  components/       elements/ (primitif) + layouts/ (struktur)
  hooks/            semua hook
  lib/              chain, backend, storage
  utils/            helper murni
guides/             ARCHITECTURE.md
```

Aturan lengkapnya di [`guides/ARCHITECTURE.md`](guides/ARCHITECTURE.md). Dua yang paling sering
dilanggar: **teks UI wajib Bahasa Inggris**, dan **jangan pernah memakai em dash di teks UI**.
