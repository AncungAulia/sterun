# Information architecture — web app (`fe/`)

Peta halaman aplikasi web Sterun: URL apa saja yang ada, siapa yang membukanya, apa yang tampil di
situ, dan dari mana datanya. Dokumen ini turunan dari SOW Deliverable 3, `SYSTEM_DESIGN.md` §6a–6e
dan §7, serta enam tiket `fe/` (STE-8, 13, 17, 21, 22, 24).

**Status: rencana, belum ada implementasi.** Per 2026-09-06 `fe/` masih scaffold
`create-next-app` dengan satu halaman kosong. Owner: Ancung (flow) + Nabil (desain, STE-12/18/23).

Kalau implementasi menyimpang dari dokumen ini, perbarui dokumennya di commit yang sama — aturan
yang sama dengan `SYSTEM_DESIGN.md`.

---

## 1. Poros pembagian: asumsi jaringan, bukan audiens

App ini dibelah bukan berdasarkan siapa penggunanya, melainkan berdasarkan **boleh basi atau
tidak**, karena itu yang menentukan scope service worker:

- Directory dan profile **wajib segar dari chain**. Kalau di-cache, klaim "chain is authoritative"
  yang jadi jualan utama Sterun tidak lagi benar.
- QR pass dan scanner **wajib hidup penuh tanpa sinyal** (`SYSTEM_DESIGN.md` §7: verifikasi di
  venue mengasumsikan konektivitas nol).

Dua tuntutan itu berlawanan, jadi tidak boleh satu service worker menguasai seluruh origin.

```
fe/app/
  (browse)/                          network-only, service worker tidak menyentuh sini
    page.tsx                         /
    events/[eventId]/                /events/:id
    events/[eventId]/enter/          /events/:id/enter
    runner/[address]/                /runner/G...
    profile/                         /profile

  (organiser)/                       wallet-gated, online
    org/                             /org
    org/new/                         /org/new
    org/events/[eventId]/            /org/events/:id
    org/events/[eventId]/scanners/   /org/events/:id/scanners
    org/events/[eventId]/results/    /org/events/:id/results

  (offline)/                         PWA, service worker HANYA di-scope ke sini
    pass/[tokenId]/                  /pass/:token
    scan/                            /scan
    scan/[eventId]/                  /scan/:id
    scan/[eventId]/flagged/          /scan/:id/flagged
```

Scanner sengaja **tidak** dipisah jadi app/origin sendiri untuk MVP: ongkosnya (shell kedua, wiring
design token dua kali, deploy ketiga, STE-32 ditulis ulang) tidak sebanding untuk testnet dengan
20-an record, dan `CLAUDE.md` root melarang menambah folder layout tanpa alasan kuat.

**Aturan kapan keputusan itu dibalik:** scanner menyimpan `totp_secret` *seluruh peserta* satu
event di IndexedDB — payload paling sensitif di sistem ini. Satu origin berarti XSS di halaman
publik secara teori bisa membacanya. Begitu scanner memegang roster event nyata di mainnet,
pisahkan ke origin sendiri (`scan.sterun.xyz`). Karena logikanya sudah terkurung di route group
`(offline)` dan modulnya sendiri, itu pekerjaan memindah, bukan menulis ulang.

---

## 2. Tiga batasan data yang membentuk seluruh IA ini

Dilanggar sekali, salah satu klaim inti Sterun ikut batal. Ketiganya berulang kali menentukan isi
halaman di bawah, jadi dibaca duluan.

### 2.1 Tidak ada nama peserta, untuk siapa pun

On-chain cuma ada `participant_hash`. Di backend, `be/src/routes/participants.ts` mengembalikan
ringkasan tanpa PII dan menolak pemanggil yang bukan pemilik barisnya (`403`). **Panitia pun tidak
bisa melihat daftar nama pendaftarnya.** Satu-satunya tempat potongan nama muncul adalah roster
bundle, dan itu diautentikasi ke address scanner.

