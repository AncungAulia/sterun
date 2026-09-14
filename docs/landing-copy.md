# Copy landing page — STE-12

Owner: **Nabil**. Halaman dibangun per section, mengikuti urutan di bawah.

Ini sumber kebenaran untuk **teks** landing. Kalau teks di kode berbeda dengan file ini,
salah satunya salah dan harus disamakan di commit yang sama.

---

## Urutan section

| # | Section | Anchor | Wajib tiket? | Copy | Dibangun |
| --- | --- | --- | --- | --- | --- |
| 1 | [Hero](#hero) | `#top` | ✅ | final | ✅ |
| 2 | [Problem](#problem) | `#problem` | ✅ | **draft** | ✅ |
| 3 | [How it works](#how-it-works) | `#how-it-works` | ✅ | final | — |
| 4 | [Product preview](#product-preview) | `#product` | — | **draft** | — |
| 5 | [Why Stellar](#why-stellar) | `#why-stellar` | ✅ | final, 1 angka kurang | — |
| 6 | [Closing CTA](#closing-cta) | — | — | **draft** | — |
| 7 | [Footer](#footer) | — | — | nunggu Axel | — |

Setelah STE-12 ditutup: [For developers](#backlog-setelah-ste-12) dan [FAQ](#backlog-setelah-ste-12).

### Kenapa urutannya begini

- **Proof strip tidak lagi jadi section sendiri; isinya tinggal di kolom kiri Problem.** Empat
  baris klaim, lalu tautan ke tiga kontrak dan source, tepat di bawah hero seperti yang dituju
  strip bukti dari awal. Menu `04 PROOF` menunjuk ke blok tautan itu (`#proof`).
- **Product preview ditaruh setelah How it works.** Empat langkah itu teks; section berikutnya
  langsung memperlihatkan hasilnya di aplikasi yang sungguhan jalan. Ini menjawab kritik terberat
  saat draf dibaca sebagai juri: *"halaman ini seluruhnya kata, aku tidak melihat produknya."*
- **Why Stellar setelah produk terlihat.** Klaim soal non-transferable dan settlement lebih mudah
  dipercaya setelah pembaca melihat benda yang diklaim.
- **Closing CTA sebelum footer**, supaya pembaca yang scroll sampai habis tidak cuma menemukan
  baris hak cipta.

---

## Keputusan yang mengunci copy ini

| Keputusan | Isinya | Siapa |
| --- | --- | --- |
| Bahasa | **English.** Pembacanya reviewer Instawards dan ekosistem Stellar global. Versi Indonesia untuk organiser lokal adalah percakapan lain, bukan halaman ini. | Nabil |
| Audiens utama | **Reviewer Instawards.** Panitia lomba tetap dilayani lewat section problem yang ditulis dari sudut pandang mereka, tapi kalau nada harus memilih, pilih yang teknis dan bisa diverifikasi. | Nabil |
| Aset yang disebut | **Jangan tulis "USDC"** sebagai sesuatu yang berjalan. Testnet memakai sUSD. Baris "why Stellar" menyebut "settlement", dan catatan kecil di bawahnya yang menjelaskan sUSD vs USDC. | Nabil |
| Routing | Dibangun di `landing-page/`. Apakah nanti jadi route `/` di `fe/` diputuskan bersama Ancung belakangan. Konsekuensinya: **jangan menambah dependency berat**, supaya pindahnya tetap murah. | Nabil + Ancung |
| Katalog event | **Tidak disalin ke landing.** Directory tetap di `fe/`; landing menautkannya. Katalog live di landing akan memamerkan satu event demo di ruang kosong dan menyeret SDK + RPC client ke halaman yang harus ringan. | Nabil |

### Larangan

- **"participation record"** tidak pernah dipakai. Selalu **"race record"**.
- **Jangan membuka halaman dengan "scan QR di event".** Itu kalimat pembuka Stellar Passport
  (temuan MCP Stellar Raven, 2026-09-03; detailnya di [`docs/social/x-intro-post.md`](social/x-intro-post.md)).
  Scan QR tetap tampil, tapi sebagai langkah 2 di *How it works*, bukan sebagai positioning.
- **Jangan mengklaim mainnet.** Belum ada.
- **Jangan menjanjikan lebih dari yang protokolnya lakukan.** "Forever" tidak dipakai: entri
  persisten Soroban punya TTL dan dijaga keeper, bukan abadi. Panitia juga tidak "tidak
  diperlukan": hasil finish justru ditandatangani kunci panitia.
- **Tidak ada testimoni, logo partner, atau angka pengguna** sampai benar-benar ada. STE-22 belum
  menghasilkan komitmen partner, dan reviewer grant memeriksa klaim seperti ini.
- **Tidak ada em dash** di copy, dan hindari pola kalimat yang terdengar ditulis AI (deretan tiga
  hal yang rapi, "bukan sekadar X tapi Y").

---

## Hero

> # RUNS YOU CAN'T FAKE
>
> Sterun turns every race entry into a verified race record on Stellar. It stays bound to the
> runner who signed up, and it stays readable after the organiser is gone.

Tombol: **Launch app** saja, di header (label **App** di bawah 640px).

Baris `Live on Stellar testnet. No wallet needed to look.` dan tautan kontrak semula ada di hero.
Tautan kontrak sekarang di kolom kiri [Problem](#problem), dan "no wallet needed" di
[Product preview](#product-preview), tempat pembaca benar-benar bisa membuktikannya. Tugas hero
adalah menyebut ini apa; layar pertama cuma punya satu hal untuk ditekan.

Catatan implementasi:

- Tagline dipakai apa adanya dari brand, **tanpa tanda seru**. Di banner tanda seru pas karena
  dekat logo dan nadanya ramah; di hero 64px dia terbaca murah.
- `.heading-hero` (Big Shoulders 700), kapital semua. Font condensed jadi muat besar tanpa
  memakan lebar. Satu-satunya suara yang boleh berteriak, sekali per layar.
- Slogan cuma menutup separuh nilai produk (anti-palsu). Separuh lainnya, keawetan catatan,
  dibawa oleh subhead. Kalau subhead dipotong, setengah cerita Sterun hilang di layar pertama.

---

## Problem

> [!NOTE]
> **Draft, perlu persetujuan Nabil.** Bentuk section berubah (referensi nbnzia.com): dua blok
> berjudul diganti kolom kiri berisi klaim + tautan bukti, dan dua paragraf besar di kanan.
> Kalimatnya dari copy Problem yang sudah disetujui; Nabil mengizinkan copy lebih panjang.

### Kolom kiri: klaim dan bukti

Klaim (ditulis kapital oleh CSS, di sumbernya kalimat biasa):

> VERIFIED ON STELLAR.
> BOUND TO THE RUNNER.
> OUTLIVES THE ORGANISER.
> CHECKED BY ANYONE.

Di bawahnya, dengan jarak supaya enak dibaca (anchor `#proof`, tujuan menu `04 PROOF`):

> The contracts are already running. Read them yourself.
>
> EventRegistry ↗
> RaceRecord ↗
> sUSD ↗
> Source ↗

| Tautan | Tujuan |
| --- | --- |
| EventRegistry | `CDL6A734…GTA64` di stellar.expert (testnet) |
| RaceRecord | `CDWFNF42…XNB4` di stellar.expert (testnet) |
| sUSD | `CBQ6444F…MOOU` di stellar.expert (testnet) |
| Source | `github.com/AncungAulia/sterun` |

**Alamatnya diambil dari [`docs/deployments.md`](deployments.md) lewat `landing-page/lib/links.ts`,
jangan diketik ulang.** Itu satu-satunya sumber yang diperbarui kalau kontraknya di-deploy ulang,
dan alamat basi di landing adalah kesalahan yang mahal.

### Kolom kanan: copy

Satu paragraf per masalah yang disetujui: roster yang tidak cocok dengan pelari, dan hasil yang
tidak bertahan lebih lama dari panitianya.

> Bibs get resold in group chats, and the organiser has one name on the roster while someone else
> runs the course. Nobody finds out until it matters. When someone goes down at kilometre 8, the
> medical team opens the wrong file.

> A finish time is a row in one organiser's database. When the company folds, the row goes with it.
> Runners keep screenshots, and nobody can verify a screenshot. Sterun makes the record outlive the
> race.

### Bedanya dengan draf di brief

| Brief | Dipakai | Kenapa |
| --- | --- | --- |
| READABLE FOREVER. | OUTLIVES THE ORGANISER. | "Forever" berlebihan: data persisten Soroban punya TTL dan dijaga keeper. Versi ini cocok dengan subhead hero yang sudah disetujui. |
| NO ORGANISER REQUIRED. | CHECKED BY ANYONE. | Salah secara faktual: panitia membuat event dan menandatangani hasil finish. Yang benar tanpa panitia adalah *memeriksanya*, sesuai langkah 4 How it works. |
| P1/P2 draf brief | dua paragraf dari copy Problem yang sudah disetujui | Brief minta draf diganti kalau copy sendiri sudah ada. Draf brief juga memakai dua deretan tiga hal ("a spreadsheet, a PDF, or…", "they get edited, they get lost, and…"), pola yang dilarang di atas. Kalimat penutup brief *"Sterun makes the record outlive the race"* dipertahankan. |

Dari copy Problem lama, cuma *"Which is the whole reason the record can't live in the organiser's
database"* yang tidak dipakai; perannya (menjawab "kenapa harus blockchain") dibawa *"Sterun makes
the record outlive the race."* Kalimat *kilometre 8* kembali setelah copy boleh lebih panjang.

### Ukuran dan jarak

- Copy `clamp(1.125rem, 2.26vw, 1.75rem)`. Sempat dicoba dua kali lebih besar, lalu dikembalikan:
  copy jadi hampir dua layar tingginya dan reveal butuh sekitar 1800px scroll.
- Jarak antar paragraf 2.9em (dua baris). Jarak copy ke baris blok **sama persis**, karena baris
  blok membawa ukuran font copy: terukur 162px = 162px di 1440, 104px = 104px di 375. Copy boleh
  memanjang tanpa merusak posisi blok.

### Motion

| Elemen | Gerakan | Pemicu |
| --- | --- | --- |
| Kolom kiri | fade + naik 12px, stagger 60ms | sekali saat masuk viewport |
| Copy | reveal per karakter (SplitText): pudar (ink 10%) → biru `teal-400` + ditebalkan → ink | di-scrub ke scroll: mulai saat puncak copy di 80% layar, selesai saat dasar copy di 60%, ikut mundur saat scroll balik |
| Blok ink + blok teal | mask slide-up 0.7s, ink duluan, teal +150ms | masuk viewport; turun lagi saat scroll kembali ke atas; naik lagi di lintasan berikutnya |

**Warna highlight `teal-400`**, bukan `teal-300`. Kontras terukur:

| Token | di atas `paper` | terhadap `ink` |
| --- | --- | --- |
| `teal-300` (lama) | 2.31:1 | 6.45:1 |
| **`teal-400`** | **3.66:1** | **4.06:1** |
| `teal` | 5.88:1 | 2.53:1 |

`teal-300` terlalu pucat di atas kertas, jadi pitanya nyaris tidak terlihat. `teal` lebih kuat di
kertas tapi terlalu dekat dengan ink, jadi perubahan dari biru ke hitam hampir tidak terasa.
`teal-400` jelas terhadap keduanya.

**Bold saat highlight memakai text-stroke, bukan font-weight.** Poppins dimuat di bobot tetap, dan
huruf yang lebih tebal juga lebih lebar: setiap karakter setelahnya akan bergeser dan baris bisa
pindah selama scroll. Stroke seukuran 0.035em (sekitar 2px di 56px) menebalkan huruf tanpa
mengubah lebarnya. Terukur: 0 dari 352 karakter bergeser posisinya antara saat ditebalkan dan
normal.

Pita yang sedang transisi sekitar 40 karakter, sekitar 20 di antaranya terbaca biru; urutan
mengikuti urutan baca; batas warna jatuh di tengah kata; ujung depan pita berada kira-kira di
tengah layar. Lebar pita diatur satu konstanta, `BAND` di `landing-page/modules/problem/Problem.tsx`.

`prefers-reduced-motion`: teks tidak dipecah, langsung ink penuh, blok diam di tempat.

---

## How it works

> ### 1. Enter
> A runner picks an event and a category, fills in their details, and pays the entry fee. One
> wallet signature covers the entry and the payment together. Personal data goes to Sterun's
> backend, encrypted. Only a salted hash of it reaches the chain.

> ### 2. Claim the racepack
> On race day a volunteer scans the runner's pass. The code behind it changes every 30 seconds,
> so a screenshot is worthless by the time it is shown. The contract flips the record to claimed,
> which is what makes collecting twice impossible rather than merely discouraged.

> ### 3. Finish
> The organiser records the result against the record. It is signed by the organiser's key, so
> the time on the record is the time the organiser actually submitted.

> ### 4. Verify
> Anyone opens the runner's public profile and reads the history: event, category, bib, state,
> finish time, and the transaction behind each one. No wallet needed to look.

Empat blok teks tidak cukup untuk section ini. Butuh diagram atau ilustrasi empat langkah;
mockup QR pass dan scanner dari **STE-18** dipasang di sini begitu jadi.

---

## Product preview

> [!NOTE]
> **Draft.** Struktur section sudah disetujui; kata-katanya belum.

> ### Open it. No wallet needed.
>
> The event directory and every event page read straight from the chain. Browse them the way a
> runner would, before you connect anything.
>
> **Browse live events →**

Caption di bawah screenshot halaman detail event:

> Sterun Demo Run 2026, read from EventRegistry on testnet. Its metadata document matches the hash
> stored on chain, which is what "Document verified" means.

Visual:

- Screenshot **directory** (`fe/` route `/`) dan **detail event** (`/events/4`). Keduanya sudah
  hidup dan membaca data chain nyata (STE-13).
- Screenshot QR pass dan scanner menyusul setelah **STE-18**.

Klaim yang dipakai dan sandarannya:

| Klaim | Sandaran |
| --- | --- |
| Bisa dibuka tanpa wallet | `fe/src/modules/directory/Directory.tsx` tidak menyentuh wallet kit sama sekali |
| Membaca langsung dari chain | root `CLAUDE.md`: `/` dan `/events/[id]` membaca EventRegistry lewat RPC, tanpa database |
| "Document verified" | Event `event_id` 4 dibuat di STE-13; dokumen metadata-nya lolos pengecekan `metadata_hash` |

Tombol **Browse live events** memakai `NEXT_PUBLIC_APP_URL` yang sama dengan Launch app, jadi ikut
hidup begitu STE-32 memberi URL.

---

## Why Stellar

Satu baris, sesuai requirement tiket:

> Non-transferable records mean a bib can't be resold, organiser-signed finish results mean a
> time can't be forged, and settlement reaches the organiser directly at a per-record fee
> measured in fractions of a cent.

Catatan kecil di bawahnya:

> *Live on Stellar testnet, settling in sUSD. Mainnet settles in USDC.*

> [!WARNING]
> **"fractions of a cent" belum punya sandaran.** Tidak ada biaya transaksi yang tercatat di
> [`docs/deployments.md`](deployments.md), jadi ini satu-satunya angka di halaman yang tidak bisa
> diverifikasi pembaca. Itu tidak konsisten dengan halaman yang di section sebelumnya menyuruh
> orang mengecek sendiri.
>
> Sebelum halaman live: ambil biaya sebenarnya dari satu transaksi `enter` di testnet, catat ke
> `deployments.md`, lalu tulis angkanya di sini. `0.0000xx XLM per record` jauh lebih kuat
> daripada frasa yang terdengar seperti bahasa iklan.

---

## Closing CTA

> [!NOTE]
> **Draft.** Struktur section sudah disetujui; kata-katanya belum.

> ## Put your next race on the record
>
> Create the event once. Every runner who enters leaves with a record they keep.
>
> **Launch app →** · Follow @sterunxyz ↗

`.heading-hero` boleh dipakai lagi di sini: ini layar yang berbeda dari hero, dan aturan "sekali
per layar" tetap terpenuhi.

---

## Footer

Satu baris menyebut tim. Reviewer grant mendanai orang, bukan cuma kode, dan halaman tanpa nama
siapa pun terasa ada yang hilang.

Isi persisnya menunggu keputusan Axel (nama tim, asal, atau daftar empat orang).

---

## Backlog setelah STE-12

Dikerjakan setelah tiket ditutup (deadline STE-12: 18 September 2026). Posisinya di antara
Why Stellar dan Closing CTA.

| Section | Isi | Kenapa ditunda |
| --- | --- | --- |
| **For developers** | Cuplikan kode `@sterun/sdk` sekitar lima baris: organiser bisa integrasi tanpa menulis Rust. Ini deliverable D2 grant. | `npm publish` masih menunggu kredensial npm James. Menampilkan `npm install` untuk paket yang belum ada di registry adalah perintah yang gagal saat dicoba. |
| **FAQ** | *Do runners need crypto? Where does personal data go? Why testnet?* Poin data pribadi tidak masuk chain itu kuat. | Bukan syarat tiket; nilainya ada, tapi bisa menyusul tanpa merusak halaman. |

---

## Yang masih terbuka

| Hal | Nunggu apa |
| --- | --- |
| Copy Problem, Product preview, dan Closing CTA | Persetujuan Nabil |
| Angka biaya per record | Diukur dari transaksi testnet, lalu dicatat ke `deployments.md` |
| Screenshot directory dan detail event | Diambil dari `fe/` yang jalan |
| Screenshot QR pass dan scanner | STE-18 |
| Diagram 4 langkah | Dikerjakan bersama section *How it works* |
| Menu nav 04 | `PROOF` → `#proof`, blok tautan kontrak di kolom kiri Problem. Pertimbangkan tambah atau ganti ke `PRODUCT` begitu section itu dibangun |
| Isi baris footer | Keputusan Axel |
| URL app untuk Launch app dan Browse live events | STE-32 |
| Landing jadi route `/` di `fe/` | Diskusi dengan Ancung |
