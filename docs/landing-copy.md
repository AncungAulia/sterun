# Copy landing page — STE-12

Owner: **Nabil**. Status: **disetujui, siap dibangun.** Halaman dibangun per section,
mengikuti urutan di bawah.

Ini sumber kebenaran untuk **teks** landing. Kalau teks di kode berbeda dengan file ini,
salah satunya salah dan harus disamakan di commit yang sama.

---

## Keputusan yang mengunci copy ini

| Keputusan | Isinya | Siapa |
| --- | --- | --- |
| Bahasa | **English.** Pembacanya reviewer Instawards dan ekosistem Stellar global. Versi Indonesia untuk organiser lokal adalah percakapan lain, bukan halaman ini. | Nabil |
| Audiens utama | **Reviewer Instawards.** Panitia lomba tetap dilayani lewat section problem yang ditulis dari sudut pandang mereka, tapi kalau nada harus memilih, pilih yang teknis dan bisa diverifikasi. | Nabil |
| Aset yang disebut | **Jangan tulis "USDC"** sebagai sesuatu yang berjalan. Testnet memakai sUSD. Baris "why Stellar" menyebut "settlement", dan catatan kecil di bawahnya yang menjelaskan sUSD vs USDC. | Nabil |
| Routing | Dibangun di `landing-page/`. Apakah nanti jadi route `/` di `fe/` diputuskan bersama Ancung belakangan. Konsekuensinya: **jangan menambah dependency berat**, supaya pindahnya tetap murah. | Nabil + Ancung |

### Larangan

- **"participation record"** tidak pernah dipakai. Selalu **"race record"**.
- **Jangan membuka halaman dengan "scan QR di event".** Itu kalimat pembuka Stellar Passport
  (temuan MCP Stellar Raven, 2026-09-03; detailnya di [`docs/social/x-intro-post.md`](social/x-intro-post.md)).
  Scan QR tetap tampil, tapi sebagai langkah 2 di *How it works*, bukan sebagai positioning.
- **Jangan mengklaim mainnet.** Belum ada.

---

## Hero

> # RUNS YOU CAN'T FAKE
>
> Sterun turns every race entry into a verified race record on Stellar. It stays bound to the
> runner who signed up, and it stays readable after the organiser is gone.

Tombol: **Launch app** (utama) · **View the contracts on testnet** (sekunder)

Catatan implementasi:

- Tagline dipakai apa adanya dari brand, **tanpa tanda seru**. Di banner tanda seru pas karena
  dekat logo dan nadanya ramah; di hero 64px dia terbaca murah.
- `.heading-hero` (Big Shoulders 700), kapital semua. Font condensed jadi muat besar tanpa
  memakan lebar. Ini satu-satunya tempat di halaman yang boleh berteriak.
- Slogan cuma menutup separuh nilai produk (anti-palsu). Separuh lainnya, keawetan catatan,
  dibawa oleh subhead. Kalau subhead dipotong, setengah cerita Sterun hilang di layar pertama.
- Kalau header halaman memakai lockup logo, taglinenya muncul dua kali di satu layar. Pakai
  **mark** saja di header, bukan lockup.

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
> diverifikasi pembaca. Itu tidak konsisten dengan halaman yang di paragraf sebelumnya menyuruh
> orang mengecek sendiri.
>
> Sebelum halaman live: ambil biaya sebenarnya dari satu transaksi `enter` di testnet, catat ke
> `deployments.md`, lalu tulis angkanya di sini. `0.0000xx XLM per record` jauh lebih kuat
> daripada frasa yang terdengar seperti bahasa iklan.

---

## Proof

> ### The contracts are already running. Read them yourself.

| Apa | Nilai |
| --- | --- |
| EventRegistry | `CDL6A734…GTA64` → stellar.expert |
| RaceRecord | `CDWFNF42…XNB4` → stellar.expert |
| sUSD | `CBQ6444F…MOOU` → stellar.expert |
| Source | `github.com/AncungAulia/sterun` |
| Updates | `@sterunxyz` |

Section ini **tidak diminta tiket**, tapi ini yang paling berbicara ke reviewer Instawards.
Sebagian besar landing page proyek baru berjanji; halaman ini menyuruh orang memeriksa.

**Alamatnya diambil dari [`docs/deployments.md`](deployments.md), jangan diketik ulang.** Itu
satu-satunya sumber yang diperbarui kalau kontraknya di-deploy ulang, dan alamat basi di landing
adalah kesalahan yang mahal.

---

## Footer

Satu baris menyebut tim. Reviewer grant mendanai orang, bukan cuma kode, dan halaman tanpa nama
siapa pun terasa ada yang hilang.

Isi persisnya menunggu keputusan Axel (nama tim, asal, atau daftar empat orang).

---

## Yang masih terbuka

| Hal | Nunggu apa |
| --- | --- |
| Angka biaya per record | Diukur dari transaksi testnet, lalu dicatat ke `deployments.md` |
| Screenshot produk | STE-18 (desain QR pass + scanner), lalu app live di STE-32 |
| Diagram 4 langkah | Dikerjakan bersama section *How it works* |
| Isi baris footer | Keputusan Axel |
| Landing jadi route `/` di `fe/` | Diskusi dengan Ancung |