Konsekuensi: tidak ada avatar, tidak ada daftar nama, tidak ada export peserta. Yang boleh tampil
adalah angka (`entered_count` dari chain), bib, state, dan address.

### 2.2 Bukan CRUD — nyaris tidak ada update, dan tidak ada delete

| Objek | Create | Update | Delete |
| --- | --- | --- | --- |
| Event | `create_event` | **hanya status** (`set_event_status`) | tidak ada |
| Kategori | `add_category` | **tidak ada sama sekali** | tidak ada |
| Scanner | `add_scanner` | — | `remove_scanner` |

Nama event, tanggal, `metadata_hash`, `uri`, dan seluruh isi kategori (kode, jarak, kuota, harga)
**tidak punya setter**. Salah ketik harga = permanen; jalan keluarnya cuma `Closed` lalu bikin event
baru.

`Draft` **bukan** draft dalam arti Google Docs: dia cuma berarti pendaftaran belum dibuka, isinya
tetap beku sejak detik pertama. Karena itu form panitia tidak boleh berpola "isi → Save → edit
nanti", dan wajib punya langkah review sebelum tanda tangan.

Transisi status yang legal (`InvalidStatus(11)` selain ini, termasuk ke dirinya sendiri):

```
Draft  -> Open | Closed        Open      -> Closed | Completed
Closed -> Open | Completed     Completed -> (terminal)
```

### 2.3 `create_event` permissionless

Yang mengotorisasi cuma `organiser.require_auth()`. Tidak ada allowlist, dan admin EventRegistry
kewenangannya hanya `set_race_record`. **Siapa pun yang punya wallet bisa membuat event**, termasuk
event bodong.

Tidak ada halaman "daftar jadi organiser", tidak ada approval, tidak ada admin panel. Gerbang
seperti itu juga tidak akan menahan apa pun: `@sterunxyz/sdk` terbit publik di npm dan bisa memanggil
`createEvent()` langsung — justru itu yang dijanjikan SOW Deliverable 2.

Penggantinya adalah **transparansi**: tampilkan address organiser apa adanya, plus berapa event
yang pernah dia buat dan berapa yang `Completed`. Tidak menyaring siapa pun, tapi tidak ada yang
bisa bersembunyi.

---

## 3. Halaman publik — tanpa wallet

| URL | Menampilkan | Sumber data | Tiket |
| --- | --- | --- | --- |
| `/` | Kartu event: nama, tanggal, badge status, ringkasan kategori. Hanya `Open` yang punya CTA daftar. Loading + empty state (testnet lambat / belum ada event). | chain (RPC) — indexer sebagai fast path, kebenaran tetap dari chain | STE-13 |
| `/events/[id]` | lihat §3.1 | chain + dokumen metadata | STE-13 |
| `/runner/[address]` | Riwayat race per baris: event, kategori, bib, state, waktu finish, link transaksi. Blok identity check. Empty state. Paginasi 20. | chain (kebenaran), indexer (enrich metadata event) | STE-24 |

`/runner/[address]` adalah halaman yang di SOW disebut *"the part no ticketing platform
produces"*. Wajib bisa dibuka dari link telanjang: tanpa login, tanpa wallet, tanpa akun.

Blok identity check bekerja dengan consent runner: dia memasukkan nama + NIK + kontak darurat +
salt receipt, **hash dihitung lokal di browser** per `docs/specs/HASH_AND_TOTP.md`, lalu
`verify(token_id, hash)` dipanggil. PII tidak dikirim ke server mana pun, termasuk server kita.

### 3.1 `/events/[id]` — detail event

Layout: poster di kiri, kartu ringkas di kanan, tab di bawah.

**Kartu kanan** berisi tanggal, judul, lokasi, badge status, jumlah pendaftar (angka saja, tanpa
avatar — §2.1), dan **daftar kategori sebagai baris yang bisa dipilih**:

