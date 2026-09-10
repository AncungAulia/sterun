@AGENTS.md

# `fe/` — web app (CLAUDE.md)

Blok `@AGENTS.md` di atas ditulis ulang oleh `next dev` — biarkan, dan commit bersama kerjaanmu.
Isi di bawah ini punya Sterun.

Owner: **Ancung** (flow) + **Nabil** (design system). Komponen C9/C10/C11/C12. Sudah ada:
**STE-8** (shell + wallet connect) dan **STE-13** (directory `/` + detail `/events/[id]`).
Berikutnya STE-17 (organiser console), lalu STE-21/22 (QR pass + scanner PWA), STE-24 (profile).

Halaman `/events/[id]` sudah **di-revamp** (bagian dari STE-17): poster + kartu keputusan di atas,
lalu enam tab — Details, Terms, Timeline, Distances, Race pack, Proofs. Pembagiannya satu aturan:
**apa yang dari chain dan apa yang dari dokumen**. Kartu keputusan seluruhnya chain; tab-nya bacaan.
Dokumen yang gagal cek hash **ditahan di semua tab**, dan bedanya `modified` vs `unavailable` cuma
diceritakan di **Proofs**.

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

`ui/badge.tsx` dapat `success`, `warning`, `accent`, dan `muted` — shadcn tidak mengirim
keempatnya, dan app ini butuh: event itu `Open` atau bukan, dokumen itu cocok hash-nya atau tidak
terbaca. Semuanya dibangun dari token Nabil seperti varian lain, jadi tetap satu palet.

`muted` ada karena `secondary` memetakan ke `n-100`, satu tingkat dari warna halaman sendiri,
sehingga chip yang memakainya terbaca sebagai chip outline yang kehilangan garisnya. Itu ketahuan
dari **screenshot**, bukan dari test: `Draft` dan `Closed` kembar di layar padahal artinya
berlawanan arah waktu. Lihat header `elements/EventStatusBadge.tsx`.

`ui/tabs.tsx` juga kita tambahkan sendiri (halaman event dibangun di atasnya).

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

## Organiser console: bentuk wizard (STE-17)

`/org/new` = **6 langkah**: Details → Distances → Terms → Add-ons → Review → Done. Aturannya tetap
sama dan tidak melunak: **jangan menambah langkah yang cuma memetakan satu transaksi** (alasannya
di `docs/WEB_APP_IA.md` §5.1 dan di header `modules/organiser/CreateEvent.tsx`). Tiga yang
ditambahkan bukan itu:

- **Terms** — satu bidang teks, nol transaksi. Isinya masuk ke dokumen event, jadi ikut ditutup
  `metadata_hash`: aturan lomba jadi beku dan bisa dibuktikan.
- **Add-ons** — satu langkah, tapi **banyak** transaksi (satu per ukuran), jadi justru kebalikan
  dari yang dilarang.
- **Done** — nol transaksi. Layar selesai, dengan receipt tiap tanda tangan. `Done` **diturunkan**
  dari `run.isComplete`, bukan di-`setStep`: run yang memiliki fakta "sudah selesai", dan menyimpan
  ulang fakta itu sebagai state kedua adalah dua sumber kebenaran untuk satu hal.

- `modules/organiser/run.ts` — daftar tanda tangan (murni, tanpa React). Urutannya terpaksa:
  dokumen di-hash `create_event`, jadi harus online dulu; `add_category` butuh `event_id`.
- `hooks/useEventRun.ts` — yang menjalankan daftar itu. Berhenti di langkah yang gagal, yang sudah
  mendarat tetap tercatat, `start()` lagi = lanjut dari yang belum. **Loop-nya memegang salinan
  lokal `landed`**, karena `setState` baru berlaku render berikutnya dan loop-nya selesai dalam satu
  render.
- `component/StepReview.tsx` — lomba dalam bahasa manusia + toggle file mentah. Tombol **Create
  event** ada di kanan bawah seperti tiap step lain, dan membuka **Dialog** yang memuat **seluruh
  rangkaian**: daftar tanda tangan, centangnya, kegagalannya, dan jalan keluarnya. Mulainya tekanan
  kedua. Dialog-nya tidak bisa ditutup selama jalan, dan menutup sendiri begitu selesai.
- **Tidak ada "buat event tanpa dokumen".** Pernah ada, dan itu jebakan: yang dihasilkan bukan event
  darurat tapi event cacat permanen (halaman tanpa poster, lokasi, jadwal, selamanya — hash
  di-commit `create_event` dan tidak ada `update_event`), ditawarkan tepat saat orang lagi kesal.
  Jalan keluar kalau publish gagal cuma satu: **host file-nya sendiri**, yang tetap menghasilkan
  event utuh.
