# CHANGELOG — spesifikasi beku Sterun (`docs/specs/`)

Riwayat versi untuk **semua** yang ada di folder ini: `INTERFACE.md` (interface kontrak, layout
event, kode error) dan `HASH_AND_TOTP.md` (`participant_hash`, TOTP, payload QR), berikut
`vectors/` dan `reference/` yang menyertainya.

Versi mengikuti **semver**, dibaca dari sudut pandang konsumen (SDK D2 + app D3):

| Bagian | Contoh perubahan | Dampak versi |
| --- | --- | --- |
| MAJOR | ubah definisi hash/TOTP, ubah/hapus signature fungsi, renumber kode error, ubah layout event | data & client lama rusak |
| MINOR | tambah fungsi baru, tambah event baru, tambah varian error baru (nomor bebas berikutnya di band-nya) | client lama tetap jalan |
| PATCH | perbaikan dokumen/penjelasan yang **tidak** mengubah satu byte pun perilaku | tidak ada |

---

## Aturan perubahan (WAJIB, berlaku sejak v1.0.0 merged)

Setiap perubahan pada **signature fungsi**, **layout `#[contractevent]`**, **kode error**, atau
**definisi hash/TOTP** harus:

1. **PR baru** yang di-approve **@Axel (PM) + @fable (AI co-PM)**. **Tidak ada self-merge ke
   `main`.**
2. **Entri di file ini**: versi baru, tanggal, apa yang berubah, alasannya, dan dampaknya ke data
   yang sudah ada / client yang sudah jalan.
3. **Regenerate TS bindings (STE-14)** dan naikkan versinya, karena setiap konsumen D2/D3
   memegang salinan hasil generate.
4. **`bash docs/specs/verify.sh` hijau** (kedua implementasi referensi sepakat) dan
   **`cd sc && cargo test` hijau** (termasuk test host-sha256 di
   `sc/contracts/race_record/src/test.rs`).
5. Kalau ada **vector lama yang nilainya berubah**, sebutkan **eksplisit** di entri changelog.
   Vector adalah artefak beku — jangan pernah di-regenerate diam-diam supaya test lewat.

**Kode error adalah ABI publik dan tidak pernah di-renumber.** Sebuah `ScError` Soroban cuma
membawa `u32` tanpa identitas kontrak, jadi angkanya sendiri yang menjadi kontrak. Varian baru
mengambil nomor bebas berikutnya di dalam band kontraknya (`1..=99` C1, `100..=199` C2, `200+`
OZ); nomor varian yang dihapus **tidak boleh** dipakai ulang.

**Perubahan definisi hash membatalkan setiap `participant_hash` yang sudah ada on-chain** —
record lama tidak bisa diverifikasi ulang dengan aturan baru. Jadi itu minimal MAJOR, plus rencana
migrasi tertulis, bukan patch.

---

## [1.0.0] — 2026-08-31

**Pembekuan awal.** STE-10 (komponen C4). Ini yang meng-unblock **James** (backend) dan
**Ancung** (frontend/PWA) supaya bisa jalan paralel tanpa menunggu kerjaan kontrak.

### Ditambahkan

- **`INTERFACE.md`** — interface publik EventRegistry (C1, STE-5) dan RaceRecord (C2, STE-9),
  diturunkan secara mekanis dari `stellar contract info interface --wasm ...`, bukan disalin
  tangan. Berisi signature fungsi lengkap + siapa yang harus authorize + error yang mungkin
  muncul, layout `#[contractevent]` (mana topic, mana data, urutannya), kedua enum error dengan
  angkanya, konvensi band error beserta alasannya, catatan non-transferable (fungsi transfer/
  approve/burn memang **tidak ada**), dan alamat SAC sUSD.
  Wasm yang menjadi rujukan:
  - `event_registry.wasm` — `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474`
  - `race_record.wasm` — `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f`
- **`HASH_AND_TOTP.md`** — definisi byte-exact `participant_hash` (normalisasi NFC, aturan
  whitespace, tiga separator `0x00`, salt 32 byte mentah), TOTP (HMAC-SHA-256, step 30 detik,
  6 digit, toleransi ±1 step, perbandingan constant-time), dan serialisasi payload QR. Lengkap
  dengan walkthrough byte-level yang bisa dicek ulang pakai `printf` + `shasum`.
- **`vectors/participant_hash.json`** — 5 vector + 4 kasus tolak. Termasuk pasangan NFC
  precomposed/decomposed yang **wajib menghasilkan hash yang sama**, dan pasangan yang hanya beda
  salt yang **wajib berbeda**.