```
5K     sUSD 15   sisa 120 dari 300   [ Daftar ]
10K    sUSD 25   sisa   8 dari 200   [ Daftar ]
Half   sUSD 40   PENUH               [   —    ]
```

Kategori tidak boleh diringkas jadi satu baris teks dengan satu tombol Daftar: **pendaftaran selalu
per kategori**, dan tiap kategori punya harga, kuota, dan sisa kuota sendiri. Sisa kuota adalah
satu-satunya kelangkaan yang benar-benar dipaksa kontrak (`reserve_slot` revert `QuotaFull(5)`, cek
dan increment dalam satu invocation), jadi angka itu jujur dan layak ditonjolkan.

Halaman untuk event `Closed`/`Completed` tetap harus ada — ia jadi tujuan link dari profile runner.
Tombol Daftar diganti keterangan status.

Harga di chain adalah `i128` 7 desimal; halaman menampilkannya dalam bentuk manusiawi.

**Tab: belum dibangun di STE-13.** Halaman detail v1 adalah satu kolom, bukan tab. Alasannya
dua-duanya soal isi, bukan soal layout: **People** perlu halaman `/runner/G...` untuk dituju dan itu
STE-24, sedangkan **Timeline** perlu tanggal fase yang hidup di dokumen metadata — dan tidak ada satu
pun event di testnet yang benar-benar menyajikan dokumennya (semua `uri` menunjuk `sterun.xyz` yang
belum melayani file itu). Tiga tab dengan dua di antaranya kosong lebih buruk daripada satu halaman
yang menyebutkan apa yang dia tahu. Tab dipasang di STE-24, waktu People punya isi.

Rancangan tab-nya tetap berlaku dan ditulis di bawah ini supaya tidak dirancang ulang:


- **Overview** — deskripsi dari dokumen metadata. Tempat peta rute nanti (§6).
- **Timeline** — tiga fase, masing-masing membawa hitungan hidup dari chain karena fase-fase itu
  persis state machine kontrak:

  | Fase | State record |
  | --- | --- |
  | Pendaftaran | `Entered` |
  | Penyerahan race pack | `RacepackClaimed` |
  | Race day | `Finished` / `DNF` |

  ```
  ● Pendaftaran            1-20 Sep    312 terdaftar
  ● Penyerahan race pack   27 Sep      180 sudah ambil
  ○ Race day               28 Sep      belum mulai
  ```

  **Tanggalnya tidak mengikat apa pun.** Di chain hanya ada `starts_at`; tanggal buka/tutup
  pendaftaran dan penyerahan racepack hidup di dokumen metadata. Yang benar-benar mengunci
  pendaftaran adalah `EventStatus`, dan itu diganti manual oleh panitia. Karena itu perannya
  dipisah: **tanggal = informasi jadwal; penanda "sekarang di sini" = dari state chain**. Fase
  Pendaftaran ditandai aktif kalau `EventStatus == Open`, bukan kalau hari ini kebetulan ada di
  antara dua tanggal. Halaman tidak pernah mengklaim yang tidak dijamin kontrak.

- **People** — bib, kategori, state, dan address yang bisa diklik ke `/runner/G...`. Tanpa nama
  (§2.1). Tab ini menutup loop verifikasi: dari event, orang bisa loncat ke riwayat seorang pelari
  dan mengeceknya sendiri. Data dari `GET /events/:id/records`.

**Poster dan integritas metadata.** Backend tidak punya endpoint upload (`be/src/routes/`: auth,
directory, participants, results, roster), jadi panitia menempelkan URL gambar ke dokumen metadata,
bukan meng-upload file. Karena `EventData` menyimpan `metadata_hash` **dan** `uri`, halaman ini
mengunduh dokumennya, menghitung ulang hash-nya, dan bisa menunjukkan bahwa poster, lokasi, jadwal,
dan rute belum diubah sejak event dibuat.

