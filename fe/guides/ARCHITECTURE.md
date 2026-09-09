# Sterun Web App — Architecture Guide

> Baca ini sebelum menulis satu baris kode pun di `fe/`.
> Baca bersama [`docs/WEB_APP_IA.md`](../../docs/WEB_APP_IA.md) (halaman apa saja dan isinya),
> [`fe/app/tokens.css`](../app/tokens.css) (token desain milik Nabil), dan
> [`docs/specs/`](../../docs/specs/) (interface kontrak + spec hash/TOTP, keduanya **beku**).

---

## 1. Overview

`fe/` adalah aplikasi Next.js App Router yang menampung **empat permukaan berbeda** dalam satu
deploy: directory publik, flow pendaftaran peserta, console panitia, dan scanner volunteer yang
harus jalan tanpa sinyal.

Ini bukan situs marketing (itu `landing-page/`, punya Nabil), dan bukan aplikasi CRUD. Kebenaran
data ada di blockchain, bukan di database kita. Sebagian besar aturan di dokumen ini turun dari dua
kenyataan itu.

Pemisahan tanggung jawabnya:

| Lapisan | Isinya |
| --- | --- |
| `app/` | routing saja — tidak ada logic, tidak ada UI |
| `src/modules/` | satu folder per halaman: logic + UI |
| `src/components/` | primitif dan layout yang dipakai lintas modul |
| `src/hooks/` | semua hook: baca chain, tulis chain, state |
| `src/lib/` | urusan chain dan backend: client, TOTP, hash, storage |
| `src/utils/` | helper murni tanpa efek samping |

---

## 2. Stack

| Paket | Untuk apa |
| --- | --- |
| `next` 16 (App Router) | framework |
| `typescript` 5 | bahasa |
| `tailwindcss` v4 | styling — token dari `app/tokens.css`, bukan config JS |
| `@sterun/sdk` | **satu-satunya** jalan bicara ke kontrak |
| `@creit-tech/stellar-wallets-kit` | koneksi wallet (Freighter, xBull, Albedo, WalletConnect, Ledger) |
| `@tanstack/react-query` | cache dan refetch hasil baca chain |
| `zustand` | state global kecil (wallet aktif, status online) |
| `idb` | wrapper IndexedDB untuk pass secret, roster, antrean claim |
| `qrcode` | render QR pass |
| `lucide-react` | ikon |

