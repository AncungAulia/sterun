@AGENTS.md

# `fe/` — web app (CLAUDE.md)

Blok `@AGENTS.md` di atas ditulis ulang oleh `next dev` — biarkan, dan commit bersama kerjaanmu.
Isi di bawah ini punya Sterun.

Owner: **Ancung** (flow) + **Nabil** (design system). Komponen C9/C10/C11/C12. Sudah ada:
**STE-8** (shell + wallet connect) dan **STE-13** (directory `/` + detail `/events/[id]`).
Berikutnya STE-17 (organiser console), lalu STE-21/22 (QR pass + scanner PWA), STE-24 (profile).

Stack terpasang: **Next.js 16.3.3**, React 19.2.8, Tailwind v4 (`@tailwindcss/postcss`),
TypeScript 5 (`target: ES2022` — harga kontrak `i128` datang sebagai `bigint`, dan literal
`bigint` tidak lolos typecheck di bawah ES2020), ESLint 9, **`@tanstack/react-query`** untuk cache
baca chain, `zustand` untuk state wallet.

**Tidak ada lockfile di `fe/`.** Folder ini anggota pnpm workspace (`pnpm-workspace.yaml` di root),
jadi yang berlaku cuma `pnpm-lock.yaml` di root — itu juga yang dipasang CI dengan
`--frozen-lockfile`. Jangan menjalankan `npm install` atau `pnpm install` dari dalam `fe/`: itu
menumbuhkan lockfile kedua yang tidak dibaca siapa pun tapi tetap ikut ter-commit.

```bash
pnpm install                # dari ROOT repo, bukan dari fe/
pnpm --filter fe dev
pnpm --filter fe build
pnpm --filter fe lint
pnpm --filter fe typecheck
```

`typecheck` = `next typegen && tsc --noEmit`, dan `next typegen`-nya **tidak boleh dilewati**:
`app/layout.tsx` memakai `LayoutProps<"/">`, tipe global yang di-generate Next 16 ke `.next/types/`
dan tidak ikut ke repo (`.next/` di-gitignore). `tsc` polos di mesin yang belum pernah build gagal
dengan `TS2304: Cannot find name 'LayoutProps'` — itu tipe yang belum di-generate, bukan bug.

## UI: shadcn/ui di atas token Nabil (STE-17)

```
src/components/ui/        <- shadcn. Di-generate, tapi milik kita: boleh diedit.
src/components/elements/  <- komponen produk kita, dibangun DI ATAS ui/
src/components/layouts/   <- struktur halaman
```

**`app/tokens.css` TIDAK disentuh.** Itu punya Nabil (STE-7) dan tetap satu-satunya sumber nilai
warna, huruf, radius. shadcn menulis komponennya terhadap nama semantik sendiri (`bg-background`,
`text-muted-foreground`, `border-border`, `ring-ring`); pemetaan nama-nama itu ke token Nabil ada di
**`app/globals.css`** dalam satu blok `@theme inline`, dan cuma di situ. Konsekuensinya: ganti satu
warna brand tetap cukup di satu tempat, dan ganti library komponen nanti cuma menyentuh file itu.

Aturan lama tetap berlaku dan tidak berubah artinya: **tidak ada hex, nama font, atau px mentah di
komponen.** Nama-nama shadcn itu alias untuk token, bukan nilai baru.

### Menambah komponen shadcn

```bash
cd fe && pnpm dlx shadcn@latest add <nama> --yes
sed -i 's|from "cn"|from "@/utils/cn"|' src/components/ui/*.tsx   # WAJIB, lihat di bawah
```

Tiga hal yang bikin bingung kalau tidak tahu:

- **CLI-nya menulis `import { cn } from "cn"`**, yang tidak resolve. Itu bug interaksi dengan alias
  `utils` di `components.json`. Perbaiki tiap habis `add`; typecheck akan menangkapnya kalau lupa.
- **Radix masuk lewat paket gabungan `radix-ui`**, bukan `@radix-ui/react-*` satu-satu. Jangan
  pasang yang individual: dua salinan Radix dalam satu graph itu masalah yang sama bentuknya dengan
  dua salinan `@stellar/stellar-sdk` (`CLAUDE.md` root).
- **Class `dark:` di komponen generate itu mati**, karena v1 light-only (keputusan STE-7). Dibiarkan
  apa adanya supaya file-nya tetap mudah dibandingkan dengan upstream waktu di-update.

### Varian yang kita tambahkan sendiri

`ui/badge.tsx` dapat `success`, `warning`, dan `accent` — shadcn tidak mengirim ketiganya, dan app
ini butuh: event itu `Open` atau bukan, dokumen itu cocok hash-nya atau tidak terbaca. Ketiganya
dibangun dari token Nabil seperti varian lain, jadi tetap satu palet.

## Yang WAJIB dibaca sebelum bikin flow

| Dokumen | Untuk apa |
| --- | --- |
| `fe/guides/ARCHITECTURE.md` | **baca duluan**: struktur folder, aturan per lapisan, akses data, aturan UI, checklist |
| `docs/WEB_APP_IA.md` | **peta halaman app ini**: URL apa saja, isinya apa, datanya dari mana, urutan bangun |
| `docs/SYSTEM_DESIGN.md` §6 | user flow lengkap: entry, race day, finish, verify |
| `docs/SYSTEM_DESIGN.md` §7 | desain rotating QR / anti-fraud |
| `docs/specs/HASH_AND_TOTP.md` §4–§5 | payload QR + derivasi kode TOTP, **byte-exact** |
| `docs/specs/INTERFACE.md` | signature fungsi + kode error |
| `sc/bindings/README.md` | cara memakai client TS hasil generate |