### 3.2 Isi halaman profile

`/runner/[address]` dan `/profile` adalah halaman yang sama; yang membedakan cuma address-nya
datang dari URL atau dari wallet yang tersambung. Keduanya sengaja tidak disatukan penamaannya:
`/runner/G...` dikirim ke orang lain dan URL-nya sendiri sudah menjelaskan isinya, sedangkan
`/profile` terbaca sebagai milik sendiri.

**Identicon, bukan foto.** Runner tidak punya foto profil (tidak ada endpoint upload, dan menyimpan
foto orang berarti kelas PII baru — §2.1). Yang dipakai adalah **identicon deterministik yang
dihitung dari address**: pola unik per address, konsisten di semua halaman, dihitung di browser
sehingga tetap muncul offline, nol storage dan nol backend. Jangan memakai layanan avatar jarak
jauh (gravatar dan sejenisnya) — itu membocorkan siapa melihat profile siapa ke pihak ketiga, dan
mati begitu sinyal hilang.

**Statistik, semuanya turunan data yang sudah ada.** `GET /runners/:address/records` mengembalikan
`state`, `finish_time_s`, `category_id`, dan `event_id` per record; data kategori (`distance_m`)
memang sudah diambil untuk menampilkan nama event. Dari situ:

| Angka | Dihitung dari |
| --- | --- |
| jumlah race | banyaknya record |
| total jarak | jumlah `distance_m` kategori tiap record |
| jumlah selesai | record ber-state `Finished` |
| PB per jarak | `finish_time_s` terkecil per `distance_m` |

```
[identicon]  GABC…7XQ2

   4 race        42.2 km        3 selesai

   PB 5K  22:41        PB 10K  48:03
```

Yang membedakan ini dari aplikasi lari biasa: **tiap angka bisa diklik ke transaksinya.** "42.2 km"
bukan angka yang kita catat sendiri di database kita, melainkan jumlah dari empat record yang
masing-masing bisa dicek orang lain di explorer. Itu kalimat SOW — *"a race history that belongs to
the runner and that anyone can verify against the chain"* — dalam bentuk yang enak dilihat.

Thumbnail poster event di tiap baris riwayat juga gratis: poster sudah ada di dokumen metadata yang
tetap diunduh untuk halaman event.

**Urutan kerjanya:** tabel riwayat yang benar dan blok verify yang jalan dulu. Identicon, statistik,
dan thumbnail adalah lapisan di atasnya — bukan fondasinya, dan STE-24 adalah tiket paling akhir.

---

## 4. Halaman peserta — wallet tersambung

| URL | Menampilkan | Tiket |
| --- | --- | --- |
| `/events/[id]/enter` | Stepper: pilih kategori → form PII → review → **satu tanda tangan** (`enter`, fee sUSD tercakup di auth tree) | STE-21 |
| ↳ layar sukses | Bib, `token_id`, link transaksi testnet, dan **salt receipt** | STE-21 |
| `/pass/[tokenId]` | QR regenerate tiap 30 detik + kode 6 digit untuk fallback manual, bib, nama event, state. Installable. Jalan penuh di airplane mode. | STE-21 |
| `/profile` | Race saya + shortcut ke pass masing-masing. Tipis: isinya `/runner/[address-ku]` (§3.2) | STE-21 |

**Layar sukses halaman sendiri, bukan modal.** Salt receipt cuma muncul sekali seumur hidup; kalau
hilang, identity check di `/runner/[address]` mati selamanya untuk record itu. Layar ini tidak boleh
bisa terlewat tanpa sadar.

`totp_secret` disimpan di IndexedDB device runner dan tidak pernah menyentuh chain.