Catatan pemasangan Wallets Kit: dokumentasi resminya
([stellarwalletskit.dev](https://stellarwalletskit.dev)) saat ini menginstruksikan lewat **JSR**,
bukan npm:

```bash
npx jsr add @creit-tech/stellar-wallets-kit
```

Versi npm lama memakai nama scope yang berbeda (`@creit.tech/...`, dengan titik). **Pastikan ulang
saat STE-8 dikerjakan** dan catat pilihan finalnya di file ini — itu memang salah satu task di
tiketnya.

Yang **tidak** dipakai, dan alasannya:

- **`@stellar/stellar-sdk` langsung** — dipakai `@sterun/sdk` di dalam, jangan dipanggil sendiri
  dari komponen. Versinya sudah dipaksa satu lewat `pnpm.overrides` di root; dua salinan dalam satu
  graph berarti dua RPC client dan objek signer lintas-mayor.
- **`sc/bindings/*` langsung** — itu output generator. `@sterun/sdk` sudah membungkusnya dan
  menambahkan penanganan error yang kita butuhkan.
- **Dark mode / `next-themes`** — keputusan STE-7: v1 light only. QR pass juga memaksa permukaan
  terang karena kamera butuh kontras.

---

## 3. Struktur folder

```
fe/
├── app/                              ← ROUTING SAJA. Tidak ada logic, tidak ada UI.
│   │
│   ├── (browse)/                     ← network-only, service worker tidak menyentuh sini
│   │   ├── page.tsx                  /              → <Directory />
│   │   ├── events/[eventId]/
│   │   │   ├── page.tsx              /events/:id    → <EventDetail />
│   │   │   └── enter/page.tsx        /events/:id/enter → <Entry />
│   │   ├── runner/[address]/page.tsx /runner/G…     → <Profile />
│   │   └── profile/page.tsx          /profile       → <Profile /> (address dari wallet)
│   │
│   ├── (organiser)/                  ← wallet-gated, selalu online
│   │   └── org/
│   │       ├── page.tsx              /org
│   │       ├── new/page.tsx          /org/new
│   │       └── events/[eventId]/
│   │           ├── page.tsx          /org/events/:id
│   │           ├── scanners/page.tsx /org/events/:id/scanners
│   │           └── results/page.tsx  /org/events/:id/results
│   │
│   ├── (offline)/                    ← PWA. Service worker HANYA di-scope ke sini.
│   │   ├── pass/[tokenId]/page.tsx   /pass/:token
│   │   └── scan/
│   │       ├── page.tsx              /scan
│   │       └── [eventId]/
│   │           ├── page.tsx          /scan/:id
│   │           └── flagged/page.tsx  /scan/:id/flagged
│   │
│   ├── layout.tsx                    ← root shell: next/font, <Providers>, header
│   ├── providers.tsx                 ← Wallets Kit + TanStack Query
│   ├── globals.css                   ← import tailwind + tokens
│   ├── tokens.css                    ← MILIK NABIL. Jangan diedit tanpa bicara dengannya.
│   ├── manifest.ts                   ← PWA manifest
│   └── icon.png / apple-icon.png / favicon.ico
│
├── public/
│   └── brand/logo/                   ← SVG dari STE-7
│
├── guides/
│   └── ARCHITECTURE.md               ← file ini
│
└── src/
    ├── components/
    │   ├── elements/                 ← primitif kecil, dipakai di mana saja
    │   │   ├── Button.tsx
    │   │   ├── Card.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Input.tsx
    │   │   ├── EventStatusBadge.tsx  ← Draft | Open | Closed | Completed
    │   │   ├── RecordStateBadge.tsx  ← Entered | RacepackClaimed | Finished | DNF
    │   │   ├── AddressLink.tsx       ← potong address + link stellar.expert
    │   │   ├── TxLink.tsx            ← link transaksi
    │   │   ├── Identicon.tsx         ← avatar deterministik dari address
    │   │   ├── EmptyState.tsx
    │   │   └── ErrorNotice.tsx       ← menerima SterunContractError, bukan string mentah
    │   │
    │   └── layouts/
    │       ├── PageShell.tsx
    │       ├── Header.tsx
    │       ├── WalletButton.tsx      ← connect / disconnect / address aktif
    │       └── OfflineBanner.tsx
    │
    ├── modules/                      ← satu folder per halaman
    │   ├── directory/
    │   │   ├── Directory.tsx         ← entry point, dirender app/(browse)/page.tsx
    │   │   └── component/
    │   │       ├── EventCard.tsx
    │   │       └── DirectorySkeleton.tsx
    │   ├── event-detail/
    │   │   ├── EventDetail.tsx
    │   │   └── component/
    │   │       ├── CategoryRow.tsx   ← harga + sisa kuota + CTA per kategori
    │   │       ├── OverviewTab.tsx
    │   │       ├── TimelineTab.tsx
    │   │       └── PeopleTab.tsx
    │   ├── entry/
    │   │   ├── Entry.tsx             ← stepper: kategori → PII → review → sign
    │   │   └── component/
    │   │       ├── StepCategory.tsx
    │   │       ├── StepParticipant.tsx
    │   │       ├── StepReview.tsx
    │   │       └── EntrySuccess.tsx  ← bib, tx link, salt receipt, kode pemulihan
    │   ├── pass/
    │   │   ├── Pass.tsx
    │   │   └── component/
    │   │       ├── RotatingQr.tsx
    │   │       └── RecoveryImport.tsx
    │   ├── profile/
    │   │   ├── Profile.tsx           ← dipakai /runner/[address] DAN /profile
    │   │   └── component/
    │   │       ├── ProfileStats.tsx
    │   │       ├── RecordRow.tsx
    │   │       └── IdentityCheck.tsx ← hash dihitung di browser, tidak dikirim ke server
    │   ├── organiser/
    │   │   ├── OrganiserHome.tsx
    │   │   ├── CreateEvent.tsx
    │   │   ├── EventDashboard.tsx
    │   │   ├── Scanners.tsx
    │   │   ├── Results.tsx
    │   │   └── component/
    │   └── scanner/
    │       ├── ScannerHome.tsx       ← pilih event, unduh roster
    │       ├── Scanning.tsx          ← kamera, GREEN/RED, manual entry
    │       ├── Flagged.tsx
    │       └── component/
    │
    ├── hooks/
    │   │   ── Baca chain (via SterunClient read-only + React Query) ──
    │   ├── useEvents.ts              ← daftar event untuk directory
    │   ├── useEvent.ts               ← satu event + kategorinya
    │   ├── useEventMetadata.ts       ← unduh uri + verifikasi metadata_hash
    │   ├── useRecordsOf.ts           ← riwayat satu runner
    │   ├── useEventRecords.ts        ← record satu event (tab People, dashboard panitia)
    │   │
    │   │   ── Tulis chain (wallet menandatangani) ──
    │   ├── useCreateEvent.ts
    │   ├── useAddCategory.ts
    │   ├── useSetEventStatus.ts
    │   ├── useScannerAllowlist.ts    ← add / remove scanner
    │   ├── useEnter.ts               ← satu transaksi atomik
    │   ├── useRecordFinish.ts        ← batch dari CSV
    │   ├── useClaimQueue.ts          ← antrean offline scanner → chain
    │   │
    │   │   ── Backend (be/) ──
    │   ├── useSubmitParticipant.ts   ← POST /participants
    │   ├── useRoster.ts              ← GET /events/:id/roster (scanner)
    │   ├── useResultsPreview.ts      ← POST /events/:id/results/preview
    │   │
    │   │   ── App ──
    │   ├── useWallet.ts              ← Wallets Kit: connect, address, signTransaction
    │   ├── useTotpCode.ts            ← kode berjalan untuk pass
    │   ├── useOnlineStatus.ts
    │   └── useClockSkew.ts           ← banner kalau jam device melenceng
    │
    ├── lib/
    │   ├── sterun.ts                 ← factory SterunClient (read-only + bertanda tangan)
    │   ├── events.ts                 ← daftar event dari event_count + get_event per id
    │   ├── env.ts                    ← contract address dari env, divalidasi saat boot
    │   ├── wallet.ts                 ← setup Wallets Kit
    │   ├── api.ts                    ← fetch ke backend be/
    │   ├── totp.ts                   ← hitung kode per docs/specs/HASH_AND_TOTP.md
    │   ├── hash.ts                   ← participant_hash, dihitung di browser
    │   ├── identicon.ts              ← address → SVG deterministik
    │   ├── db.ts                     ← IndexedDB: pass secret, roster, antrean claim
    │   └── metadata.ts               ← parse + verifikasi dokumen metadata event
    │
    └── utils/
        └── format.ts                 ← shortAddress, formatPrice, formatDuration, formatDistance
```

---

## 4. Aturan per lapisan

### 4.1 `app/` — routing saja

`page.tsx` melakukan satu hal: merender komponen modul yang bersangkutan.

```tsx
// app/(browse)/page.tsx
import { Directory } from "@/modules/directory/Directory";

export default function DirectoryPage() {
  return <Directory />;
}
```

Tidak ada logic, tidak ada hook, tidak ada UI. Kalau kamu tergoda menulis `useState` di
`page.tsx`, itu tandanya kodenya milik `modules/`.

Route group (`(browse)`, `(organiser)`, `(offline)`) **tidak mengubah URL**. Dia ada untuk dua hal:
memberi layout berbeda per permukaan, dan menandai batas service worker.

### 4.2 `src/components/elements/` — primitif

Komponen kecil yang bisa dipakai di mana saja.

Aturan:
- Punya varian (`Button`: `primary | secondary | ghost | danger`)
- **Tanpa business logic** — tidak boleh ada hook baca chain, tidak boleh ada panggilan SDK
- Digerakkan props saja
- Semua nilai visual dari token (§6)

### 4.3 `src/components/layouts/` — struktur

Header, shell halaman, tombol wallet. Dipakai lintas halaman, tanpa logic spesifik fitur.

### 4.4 `src/modules/` — satu folder per halaman

File utama adalah entry point yang dirender `app/`. Komponen yang cuma dipakai di dalam modul itu
masuk `component/`.

**Aturan promosi:** dipakai di satu modul → tetap di `component/`. Dipakai di dua modul atau lebih →
naik ke `components/elements/`. Jangan meng-import dari `component/` milik modul lain — kalau
butuh, promosikan dulu.

**Satu aturan khusus Sterun:** modul di `(offline)` (`pass/`, `scanner/`) **tidak boleh meng-import
apa pun dari modul `(browse)` atau `(organiser)`**. Keduanya harus bisa hidup di bundle yang
di-precache service worker tanpa menyeret halaman yang justru tidak boleh di-cache.

### 4.5 `src/hooks/` — semua hook

Aturan:
- Satu hook satu file, dinamai `use*.ts`
- **Hook baca** memakai React Query di atas `SterunClient` read-only. Jangan `fetch` ke RPC langsung
  dari modul.
- **Hook tulis** memakai `SterunClient` bertanda tangan dan **wajib** mengekspos `isPending`
  (menunggu wallet) dan `isConfirming` (menunggu chain). Dua keadaan itu terasa sangat berbeda buat
  pengguna: yang satu menunggu dia, yang satu menunggu jaringan.
- Selalu jaga dengan `enabled: !!address` sebelum wallet tersambung
- Store Zustand juga di sini, dinamai `use*Store.ts`

### 4.6 `src/lib/` — chain dan backend

Semua yang tahu soal Stellar, backend, atau storage. Komponen tidak boleh tahu detailnya.

| File | Isi |
| --- | --- |
| `sterun.ts` | factory `SterunClient` — read-only dan bertanda tangan |
| `events.ts` | `listEvents` / `getEventSummary`, plus urutan directory |
| `env.ts` | `EVENT_REGISTRY`, `RACE_RECORD`, `API_URL` dari env, divalidasi saat boot |
| `wallet.ts` | setup Wallets Kit, adapter `signTransaction` |
| `api.ts` | `apiFetch()` ke backend `be/` |
| `totp.ts` | hitung kode 6 digit, **byte-exact** per spec beku |
| `hash.ts` | `participant_hash` = sha256(name ‖ national_id ‖ emergency_contact ‖ salt) |
| `identicon.ts` | address → SVG, deterministik, dihitung lokal |
| `db.ts` | IndexedDB: pass secret, roster event, antrean claim |
| `metadata.ts` | unduh `uri`, hitung ulang sha256, bandingkan `metadata_hash` |

### 4.7 `src/utils/` — helper murni

Fungsi tanpa state dan tanpa kopling ke chain. `shortAddress()`, `formatPrice()` (stroops 7 desimal
→ tampilan manusiawi), `formatDuration()` (detik → `hh:mm:ss`), `formatDistance()`.

---

## 5. Aturan akses data

### 5.0 Tidak ada "list events" di kontrak, dan itu disengaja

`EventRegistry` cuma punya `event_count` + `get_event(id)`. View yang mengembalikan vector tak
terbatas akan makin lambat dan makin mahal justru waktu protokolnya laku, sampai suatu hari
melewati batas resource dan directory berhenti memuat untuk semua orang. Jadi daftarnya disusun
di klien (`lib/events.ts`): baca `event_count`, lalu `get_event` tiap id secara paralel.

Dua kegagalan di situ **tidak sama**, dan bedanya kelihatan di layar:

| Yang gagal | Yang dilakukan |
| --- | --- |
| satu id yang dihitung registry tapi tidak bisa dibaca | masuk `unreadable`, sisanya tetap tampil (entry ledger bisa kedaluwarsa di Soroban) |
| kategori satu event | event tetap tampil tanpa kategori |
| `event_count` sendiri (RPC mati) | **throw** — RPC mati dan registry kosong tidak boleh kelihatan sama |

Yang terakhir itu aturannya, bukan preferensi: menggambar "no events yet" di atas jaringan yang
mati memberi tahu tiap pengunjung bahwa protokolnya tidak dipakai siapa-siapa.

### 5.1 Empat sumber, dan mana yang benar

| Sumber | Dipakai untuk | Sifat |
| --- | --- | --- |
| Chain via `@sterun/sdk` | semua yang harus benar | **otoritatif** |
| Indexer `be/` (`/events`, `/records`) | daftar panjang, filter, kecepatan | cepat, bisa tertinggal |
| Vault `be/` (`/participants`) | submit PII, ringkasan milik sendiri | tidak pernah mengembalikan PII |
| Roster `be/` (`/events/:id/roster`) | scanner saja | berisi `totp_secret`, paling sensitif |

Aturannya: **indexer boleh mempercepat, tidak boleh menentukan**. Angka yang menentukan keputusan —
sisa kuota, state record, hasil `verify` — dibaca dari chain. Kalau keduanya berbeda, chain yang
benar dan UI tidak boleh diam-diam menampilkan yang salah.

### 5.2 `SterunClient` — read-only vs bertanda tangan

Halaman publik **tidak butuh wallet sama sekali**:

```ts
// src/lib/sterun.ts
import { SterunClient, TESTNET } from "@sterun/sdk";
import { CONTRACTS } from "./env";

export const readClient = new SterunClient({ ...TESTNET, contracts: CONTRACTS });
```

Untuk menulis, pemeran ditentukan **per panggilan**, bukan per client. Ini penting di Sterun karena
satu alur melibatkan empat penanda tangan berbeda dalam hitungan menit: panitia membuka event,
peserta membayar, scanner memindai, panitia menerbitkan hasil.

```ts
await sterun.enter(
  { runner, eventId, categoryId, participantHash },
  { publicKey: runner, signTransaction },
);
```

`publicKey` bukan hiasan di sebelah `signTransaction`: itu akun sumber yang dipakai membangun dan
mensimulasikan transaksi, dan **simulasi itulah yang merekam auth entry**. Simulasi dengan address
yang salah menghasilkan auth tree untuk address itu, sehingga tanda tangan yang benar pun tidak
memenuhinya.

Semua fungsi tulis mengembalikan `SentResult<T>`:

```ts
{ value: T, txHash: string, ledger: number | null }
```

`txHash` itu yang ditempel ke tautan explorer. **Selalu tampilkan** setelah aksi berhasil — itu
bukti yang jadi jualan seluruh produk ini.

### 5.3 Alamat kontrak dari env, tidak pernah di-hardcode

`@sterun/sdk` sengaja tidak membawa alamat kontrak (baca alasannya di `sdk/src/network.ts`):
kontrak v1 non-upgradeable, jadi deploy ulang berarti **pasangan alamat baru**, dan konstanta di
dalam paket akan diam-diam menunjuk ke pasangan lama.

Sumber kebenaran alamat: [`docs/deployments.md`](../../docs/deployments.md). Di app, dia masuk lewat
env dan divalidasi di `lib/env.ts` saat boot — bukan dicek satu per satu di tempat pemakaian.

```
NEXT_PUBLIC_EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
NEXT_PUBLIC_RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW
NEXT_PUBLIC_SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
NEXT_PUBLIC_API_URL=…
```

### 5.4 PII tidak pernah menyentuh chain, dan hash dihitung di browser

Form peserta mengirim nama, NIK, dan kontak darurat **ke backend saja**. Yang masuk kontrak hanya
`participant_hash`.

Di halaman profile, blok identity check menghitung hash **sepenuhnya di browser pengunjung** dan
memanggil `verify(token_id, hash)`. PII tidak dikirim ke server mana pun, termasuk server kita.
Kalau kamu tergoda mengirimnya ke backend "biar gampang", itu membatalkan klaim inti produk.

---

## 6. Aturan UI

### 6.1 Bahasa: semua teks UI **Bahasa Inggris**

Setiap teks yang dilihat pengguna ditulis dalam Bahasa Inggris: label tombol, judul, pesan error,
empty state, teks bantuan, satuan, placeholder.

```tsx
// SALAH
<Button>Daftar sekarang</Button>
<EmptyState>Belum ada event</EmptyState>

// BENAR
<Button>Register</Button>
<EmptyState>No events yet</EmptyState>
```

Yang **tetap** Bahasa Indonesia: dokumen `.md` seperti file ini, dan pesan ke Axel. Yang tetap
Bahasa Inggris: komentar di dalam kode dan pesan commit. Aturan ini menambah satu hal saja — teks
yang tampil di layar juga Inggris.

### 6.2 Jangan pernah memakai em dash di teks UI

Karakter `—` (em dash) dan `–` (en dash) **dilarang** di teks yang dilihat pengguna.

```tsx
// SALAH
<p>Registration closes soon — don&apos;t wait</p>

// BENAR
<p>Registration closes soon. Do not wait.</p>
<p>Registration closes soon, so do not wait.</p>
```

Perbaikannya: pecah jadi dua kalimat, atau pakai koma, atau tanda kurung. Kalau benar-benar butuh
pemisah, pakai tanda hubung biasa (`-`).

Larangan ini **hanya untuk teks UI**. Komentar kode dan dokumen `.md` tidak terpengaruh.

### 6.3 Token desain: jangan pernah menulis nilai mentah

Aturan dari Nabil, dan berlaku mutlak: **tidak ada hex, nama font, atau nilai piksel di dalam
komponen.** Kalau nilai yang kamu butuhkan belum ada, tambahkan token baru di `tokens.css` — dan
karena `tokens.css` ada dua salinan (`fe/` dan `landing-page/`), ubah **keduanya dalam satu
commit**.

Yang perlu kamu tahu dari `tokens.css`:

| Hal | Aturan |
| --- | --- |
| `--color-teal` | kalau teal, artinya bisa diklik. Jangan pakai untuk dekorasi. |
| `--color-success` / `--color-danger` | versi gelap, untuk teks dan badge di permukaan terang |
| `--color-success-strong` / `--color-danger-strong` | versi terang, **khusus panel GREEN/RED scanner**, wajib teks ≥32px |
| `--font-hero` | Big Shoulders 700, **hanya** ≥48px (hero landing, verdict scanner) |
| `--font-display` | Poppins italic 500-600, untuk heading. Pakai class `.heading` / `.heading-strong` |
| `--font-sans` | Poppins roman 400-500, untuk body. Tidak pernah lewat 600. |
| `.numeric` | **wajib** untuk bib, kode 6 digit, waktu, jumlah, dan address |
| `--text-bib` | 72px, khusus nomor bib di QR pass |

`.numeric` bukan kosmetik: tanpa tabular figures, kode TOTP yang berganti tiap 30 detik akan
bergoyang lebarnya saat angkanya berubah.

Focus ring sudah didefinisikan global di `tokens.css`. Jangan menimpanya, dan jangan pernah menulis
`outline: none` tanpa pengganti.

### 6.4 Error selalu dipetakan, tidak pernah mentah

Kode error kontrak adalah `u32` tanpa identitas kontrak. `Error(Contract, #4)` bisa berarti dua hal
tergantung kontrak mana yang melemparnya. `@sterun/sdk` sudah menyediakan pemetaannya:

```ts
import { classifyContractError, SterunContractError } from "@sterun/sdk";
```

Band-nya: `1..=99` EventRegistry, `100..=199` RaceRecord, `200+` OpenZeppelin.

Error yang **wajib punya tampilan sendiri**, bukan toast generik: `QuotaFull(5)`,
`EventNotOpen(4)`, `AlreadyClaimed(102)`, `InvalidState(103)`, saldo sUSD kurang, dan user menolak
menandatangani. Masing-masing punya jalan keluar yang berbeda buat pengguna, jadi pesannya harus
berbeda juga.

---

## 7. Aturan offline

Berlaku untuk `(offline)` saja. Halaman lain **tidak boleh** di-cache: directory yang basi
membatalkan klaim bahwa chain adalah sumber kebenaran.

- Service worker **hanya** meng-precache `/pass/*` dan `/scan/*`
- Semua rute lain: network-only
- `totp.ts` dan `hash.ts` **wajib diuji terhadap `docs/specs/vectors/`**, bukan terhadap
  implementasi sendiri. Backend dan scanner harus menghasilkan angka yang identik; menguji terhadap
  diri sendiri cuma membuktikan kamu konsisten dengan kesalahanmu sendiri.
- Toleransi verifikasi TOTP: ±1 step. Perbandingan **constant-time**.
- Antrean claim di-persist di IndexedDB dengan retry backoff, harus selamat dari app restart
- Revert `AlreadyClaimed` masuk daftar flag, **tidak boleh hilang diam-diam**
- Jam device yang melenceng memunculkan banner, karena itu penyebab RED palsu yang paling sering

---

## 8. Path alias

`@/` menunjuk ke `src/`.

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

Scaffold sekarang memetakan `@/*` ke root `fe/`. **Ubah ke `./src/*` saat STE-8**, sebelum ada
import yang terlanjur menyebar.

Jangan pernah memakai `../../` lintas folder. Di dalam satu modul, relatif tetap boleh.

---

## 9. Konvensi penamaan

| Item | Konvensi | Contoh |
| --- | --- | --- |
| File komponen | PascalCase | `EventCard.tsx` |
| File hook | camelCase, awalan `use` | `useRecordsOf.ts` |
| File utility / lib | camelCase | `format.ts`, `totp.ts` |
| Store Zustand | camelCase, akhiran `Store` | `useWalletStore.ts` |
| Folder komponen lokal | huruf kecil | `component/` |
| Folder modul | kebab-case | `event-detail/` |
| Tipe TypeScript | PascalCase | `type ScanVerdict = …` |
| Konstanta | SCREAMING_SNAKE_CASE | `CONTRACTS`, `TOTP_STEP_SECONDS` |
| Nilai on-chain | apa adanya dari SDK | `EventStatus`, `RecordState` |

---

## 10. Setup

Dari **root repo**, bukan dari `fe/`:

```bash
pnpm install
pnpm --filter fe dev
pnpm --filter fe typecheck
pnpm --filter fe lint
```

Yang perlu dikerjakan di STE-8 sebelum modul pertama ditulis:

1. **Setup `next/font`** — `tokens.css` memanggil `var(--font-poppins)` dan
   `var(--font-big-shoulders)`, tapi `layout.tsx` belum menyediakannya. Sekarang font-nya masih
   jatuh ke fallback sistem.
2. **Ganti metadata** — `layout.tsx` masih bertuliskan "Create Next App".
3. **Buat `src/` dan ubah path alias** ke `./src/*`.
4. **`lib/env.ts`** dengan validasi saat boot.
5. **Kunci versi Wallets Kit** (npm atau JSR) dan catat hasilnya di §2.

---

## 11. Checklist sebelum menulis modul

- [ ] `page.tsx` cuma merender komponen modul, tidak ada logic
- [ ] Baca chain lewat hook di `hooks/`, bukan `fetch` langsung dari modul
- [ ] Hook tulis mengekspos `isPending` dan `isConfirming`
- [ ] `txHash` ditampilkan dan bisa diklik setelah setiap aksi berhasil
- [ ] Alamat kontrak dari `lib/env.ts`, tidak ada yang di-hardcode
- [ ] Error kontrak lewat `classifyContractError`, bukan pesan mentah
- [ ] `QuotaFull`, `EventNotOpen`, `AlreadyClaimed`, `InvalidState` punya tampilan masing-masing
- [ ] **Tidak ada em dash di teks UI**
- [ ] **Semua teks UI Bahasa Inggris**
- [ ] Tidak ada hex, nama font, atau px mentah di komponen
- [ ] `.numeric` terpasang di bib, kode TOTP, waktu, jumlah, dan address
- [ ] Komponen lokal ada di `component/` dalam modulnya
- [ ] Import memakai `@/`, bukan `../../`
- [ ] Modul `(offline)` tidak meng-import apa pun dari `(browse)` atau `(organiser)`
- [ ] PII tidak pernah dikirim ke chain, dan hash identity check dihitung di browser
- [ ] Loading, empty, dan error state ada semua — testnet lambat itu keadaan normal