## Kontrak: lewat `@sterun/sdk`, bukan bindings mentah

```json
{ "dependencies": { "@sterun/sdk": "workspace:*" } }
```

Catatan ini dulu menyuruh memakai `file:../sc/bindings/*`; itu ditulis waktu SDK belum ada.
Sekarang `@sterun/sdk` (STE-15/STE-19) sudah jadi dan sudah diuji ke testnet live, dan
`fe/guides/ARCHITECTURE.md` §2 menetapkan SDK sebagai **satu-satunya** jalan bicara ke kontrak.
`workspace:*` karena paketnya belum di-publish ke npm.

**SDK harus di-build dulu** sebelum `fe` bisa typecheck/test/build: `pnpm --filter @sterun/sdk
build` (menghasilkan `sdk/dist/`). `pnpm -r build` dari root sudah urut topologis, jadi ini cuma
menggigit kalau kamu menjalankan `fe` sendirian di clone baru.

Jangan mengetik ulang signature kontrak, dan jangan mengedit apa pun di `sc/bindings/*/` — itu
output generator, edit tangan hilang tanpa jejak pada regenerate berikutnya.

### Baca chain (yang sudah ada dari STE-13)

- `src/lib/sterun.ts` — `readClient`, **read-only**. Semua view SDK itu simulasi, jadi halaman
  publik jalan tanpa wallet. Ada test yang gagal kalau file ini mengimpor wallet.
- `src/lib/events.ts` — `listEvents` / `getEventSummary`. Registry tidak punya "list events"
  (view yang mengembalikan vector tak terbatas akan mati sendiri begitu protokolnya laku), jadi
  daftar disusun dari `event_count` + `get_event` per id, paralel.
- `src/lib/metadata.ts` — unduh dokumen di `uri`, hitung sha256 byte-nya, bandingkan dengan
  `metadata_hash`. **Konvensi: `metadata_hash` = sha256 byte persis yang disajikan**, tanpa
  kanonikalisasi. STE-17 menulis dokumennya dengan aturan yang sama.
- `src/hooks/useEvents.ts` + `useEventMetadata.ts` — React Query di atas keduanya.

## Test

```bash
pnpm --filter fe test                      # unit + komponen, tanpa network
STERUN_E2E=1 pnpm --filter fe test test/e2e  # e2e ke testnet live, manual
```

E2E-nya opt-in supaya `typescript.yml` tetap tidak menyentuh network. File e2e jalan di environment
**node**, bukan jsdom: jsdom memasang `Uint8Array` realm-nya sendiri sebagai global, sehingga
`Buffer` bikinan stellar-sdk gagal `instanceof Uint8Array` di encoder XDR dan tiap call mati dengan
`functionName: expected Uint8Array` sebelum menyentuh jaringan. Di browser tidak terjadi (stellar-sdk
membawa polyfill Buffer yang meng-extend `Uint8Array` milik halaman).

## Yang bikin salah di sisi frontend

- **QR pass + scanner harus menghitung TOTP persis seperti backend.** Bukan "mirip". Uji terhadap
  `docs/specs/vectors/totp.json`, bukan terhadap implementasi sendiri. Kode 6 digit,
  step 30 detik, toleransi ±1 step, perbandingan constant-time.
- **Scanner PWA jalan offline.** Roster + antrian tx harus tahan device kehilangan sinyal di garis
  start. Guard anti-double-racepack ada di kontrak (`AlreadyClaimed` 102), jadi antrian yang drain
  belakangan aman — tapi UI-nya harus menjelaskan itu ke volunteer, bukan menampilkan error mentah.
- **Kode error itu angka `u32` tanpa identitas kontrak.** Pilih peta error dari band-nya:
  `1..=99` → `event-registry`, `100..=199` → `race-record`, `200+` → `NonFungibleTokenError`.
  `Error(Contract, #4)` dari `enter` = `EventNotOpen` milik EventRegistry, bukan error RaceRecord.
- **Asset testnet = sUSD, bukan USDC.** SAC `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`.
- **PII tidak pernah dikirim ke chain.** Form PII → backend; yang ke kontrak cuma
  `participant_hash`.
- **Wallet: Stellar Wallets Kit** (Freighter, xBull, Albedo, WalletConnect, Ledger) — keputusan
  `docs/SYSTEM_DESIGN.md` §8. Passkey smart account bukan scope v1.

## Konvensi

- **Semua teks UI Bahasa Inggris.** Label tombol, judul, pesan error, empty state, placeholder —
  semuanya. Dokumen `.md` tetap Bahasa Indonesia, komentar kode tetap Inggris; aturan ini menambah
  satu hal saja, yaitu teks yang tampil di layar.
- **Jangan pernah memakai em dash (`—`) atau en dash (`–`) di teks UI.** Pecah jadi dua kalimat,
  pakai koma, atau tanda kurung. Kalau benar-benar perlu pemisah, pakai tanda hubung biasa.
  Larangan ini khusus teks UI; komentar kode dan `.md` tidak terpengaruh.
- **Tidak ada hex, nama font, atau px mentah di komponen** — semua dari token `app/tokens.css`
  (milik Nabil, STE-7). Token itu punya dua salinan (`fe/` dan `landing-page/`); kalau diubah,
  ubah keduanya dalam satu commit.
- Contract address dari `docs/deployments.md`, lewat env var, bukan hardcode tersebar.
- Testnet RPC `https://soroban-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`.
- Test: e2e + edge + positive + negative (`CLAUDE.md` root). Untuk flow bayar dan scan, kasus
  negatifnya justru yang paling penting: kuota penuh, event tutup, scan kedua, offline.
- Perbarui file ini begitu ada keputusan struktur app (router, state, komponen bersama).