**Error yang wajib punya tampilan sendiri**, bukan alert mentah: `QuotaFull(5)`, `EventNotOpen(4)`,
saldo sUSD kurang, user menolak tanda tangan. Ditambah satu kasus licin: **PII sudah terkirim tapi
`enter` gagal** — user harus bisa mengulang tanpa membuat baris dobel (idempotency key per submisi,
disepakati dengan James).

Kode error adalah `u32` tanpa identitas kontrak; pilih peta error dari bandnya — `1..=99`
EventRegistry, `100..=199` RaceRecord, `200+` OZ.

---

## 5. Halaman panitia dan volunteer

### 5.1 Panitia (wallet organiser) — STE-17

| URL | Menampilkan |
| --- | --- |
| `/org` | Event yang aku buat (query by address), empty state, tombol buat event |
| `/org/new` | Wizard 3 langkah: **Details → Distances → Review** (review yang menandatangani semuanya) |
| `/org/events/[id]` | Kuota terisi per kategori (live dari chain), kontrol status, hitungan per state, roster **anonim**: bib, kategori, state, `token_id` |
| `/org/events/[id]/scanners` | Daftar scanner aktif, tambah/hapus address |
| `/org/events/[id]/results` | Upload CSV (bib_no, finish_time) → preview + anomali → submit batch `recordFinish`/`recordDnf` |

Tidak ada tombol Edit maupun Hapus di mana pun (§2.2), dan tidak ada nama peserta (§2.1).

**Tanda tangannya banyak dan tidak bisa dikurangi**: publish file detail satu, `create_event`
satu, tiap kategori satu, buka pendaftaran satu. Panitia dengan 3 kategori diminta approve 6 kali.
Satu transaksi cuma boleh memanggil satu fungsi kontrak, kontraknya tidak punya entry point batch,
dan `add_category` butuh `event_id` yang baru lahir setelah `create_event` mendarat.

Yang **bisa** diperbaiki cuma kagetnya, dan itu memutuskan bentuk wizard-nya (STE-17, 8 Sep 2026):

- **Langkahnya 3, bukan 6.** Yang dulu enam langkah itu memetakan transaksi satu-satu — publish,
  create, add, open — padahal transaksi adalah cara kita mengantar, bukan pekerjaan panitia.
  Pekerjaan panitia cuma dua: menggambarkan lomba, lalu menyetujui ongkosnya.
- **Step "Details file" diganti step Review.** Dulu isinya dump JSON mentah + tombol Publish. Itu
  meminta orang memeriksa hal yang tidak bisa mereka periksa, dan meminta mereka tahu ada "file" —
  itu pipa kita. Review menampilkan lombanya sebagai lomba: tanggal, kota, jarak beserta jam
  start-nya. **File mentahnya tetap ada satu klik di balik toggle**, karena sha256 byte itulah yang
  masuk chain dan orang yang mau mengecek klaim kita harus bisa melihatnya.
- **Daftar tanda tangan ditampilkan SEBELUM yang pertama diminta**, lalu dicentang satu per satu
  sambil jalan. Enam popup yang tidak disebut siapa pun terasa seperti retry loop; enam popup yang
  sudah ditulis sebagai daftar bernomor terasa seperti pekerjaan yang ada ujungnya.
- **Berhenti di tengah aman dan bisa dilanjutkan.** Yang sudah mendarat tidak bisa dibatalkan, jadi
  layar yang me-reset akan berbohong soal apa yang ada di chain. Tombolnya jadi "Carry on" dan
  melanjutkan dari langkah pertama yang belum mendarat.
- **Jalan keluar dokumen (host sendiri / tanpa dokumen) cuma muncul setelah publish gagal.** `uri`
  itu string biasa di chain dan kontrak tidak peduli host-nya siapa, jadi backend kita mati tidak
  boleh ikut mematikan pembuatan event. Tapi itu bukan pilihan yang pantas disodorkan ke orang yang
  tidak sedang punya masalah.

Kolom harga dan kuota perlu peringatan permanen karena tidak bisa diperbaiki.