- **`vectors/totp.json`** — 4 vector kode (salah satunya berawalan nol: `079663`) + 8 kasus
  verifikasi yang mengunci jendela ±1 step, penolakan kode 2 step, dan penolakan kode 5 karakter.
- **`reference/node/verify-vectors.mjs`** — implementasi referensi Node, `node:crypto` saja,
  **nol dependency npm** (tidak ada yang ditambahkan ke pnpm workspace).
- **`reference/rust/`** — implementasi referensi Rust, crate berdiri sendiri dengan `[workspace]`
  sendiri (**bukan** member `sc/`), dependency dipin `=`.
- **`verify.sh`** — menjalankan keduanya dan gagal keras kalau salah satu tidak setuju.
- Dua test di `sc/contracts/race_record/src/test.rs`
  (`host_sha256_matches_every_participant_hash_vector`,
  `every_participant_hash_vector_is_accepted_by_enter_and_verify`) yang membaca file vector yang
  **sama** dan menjalankannya lewat `env.crypto().sha256()` + `enter` + `verify`. race_record:
  39 → 41 test; event_registry tetap 33.

### Keputusan yang dibekukan di sini

| Keputusan | Nilai |
| --- | --- |
| Fungsi hash | SHA-256 |
| Preimage | `utf8(norm_name) \|\| 0x00 \|\| utf8(norm_id) \|\| 0x00 \|\| utf8(norm_contact) \|\| 0x00 \|\| salt` |
| Salt | 32 byte CSPRNG, satu per record, dirender hex huruf kecil |
| Normalisasi | NFC → trim → collapse whitespace → tolak kosong/`U+0000`; id: buang `-`+whitespace lalu ASCII-uppercase; kontak: buang `-`, `(`, `)`, whitespace |
| Definisi whitespace | daftar eksplisit 25 code point Unicode `White_Space=Yes` |
| TOTP | HMAC-SHA-256, secret 32 byte, step 30 detik, dynamic truncation RFC 4226 §5.3, 6 digit |
| Toleransi TOTP | ±1 step (jendela hingga 90 detik), perbandingan constant-time |
| Payload QR | `{"t":<u32>,"s":<u64>,"c":"<string 6 karakter>"}` — persis, tanpa spasi |
| Band kode error | `1..=99` C1 · `100..=199` C2 · `200+` OZ |
| Token pembayaran | parameter constructor; testnet `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (sUSD SAC), mainnet USDC |

### Klarifikasi terhadap draft spesifikasi PM

Dua hal yang ambigu saat implementasi, diputuskan di sini dan didokumentasikan:

1. **"Unicode whitespace" bukan satu himpunan.** ECMAScript `WhiteSpace` menghitung `U+FEFF` dan
   **tidak** menghitung `U+0085`; Unicode `White_Space` (= `char::is_whitespace()` di Rust) persis
   kebalikannya. Kalau tiap bahasa memakai bawaannya, hash-nya berbeda. Diselesaikan dengan
   menuliskan 25 code point `White_Space=Yes` secara eksplisit dan meng-hardcode-nya di kedua
   implementasi, plus test Rust yang membuktikan daftar itu sama dengan `char::is_whitespace()`
   di seluruh rentang scalar.
2. **Penolakan setelah pembuangan separator (N5b/N6b).** Draft hanya menyebut penolakan di N4
   (kosong setelah `norm_base`). Tapi input seperti `" -- - "` lolos N4 dan baru menjadi kosong
   setelah N5 membuang strip dan spasi. Menghash komponen kosong = menerima field identitas yang
   tidak berisi apa pun, jadi ditolak. Dicakup vector `rj-03` dan `rj-04`.

### Yang mengonsumsi pembekuan ini

| Tiket | Komponen | Yang dipakai |
| --- | --- | --- |
| **STE-11** | PII vault + hash/salt backend (James) | `HASH_AND_TOTP.md` §2–§4 |
| **STE-14** | TS bindings (Axel) | `INTERFACE.md` seluruhnya |
| **STE-15** | `SterunClient` (James) | signature fungsi + kode error + band |
| **STE-16** | Indexer (James) | `INTERFACE.md` §1.3, §2.3 — bentuk topic/data + urutan emisi |
| **STE-17** | Organiser console (Ancung) | surface organiser EventRegistry + `record_finish` |
| **STE-18 / STE-21 / STE-22** | QR pass + scanner PWA (Ancung) | `HASH_AND_TOTP.md` §4–§5, `claim_racepack`, `is_scanner` |
| **STE-33** | Deploy testnet | wasm hash + parameter constructor |
