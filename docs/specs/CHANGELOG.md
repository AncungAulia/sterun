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

Versinya **satu untuk seluruh folder**. Judul tiap file membawa versi di mana **file itu**
terakhir berubah, jadi header yang berbeda antar file itu disengaja: `INTERFACE.md (v1.0.0)` di
sebelah `HASH_AND_TOTP.md (v1.0.1)` berarti dokumen interface-nya memang tidak tersentuh sejak
pembekuan. Yang berlaku untuk konsumen selalu entri paling atas di daftar versi bawah.

Sejak v2.0.0 keduanya memang berbeda: `INTERFACE.md` di **v2.0.0**, `HASH_AND_TOTP.md` masih di
**v1.0.1** karena definisi hash dan TOTP tidak tersentuh sama sekali oleh v2.

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

## [2.0.1] — 2026-09-09

**PATCH — artefaknya berganti, interface-nya tidak.** `RaceRecord.enter` melewati panggilan
cross-contract `addon_count` ketika `addon_ids` kosong, jadi entry tanpa add-on berbiaya persis
seperti v1 — yang memang yang dijanjikan `INTERFACE.md` §2.1 kepada pemanggil yang mengirim `[]`.

Yang **tidak** berubah, dan itulah kenapa ini PATCH: nol perubahan signature, layout event, kode
error, tipe, maupun definisi hash/TOTP. **Bindings TS byte-identical** — generator membaca
interface, dan interface-nya sama persis. Client yang sudah jalan tidak perlu melakukan apa pun.

Yang berubah cuma tabel provenance `INTERFACE.md` §0:

| | sha256 | Ukuran |
| --- | --- | ---: |
| RaceRecord v2.0.0 | `c90a428152f0d8605cbb7466128b32b6dc821aa4735d930c280fe6fd4b58c0fc` | 21.795 B |
| RaceRecord v2.0.1 | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | 21.814 B |

EventRegistry **tidak** ikut berubah (`22bb432e…` tetap).

Dipasang ke alamat yang sudah live lewat `upgrade` — **bukan** alamat baru. Ini pemakaian pertama
mekanisme v2 untuk apa yang memang dirancangnya, dan buktinya (tx, state sebelum/sesudah, plus
satu `enter` di kode baru) ada di `docs/deployments.md` section 7.

---

## [2.0.0] — 2026-09-09

**MAJOR — signature `enter` berubah, dan kedua kontrak sekarang upgradeable.** v1 tetap live di
alamatnya sendiri dan tidak tersentuh (v1 non-upgradeable, jadi memang tidak bisa disentuh); v2
adalah **pasangan alamat baru**, tercatat di `docs/deployments.md`. Client yang masih bicara ke
alamat v1 tidak rusak oleh entri ini — yang rusak adalah client yang memakai bindings baru untuk
memanggil kontrak lama, atau sebaliknya.

Approval: brief tertulis Axel (PM) di `V2_BRIEF.md`, yang juga memberi pre-authorisation untuk
merge tanpa gate ACC per PR kali ini. Itu pengganti sah dari "PR + approval @Axel + @fable" di
aturan perubahan di atas, dan disebut di sini supaya jejaknya ada.

### Kenapa

Ancung minta add-on berbayar (STE-35): jersey +5, tumbler +3, dijual bersama entry. `enter` v1
menagih **persis satu** `category.price_usdc`, jadi uang add-on terpaksa pindah off-chain — dan
chain tidak bisa menjawab dua pertanyaan yang justru penting di meja merch: *"runner ini sudah
bayar jersey belum"* dan *"jerseynya masih ada berapa"*.

Karena v1 tidak punya jalur upgrade, memenuhi permintaan itu **harus** lewat alamat baru. Jadi
sekalian dipasangi mekanisme upgrade, supaya ini terakhir kalinya alamat berganti.

### Breaking

- **`RaceRecord.enter`** menerima `addon_ids: Vec<u32>` sebagai argumen **ke-4**, sebelum
  `participant_hash`. Pemanggil yang tidak menjual add-on mengirim `[]` dan mendapat perilaku v1
  apa adanya.
- **`EventStatus` bertambah `Cancelled`.** Enum-nya terbuka di sisi kontrak, tapi `be/`, `fe/`,
  dan `sdk/` memvalidasi daftar tertutup berisi 4 varian — checklist migrasinya ada di
  `INTERFACE.md` §8.
- **Klaim non-transferable berubah bentuk** (bukan berubah isi): tetap dibuktikan mekanis dari
  wasm yang ter-deploy, tapi sekarang bergantung pada kunci admin tidak memasang wasm lain.
  Tabelnya ada di `INTERFACE.md` §4. Ini satu-satunya bagian v2 yang **mengurangi** jaminan, dan
  ditulis eksplisit supaya tidak lolos sebagai catatan kaki.