**Poster dan waiver di-upload, bukan ditempel URL-nya** (`POST /events/files`, terima gambar dan
PDF, maks 5 MB). Dua alasan: menyuruh panitia meng-hosting sendiri adalah langkah yang paling
mungkin membuat wizard-nya tidak dipakai, dan file di tempat lain bisa **ditukar** setelah orang
mendaftar — persis penipuan yang produk ini ada untuk menutupnya. Yang dikembalikan store itu
content-addressed, jadi poster dan waiver ikut beku seperti dokumen yang menyebutnya. Upload jalan
**saat file dipilih**, bukan di akhir: endpoint-nya butuh tanda tangan, dan menumpuknya di akhir
berarti popup beruntun di saat yang paling tidak enak.

Console tidak boleh mengirim baris CSV yang gagal preview. Aksi oleh wallet non-organiser harus
memunculkan pesan yang bisa dibaca, bukan crash.

### 5.2 Volunteer (keypair scanner, berbeda dari organiser) — STE-22

| URL | Menampilkan |
| --- | --- |
| `/scan` | Pilih event, unduh roster bundle + snapshot state on-chain. Butuh online, sekali saja |
| `/scan/[id]` | Kamera + hasil **GREEN/RED di bawah 2 detik**, input manual (kode 6 digit + bib), banner kalau jam device melenceng, indikator antrian |
| `/scan/[id]/flagged` | Claim yang revert `AlreadyClaimed(102)` — meja lain menang. Untuk direkonsiliasi, bukan hilang diam-diam |

Organiser **bukan** otomatis scanner: `claim_racepack` menuntut address yang ada di allowlist
`is_scanner`. Panitia yang ingin ikut memindai mendaftarkan address-nya sendiri lewat console.

Verifikasi TOTP dilakukan lokal dengan toleransi ±1 step; claim di-antre di IndexedDB dan dikirim
saat online kembali.

---

## 6. Dokumen metadata event

Dibaca `/events/[id]` (STE-13), ditulis console (STE-17) — dua tiket yang sama-sama milik Ancung,
jadi kesepakatannya di satu tangan. Di-hash jadi `metadata_hash` saat `create_event`, di-host di
`uri`.

```json
{
  "poster_url": "https://...",
  "location": { "name": "GBK, Jakarta", "lat": -6.218, "lng": 106.802 },
  "route_geojson": { "type": "LineString", "coordinates": [] },
  "schedule": [
    { "phase": "registration", "starts_at": "2026-09-01T00:00+07:00", "ends_at": "2026-09-20T23:59+07:00" },
    { "phase": "racepack", "starts_at": "2026-09-27T09:00+07:00", "ends_at": "2026-09-27T17:00+07:00", "venue": "Hall A" },
    { "phase": "race_day", "gun_start": "2026-09-28T05:30+07:00", "cut_off": "2026-09-28T11:00+07:00" }
  ],
  "description": "...",
  "waiver_url": "https://..."
}
```

- **Fase `racepack` menyimpan rentang hari + jam harian**, bukan satu jendela waktu menerus.
  `starts_at` / `ends_at` tetap ada (hari pertama jam buka, hari terakhir jam tutup) supaya pembaca
  lama tidak berubah artinya, plus `daily_opens` / `daily_closes`.
  Alasannya: "buka 1 Agustus 09:00, tutup 9 Agustus 21:00" secara harfiah berarti mejanya dijaga
  semalaman tanggal 2 sampai 8. Pengambilan race pack itu manusia duduk di meja, dan mereka pulang.
  **Registrasi sengaja tetap satu jendela menerus** — form online memang tidak tutup semalam. Bentuk
  keduanya beda karena barangnya beda.