- `component/StepAddOns.tsx` — isi race pack, **dua daftar**: yang termasuk tiket, dan yang dijual
  di atasnya. Dua-duanya ditulis ke chain; bedanya cuma harga, karena add-on gratis itu sah
  (`price_usdc == 0`) supaya lomba bisa membagikan sesuatu **dan** tetap membatasi jumlahnya.
  Nama item pakai `elements/CreatableSelect.tsx`: saran boleh, tapi apa pun yang diketik bisa
  ditambahkan lewat baris "Add …" di dasar daftar.
- `addons.ts` — model add-on **murni**, di luar komponen. `run.ts` butuh `addOnUnits` untuk
  merencanakan tanda tangan, dan mengimpornya dari step ikut menyeret komponen client, file picker,
  dan wallet SDK ke modul yang cuma menghitung jersey. **Stok itu per ukuran**: kontrak memegang
  satu kuota per add-on, jadi `EVENT_JERSEY_M` adalah barisnya sendiri, dan itu satu-satunya cara
  "ukuran M habis" bisa benar. Kode `Symbol`-nya **diturunkan** dari nama + ukuran, tidak diketik,
  tapi tetap **ditampilkan** di baris item: tidak ada yang mengetiknya dan hasilnya permanen.
- `component/DocumentFallback.tsx` — cuma dirender setelah publish gagal.
- `component/FileField.tsx` (di `components/elements/`) — poster & waiver. Upload saat dipilih.
  `ACCEPTED` di situ mencerminkan `be/src/files/content-type.ts`; **SVG sengaja tidak ada dan
  jangan ditambahkan** (itu script di origin kita sendiri, bukan gambar).

Validasi form punya dua kelas yang tampil di waktu berbeda (`modules/organiser/missing.ts`):
`missingDetails` (field kosong) nunggu Continue, `incoherentDates` (dua tanggal yang bertabrakan)
muncul seketika. Field kosong belum tentu salah; tanggal yang bertentangan sudah pasti salah.

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
- **Hint di bawah field = cuma yang harus diketik.** Format yang diterima, batas ukuran, bentuk
  yang sah. Latar belakang dan "kenapa ini penting" pindah ke **Tooltip** lewat
  `components/elements/Help.tsx` (`help` prop di `Field`, `TextAreaField`, `FileField`,
  `DateTimeField`, `DateRangeField`, dan `Section` di `StepDetails`). Alasannya: waktu tiap field
  punya satu paragraf, membaca jadi keputusan, dan keputusan di bawah tiap field bikin orang
  berhenti membaca semuanya.
  **Yang TIDAK boleh masuk tooltip: peringatan yang ada ongkosnya** (nama tidak bisa diganti,
  kategori tidak bisa dihapus, dokumen tidak bisa ditukar). Itu wajib kelihatan tanpa hover —
  tempatnya di `note` section atau di hint.
- **Teks UI menyebut akibatnya, bukan mekanismenya.** Panitia lomba tidak perlu tahu kata "chain",
  "kontrak", "hash", "transaksi", atau "revert" — mereka perlu tahu apa konsekuensinya buat mereka.
  "Enforced on chain, entry number 301 reverts" jadi "Entries stop on their own once this many
  people have joined". Yang **tidak** boleh dilunakkan: peringatan yang ada ongkosnya (nama tidak
  bisa diganti, kategori tidak bisa dihapus, file detail tidak bisa ditambahkan belakangan) — itu
  tetap disebut apa adanya.
  Pengecualian yang disengaja: **halaman event publik** tetap menyebut hash dan chain, karena
  kalimat "dokumen ini cocok dengan hash di chain" itu justru klaim yang jadi alasan produk ini ada,
  dan pembacanya memang orang yang sedang mengecek.
- **Tiap jalan menuju bayar wajib melewati `NonRefundableNotice`** (STE-38, dari keputusan Axel di
  STE-34). `enter` mentransfer biaya langsung runner → organiser tanpa escrow, jadi kontrak tidak
  pernah memegang uangnya dan tidak ada refund yang bisa dipaksakan siapa pun. Teksnya berdiri
  tepat di atas tombol/link yang mengambil uang, bukan di footer dan bukan di modal yang bisa
  ditutup tanpa dibaca. Sekarang tempatnya `TabCategories`; **halaman `/events/[id]/enter` di
  STE-21 harus memasangnya lagi** di dekat tombol tanda tangan. Ditampilkan cuma kalau memang ada
  jalan masuk (`Open` dan masih ada slot) — peringatan yang muncul di tempat yang tidak berlaku
  adalah cara peringatan berhenti dibaca.
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