### Ditambahkan

- `EventRegistry.upgrade(new_wasm_hash)` dan `RaceRecord.upgrade(new_wasm_hash)`, admin-gated,
  memakai `env.deployer().update_current_contract_wasm` (mekanisme upgrade native Soroban —
  bukan proxy, bukan `delegatecall`).
- `EventRegistry`: `add_addon`, `reserve_addon`, `get_addon`, `addon_count`, tipe `AddOnData`,
  dan storage key `AddOn(event_id, addon_id)` + `AddOnCount(event_id)`.
- `RecordData.addon_ids: Vec<u32>` — add-on yang dibeli entry itu, urut reservasi.
- Event: `AddOnAdded`, `AddOnReserved` (C1), `ContractUpgraded` (**kedua** kontrak).
- Kode error, semuanya nomor bebas berikutnya di band-nya, **nol renumber**:
  `AddOnNotFound(14)`, `AddOnQuotaFull(15)`, `TooManyAddOns(106)`, `DuplicateAddOn(107)`.

### Vector

**Tidak ada vector yang berubah.** `participant_hash` dan TOTP tidak tersentuh sama sekali —
`HASH_AND_TOTP.md` tetap di v1.0.1 dan `docs/specs/verify.sh` hijau tanpa perubahan.

### Aturan baru yang lahir dari upgradeability

Storage sekarang harus bertahan melintasi pergantian kode, dan itu tidak bisa dijaga compiler:

- **`DataKey` append-only selamanya.** Jangan hapus, jangan rename, jangan ganti tipe nilainya.
  Enum `#[contracttype]` dikirim sebagai **nama varian**, jadi menambah varian aman dan
  me-rename satu varian membuat setiap entry lama jadi yatim tanpa error.
- **`RecordData` tidak boleh menambah field wajib lagi setelah ada record.** Struct
  `#[contracttype]` adalah map berkunci nama field, jadi nilai lama gagal di-decode ke struct
  yang bertambah field wajib. Itulah alasan `addon_ids` masuk **sekarang**, saat belum ada satu
  pun record v2, bukan di upgrade berikutnya.
- **`stellar-tokens` memiliki key owner/balance/enumeration OZ.** Menaikkan major-nya lewat
  upgrade adalah migrasi storage, bukan bump versi.

---

## [1.0.1] — 2026-09-01

**PATCH — perbaikan render, nol perubahan perilaku.** Tidak ada satu byte pun yang berubah:
tidak ada signature, layout event, kode error, definisi hash/TOTP, vector, maupun implementasi
referensi yang tersentuh. Konsumen yang sudah menggenerate terhadap v1.0.0 **tidak perlu
melakukan apa pun**, dan bindings TS **tidak** di-regenerate — wasm dan `INTERFACE.md` sama
persis.

### Diperbaiki

- **`HASH_AND_TOTP.md` §3.5** — baris tabel `name` pecah menjadi dua. Di bawah baris `name`
  yang utuh tertinggal satu potongan sebagai baris tersendiri:

  ```text
  "` | `Siti Aminah binti Rahman` |
  ```

  Baris itu tidak diawali `|`, jadi GitHub (dan penampil Markdown mana pun) berhenti membaca
  tabelnya di situ: dua baris terakhir (`national_id`, `emergency_contact`) ikut keluar dari
  tabel. Fragmennya dihapus. Baris `name` yang utuh sudah benar dan **tidak** diubah.

  Nilai-nilainya diverifikasi ulang terhadap vector `ph-04-messy-whitespace` di
  `vectors/participant_hash.json`, bukan dibaca sekilas: mentahnya persis
  `"  Siti\u00a0 Aminah   binti\u0009Rahman\u000a"` (NBSP `U+00A0` + spasi, TAB `U+0009`, LF
  `U+000A` di ujung) dan hasil normalisasinya `Siti Aminah binti Rahman` — sama seperti yang
  sudah tertulis. Hash `feb3ce…fe29` di paragraf bawahnya juga tetap.

Ini penting justru karena §3.5 adalah satu-satunya tempat aturan normalisasi ditunjukkan sebagai
*contoh* dan bukan sebagai prosa: itu yang dibaca James dan Ancung lebih dulu. Tabel yang tidak
ter-render membuat kolom "mentah" dan "ternormalisasi" tampak menyatu — persis salah baca yang
menghasilkan dua implementasi dengan hash berbeda.

### Verifikasi

- `bash docs/specs/verify.sh` — hijau, kedua implementasi referensi tetap sepakat di tiap vector.
- `cd sc && cargo test` — hijau (33 + 42), termasuk
  `host_sha256_matches_every_participant_hash_vector`.
- `node sc/scripts/check-interface.mjs` — hijau, wasm ↔ `INTERFACE.md` ↔ bindings tidak bergerak.

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