- **Start time dan cut off ada di tiap kategori**, bukan di event. Satu pagi bisa punya 5K start
  06:00 dan half marathon start 05:00; kontrak tidak punya kolom untuk itu, jadi tempatnya di
  dokumen (`categories[].start_time` / `.cut_off`). Yang masuk chain sebagai `starts_at` adalah
  **wave paling awal**, karena event cuma punya satu timestamp sedangkan lomba punya beberapa.
  Konsekuensi urutan di console: kategori harus diisi **sebelum** dokumen dibuat, karena dokumen
  di-hash oleh `create_event` yang jalan sebelum `add_category`.
- **`links`**: `{ instagram, website }`. Lomba beneran hidup di Instagram — pengumuman rute
  berubah, cuaca, hasil — jadi halaman event tanpa link ke situ kehilangan link keluar yang paling
  sering diklik. Yang disimpan **handle**-nya, bukan URL: Instagram pernah mengubah bentuk URL-nya,
  dan dokumen ini tidak bisa diedit selamanya. Console tetap menerima URL profil yang ditempel dan
  mengambil handle-nya sendiri.
  Efek samping yang berguna: link ini ikut ter-hash, jadi **akun yang dicantumkan waktu event dibuat
  tidak bisa diam-diam ditukar** jadi akun lain setelah orang mendaftar.
- **Koordinat masuk lewat link Google Maps yang ditempel, bukan lewat dropdown negara/provinsi/kota.**
  Console mengekstrak `lat`/`lng` dari URL-nya (`@-6.2185,106.8026` atau `?q=`) — tanpa API, tanpa
  key, tanpa rate limit. Cascade tiga dropdown tidak menjawab pertanyaan siapa pun (yang orang mau
  itu **pin yang bisa dibuka**), dan geocoding API (Nominatim gratis dan tanpa key) menambah
  dependency jaringan plus kewajiban atribusi ke sebuah field form. Link pendek
  (`maps.app.goo.gl`) tidak membawa koordinat sampai diikuti, dan mengikutinya dari browser
  diblokir cross-origin — console bilang begitu apa adanya waktu ditempel, bukan setelah event beku.
  Yang disimpan **dua angkanya**, bukan URL-nya: link bisa basi, koordinat tidak.
- Fase `racepack` boleh membawa `venue_lat` / `venue_lng` dengan aturan yang sama. `venue` tetap
  string supaya pembaca STE-13 tidak berubah artinya.
- **`cut_off` itu waktu**, batas terakhir sebuah finish masih dihitung — dan **kontrak tidak
  menegakkannya sama sekali**. `record_finish` menerima waktu apa pun yang panitia kirim. Halaman
  dan form wajib menyebutnya sebagai informasi, bukan aturan.
- **`metadata_hash` = sha256 dari byte persis yang disajikan di `uri`.** Tanpa kanonikalisasi,
  tanpa aturan urutan key, tanpa re-serialisasi. Siapa pun bisa mengeceknya dengan `curl` +
  `sha256sum`, dan tidak ada "bentuk kanonik" yang bisa dibaca beda oleh dua implementasi.
  Ongkosnya nyata dan disengaja: meng-upload ulang dokumen yang sama dengan whitespace berbeda
  merusak pengecekannya selamanya, karena event beku (§2.2). Ditetapkan di STE-13 (`fe/src/lib/
  metadata.ts`) dan dipakai STE-17 waktu menulis dokumennya.
- Dokumen yang gagal pengecekan hash **tidak ditampilkan sama sekali**, bukan ditampilkan dengan
  peringatan. Konten yang tidak bisa dibuktikan tetap tidak bisa dibuktikan walau diberi label.
- `gun_start` **harus sama** dengan `starts_at` di chain. Kalau berbeda, halaman menampilkan
  peringatan — salah satunya pasti salah.
- `route_geojson` sudah disediakan tempatnya walau petanya dikerjakan belakangan, supaya panitia
  tidak perlu membuat ulang event hanya untuk menambahkan rute.
- **Dokumen ini ikut beku** (§2.2): kalau race diundur, jadwalnya tidak bisa diperbaiki.

