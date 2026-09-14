# Copy landing page — STE-12

Owner: **Nabil**. Halaman dibangun per section, mengikuti urutan di bawah.

Ini sumber kebenaran untuk **teks** landing. Kalau teks di kode berbeda dengan file ini,
salah satunya salah dan harus disamakan di commit yang sama.

---

## Urutan section

| # | Section | Anchor | Wajib tiket? | Copy | Dibangun |
| --- | --- | --- | --- | --- | --- |
| 1 | [Hero](#hero) | `#top` | ✅ | final | ✅ |
| 2 | [Proof strip](#proof-strip) | `#proof` | — | final | — |
| 3 | [Problem](#problem) | `#problem` | ✅ | final | — |
| 4 | [How it works](#how-it-works) | `#how-it-works` | ✅ | final | — |
| 5 | [Product preview](#product-preview) | `#product` | — | **draft** | — |
| 6 | [Why Stellar](#why-stellar) | `#why-stellar` | ✅ | final, 1 angka kurang | — |
| 7 | [Closing CTA](#closing-cta) | — | — | **draft** | — |
| 8 | [Footer](#footer) | — | — | nunggu Axel | — |

Setelah STE-12 ditutup: [For developers](#backlog-setelah-ste-12) dan [FAQ](#backlog-setelah-ste-12).

### Kenapa urutannya begini

- **Proof naik jadi strip tipis tepat di bawah hero.** Studi 100+ landing page developer tool
  (Evil Martians) menemukan blok kredibilitas paling sering bekerja langsung setelah hero, bukan
  di footer. Aset terkuat halaman ini adalah kontrak yang benar-benar hidup; menaruhnya di bawah
  empat section berarti bertaruh reviewer akan scroll sampai habis.
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
Keduanya dipindah: tautan kontrak ke [Proof strip](#proof-strip), dan "no wallet needed" ke
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

## Proof strip

Satu baris tipis tepat di bawah hero. Bukan tabel besar.

> The contracts are already running. Read them yourself.
>
> EventRegistry ↗ · RaceRecord ↗ · sUSD ↗ · Source ↗

| Tautan | Tujuan |
| --- | --- |
| EventRegistry | `CDL6A734…GTA64` di stellar.expert (testnet) |
| RaceRecord | `CDWFNF42…XNB4` di stellar.expert (testnet) |
| sUSD | `CBQ6444F…MOOU` di stellar.expert (testnet) |
| Source | `github.com/AncungAulia/sterun` |

**Alamatnya diambil dari [`docs/deployments.md`](deployments.md) lewat `landing-page/lib/links.ts`,
jangan diketik ulang.** Itu satu-satunya sumber yang diperbarui kalau kontraknya di-deploy ulang,
dan alamat basi di landing adalah kesalahan yang mahal.

Akun X (`@sterunxyz`) tidak ada di strip ini: sudah ada di menu, dan strip ini khusus hal yang bisa
diperiksa, bukan diikuti.

---

## Problem

> ### The roster doesn't match the road
>
> Bibs get resold in group chats. The organiser has one name on the roster while a different
> person is on the course, and nobody finds out until it matters. When someone goes down at
> kilometre 8, the medical team opens the wrong file.

> ### Your results live on someone else's server
>
> A finish time is a row in one organiser's database. When the company folds or the site stops
> being paid for, the row goes with it. Runners keep screenshots. Nobody can verify a screenshot.
> Which is the whole reason the record can't live in the organiser's database.

Kalimat terakhir itu ditambahkan setelah review: tanpanya, halaman ini tidak pernah menjawab
"kenapa harus blockchain" secara tegas. Jawabannya sebelumnya tercecer di dua section dan tidak
pernah disambungkan.

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
> diverifikasi pembaca. Itu tidak konsisten dengan halaman yang di strip atas menyuruh orang
> mengecek sendiri.
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
| Copy Product preview dan Closing CTA | Persetujuan Nabil |
| Angka biaya per record | Diukur dari transaksi testnet, lalu dicatat ke `deployments.md` |
| Screenshot directory dan detail event | Diambil dari `fe/` yang jalan |
| Screenshot QR pass dan scanner | STE-18 |
| Diagram 4 langkah | Dikerjakan bersama section *How it works* |
| Menu nav 04 | Sekarang `PROOF`, yang kini menunjuk ke strip tipis di atas. Pertimbangkan ganti ke `PRODUCT` begitu section itu dibangun |
| Isi baris footer | Keputusan Axel |
| URL app untuk Launch app dan Browse live events | STE-32 |
| Landing jadi route `/` di `fe/` | Diskusi dengan Ancung |