Peta rute (opsional, §8): render GeoJSON dengan **Leaflet + tile OpenStreetMap** — tanpa API key,
tanpa billing. Mapbox dan Google keduanya menuntut kartu kredit untuk sesuatu yang bisa gratis.
Karena rute ikut ter-hash, rute tidak bisa diam-diam diubah setelah orang mendaftar.

---

## 7. Urutan bangun

Semua tiket `fe/` sudah tidak terhalang: SDK (STE-15) dan backend (STE-16, STE-20) sudah Done.

```
STE-8   shell + wallet connect        <- fondasi, semua numpang di sini
  └─ STE-13  directory + detail       <- pintu masuk semua flow
       └─ STE-17  organiser console   <- bikin event buat diuji
            └─ STE-21  entry + pass   <- baru ada peserta
                 └─ STE-22  scanner   <- butuh scanner terdaftar dari STE-17
                      └─ STE-24  profile
```

Urutan ini bukan sekadar `blockedBy` Linear: tiap langkah **menghasilkan data untuk menguji langkah
berikutnya**. Tanpa console tidak ada event untuk didaftari; tanpa entry tidak ada QR untuk
dipindai.

Due date (per Linear): STE-13 17 Sep · STE-17 25 Sep · STE-21 dan STE-22 29 Sep · STE-24 1 Okt.

---

## 8. Sengaja tidak dibangun

| Yang tidak dibangun | Alasan |
| --- | --- |
| Halaman daftar jadi organiser, KYC/KYB (NPWP), admin panel penyeleksi | Tidak bisa ditegakkan: `create_event` permissionless dan SDK publik bisa melewatinya (§2.3). Menegakkannya butuh allowlist on-chain, sedangkan kontrak v1 non-upgradeable dan sudah live. KYC juga menabrak cerita "PII tetap off-chain" dan menuntut entitas hukum yang belum ada. Dicatat sebagai v2. |
| Subdomain `org.` dan `admin.` | `admin.` tidak punya fungsi. `org.` mahal dan menjebak: **wallet connection tidak ikut lintas origin**, jadi panitia yang juga ikut lari harus connect dua kali. SOW juga menaruh domain di out-of-scope ("dev/test deployment only"). `sterun.xyz` (landing) dan `app.sterun.xyz` (web app) sudah tercermin sebagai `landing-page/` dan `fe/` yang memang dua deploy terpisah. |
| Avatar peserta, daftar nama, export peserta | Datanya tidak pernah ada (§2.1) |
| Tombol edit / hapus event dan kategori | Fungsinya tidak ada di kontrak (§2.2) |
| Peta rute | Bisa dan murah (Leaflet + OSM, §6), tapi tidak ada di tiket mana pun dan tidak dinilai reviewer grant. Kerjakan setelah STE-24, atau serahkan ke Nabil sebagai polish. Kalau sempat, ia jadi bintang di video demo 3 menit. |
| Username / display name runner | Bukan cuma soal ongkos (tabel baru, endpoint baru, bukti kepemilikan address, duplikat dan squatting tanpa admin yang bisa menengahi). Alasan utamanya: username adalah **klaim identitas yang tidak diverifikasi siapa pun, ditempel di halaman yang seluruh gunanya adalah membuktikan sesuatu** — tidak ada yang menghalangi orang menamai dirinya "Eliud Kipchoge". Begitu satu baris di halaman itu tidak bisa dibuktikan, keraguan menular ke baris lain yang sebenarnya benar. Identitas terverifikasinya sudah ada di blok identity check: anonim secara default, bisa dibuktikan atas izin runner. |
| Foto profil | Tidak ada endpoint upload, dan menyimpan foto orang berarti kelas PII baru. Diganti identicon deterministik (§3.2) |
| Profile handle / klaim profil | v2; routing memakai address mentah `/runner/G...` |
