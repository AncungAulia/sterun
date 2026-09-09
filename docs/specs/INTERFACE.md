# INTERFACE — kontrak Sterun yang DIBEKUKAN (v2.1.0)

> **Status: FROZEN 2026-09-10 (v2.1 — organiser allowlist di EventRegistry).**
> Dokumen ini adalah *handoff contract* nomor 1 di `docs/SYSTEM_DESIGN.md` §9: signature fungsi
> dan layout `#[contractevent]` yang dipegang **James** (backend/indexer) dan **Ancung**
> (web app, QR pass, scanner PWA) supaya mereka bisa jalan paralel tanpa menunggu kerjaan kontrak.
>
> Setiap perubahan pada signature, layout event, atau kode error setelah PR ini merged wajib:
> **PR baru + approval Axel (PM) + fable**, entri di `docs/specs/CHANGELOG.md`, dan **regenerate TS
> bindings** (STE-14). Kode error adalah ABI publik — **jangan pernah di-renumber**.

## Apa yang berubah dari v2.0.1 (MINOR, additive)

STE-36. `create_event` dulu cuma dijaga `organiser.require_auth()`. Itu membuktikan pemanggil
memegang keypair-nya, dan **tidak** membuktikan apa pun tentang `name` — yang tipenya `String`
bebas. Siapa pun bisa membuat "Jakarta Marathon 2026" dan menjual entry ke sana. v2.1 menambah
lapis kedua: **allowlist organiser yang dipegang admin**.

| Perubahan | Dampak ke client |
| --- | --- |
| `add_organiser` / `remove_organiser` / `is_organiser` baru di C1 | additive |
| Event baru: `OrganiserAdded`, `OrganiserRemoved` | additive |
| Kode error baru: `OrganiserAlreadyAdded(16)`, `OrganiserNotFound(17)`, `NotAllowlistedOrganiser(18)` | additive — tidak ada yang di-renumber |
| **`create_event` sekarang bisa revert `NotAllowlistedOrganiser(18)`** | **perilaku berubah** — pemanggil yang tidak di-allowlist ditolak; signature-nya tidak berubah |
| Dipasang lewat `upgrade` ke alamat yang **sama** (`CAPB6NQP…`) | tidak ada alamat baru; event lama utuh |

Dua hal yang wajib dibaca sebelum memakai versi ini:

- **Allowlist-nya mulai KOSONG.** `upgrade` mengganti kode, bukan storage, dan tidak ada
  migrasi yang memindahkan organiser event yang sudah ada ke dalam allowlist. Sampai admin
  memanggil `add_organiser`, **tidak ada** `create_event` yang lolos. Seeding adalah langkah
  deploy, bukan pelengkap.
- **Pencabutan bersifat maju saja.** `remove_organiser` tidak menyentuh event yang sudah dibuat:
  organiser-nya tetap organiser dan tetap bisa `add_category`, `set_event_status`, mengelola
  scanner, dan `record_finish` di C2. Yang hilang cuma kemampuan membuat event **baru**. Lomba
  yang entry-nya sudah terjual tidak bisa di-batalkan oleh satu penulisan storage.

## Apa yang berubah dari v1.0.1 (BREAKING)

v1 sudah live dan **non-upgradeable**, jadi alamatnya permanen dan versi ini **tidak menggantikan
kontrak itu di tempat** — v2 adalah pasangan alamat baru. Yang lama tetap tercatat di
`docs/deployments.md` sebagai arsip; yang berlaku untuk pekerjaan baru adalah dokumen ini.

| Perubahan | Dampak ke client |
| --- | --- |
| `enter` menerima `addon_ids: Vec<u32>` (argumen ke-4, sebelum `participant_hash`) | **breaking** — semua pemanggil `enter` wajib diperbarui; kirim `[]` kalau tidak beli add-on |
| `RecordData` bertambah field `addon_ids: Vec<u32>` | additive — decoder yang membaca per nama field aman |
| `EventStatus` bertambah varian `Cancelled` | **breaking untuk enum tertutup** — `be/`, `fe/`, dan `sdk/` masih memvalidasi 4 varian saja (lihat §8) |
| `upgrade(new_wasm_hash)` baru di **kedua** kontrak | additive |
| `add_addon` / `reserve_addon` / `get_addon` / `addon_count` + tipe `AddOnData` baru di C1 | additive |
| Event baru: `AddOnAdded`, `AddOnReserved`, `ContractUpgraded` (dua kontrak) | additive |
| Kode error baru: `AddOnNotFound(14)`, `AddOnQuotaFull(15)`, `TooManyAddOns(106)`, `DuplicateAddOn(107)` | additive — tidak ada yang di-renumber |
| Kontrak sekarang **upgradeable** | lihat §4 — klaim non-transferable sekarang tentang wasm yang ter-deploy, bukan tentang alamatnya selamanya |

Dokumen sodara:

| File | Isi |
| --- | --- |
| `docs/specs/HASH_AND_TOTP.md` | definisi byte-exact `participant_hash`, TOTP, payload QR |
| `docs/specs/vectors/` | test vector JSON untuk keduanya |
| `docs/specs/reference/` | dua implementasi referensi (Node + Rust) yang harus sepakat |
| `docs/specs/CHANGELOG.md` | riwayat versi + aturan perubahan |
| `docs/specs/verify.sh` | menjalankan kedua implementasi referensi |

---

## 0. Provenance — dokumen ini diturunkan dari wasm, bukan diketik ulang

Isi bagian 1–4 di bawah **dibaca dari artefak build**, bukan disalin dari kode sumber. Perintahnya:

```bash
cd sc
stellar contract build

stellar contract info interface --wasm target/wasm32v1-none/release/event_registry.wasm
stellar contract info interface --wasm target/wasm32v1-none/release/race_record.wasm

stellar contract info hash --wasm target/wasm32v1-none/release/event_registry.wasm
stellar contract info hash --wasm target/wasm32v1-none/release/race_record.wasm
```

Artefak yang dipakai saat pembekuan ini:

| Kontrak | Wasm | Wasm hash (sha256) | Ukuran |
| --- | --- | --- | ---: |
| EventRegistry (C1, v2.1) | `sc/target/wasm32v1-none/release/event_registry.wasm` | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | 26.948 B |
| RaceRecord (C2, v2.0.1) | `sc/target/wasm32v1-none/release/race_record.wasm` | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | 21.814 B |

RaceRecord **tidak** ikut berubah di v2.1 — hash-nya sama persis dengan yang dibekukan v2.0.1,
dan alamatnya tidak di-`upgrade`.

Artefak yang sudah **digantikan di alamat yang sama** lewat `upgrade` (riwayat lengkap +
tx-nya di `docs/deployments.md`):

| | sha256 | Ukuran |
| --- | --- | ---: |
| EventRegistry v2.0.0/v2.0.1 | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | 22.952 B |
| RaceRecord v2.0.0 | `c90a428152f0d8605cbb7466128b32b6dc821aa4735d930c280fe6fd4b58c0fc` | 21.795 B |

Artefak EventRegistry `22bb432e…` juga **ter-commit** di
`sc/contracts/event_registry/testdata/`, karena test upgrade-nya men-deploy kode itu, menulis
state dengannya, lalu menggantinya dengan build sekarang — satu-satunya pasangan yang bisa
membuktikan `DataKey::Organiser` ditambahkan dengan aman.

Artefak v1 yang dibekukan sebelumnya (masih live di alamat v1, lihat `docs/deployments.md`):
`61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` (C1, 14.964 B) dan
`75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` (C2, 19.435 B).

Hash itu **sha256 biasa dari file wasm** — reviewer bisa cek tanpa Stellar CLI:

```bash
shasum -a 256 sc/target/wasm32v1-none/release/event_registry.wasm
# cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0
```

Toolchain yang menghasilkannya: `rustc 1.93.0`, `stellar 27.0.0`, `soroban-sdk =26.1.1`,
OZ `stellar-tokens =0.7.2` (lihat `CLAUDE.md` untuk alasan pin versinya).

> Kalau hash wasm kamu berbeda dari tabel di atas, jangan langsung anggap dokumen ini salah:
> build Rust tidak bit-for-bit reproducible lintas mesin/toolchain. Yang wajib cocok adalah
> **isi interface**-nya (`stellar contract info interface`), bukan hash-nya. Hash ada supaya
> ada satu artefak konkret yang bisa ditunjuk. Yang di-deploy ke testnet dicatat di
> `docs/deployments.md` (STE-33) beserta hash-nya sendiri.

---

## 1. EventRegistry (C1) — surface publik

Satu instance melayani semua event. Design: `docs/SYSTEM_DESIGN.md` §3.1.

### 1.1 Fungsi

Tipe di kolom argumen memakai nama Soroban (`Address`, `String`, `Symbol`, `BytesN<32>`).
Semua `Result<T, Error>` berarti: sukses mengembalikan `T`, gagal **revert** dengan
`Error(Contract, #kode)`.

| Fungsi | Argumen | Return | Yang harus authorize | Error yang mungkin |
| --- | --- | --- | --- | --- |
| `__constructor` | `admin: Address` | — | — (dijalankan sekali saat deploy) | — |
| `upgrade` | `new_wasm_hash: BytesN<32>` | `Result<(), Error>` | **`Admin`** yang tersimpan | `NotInitialized(1)`, plus host error kalau hash-nya belum di-upload |
| `set_race_record` | `race_record: Address` | `Result<(), Error>` | **`Admin`** yang tersimpan | `NotInitialized(1)`, `RaceRecordAlreadySet(7)` |
| `add_organiser` | `organiser: Address` | `Result<(), Error>` | **`Admin`** yang tersimpan | `NotInitialized(1)`, `OrganiserAlreadyAdded(16)` |
| `remove_organiser` | `organiser: Address` | `Result<(), Error>` | **`Admin`** yang tersimpan | `NotInitialized(1)`, `OrganiserNotFound(17)` |
| `create_event` | `organiser: Address, name: String, metadata_hash: BytesN<32>, uri: String, starts_at: u64` | `Result<u32, Error>` (event_id) | **`organiser`** (argumen), yang wajib ada di allowlist admin | `NotInitialized(1)`, `NotAllowlistedOrganiser(18)` |
| `add_category` | `event_id: u32, code: Symbol, distance_m: u32, quota: u32, price_usdc: i128` | `Result<u32, Error>` (category_id) | **organiser event itu** (dari storage) | `EventNotFound(2)`, `InvalidQuota(8)`, `InvalidPrice(9)`, `InvalidDistance(10)` |
| `add_addon` | `event_id: u32, code: Symbol, price_usdc: i128, quota: u32` | `Result<u32, Error>` (addon_id) | **organiser event itu** (dari storage) | `EventNotFound(2)`, `InvalidQuota(8)`, `InvalidPrice(9)` |
| `set_event_status` | `event_id: u32, status: EventStatus` | `Result<(), Error>` | **organiser event itu** | `EventNotFound(2)`, `InvalidStatus(11)` |
| `add_scanner` | `event_id: u32, scanner: Address` | `Result<(), Error>` | **organiser event itu** | `EventNotFound(2)`, `ScannerAlreadyAdded(12)` |
| `remove_scanner` | `event_id: u32, scanner: Address` | `Result<(), Error>` | **organiser event itu** | `EventNotFound(2)`, `ScannerNotFound(13)` |
| `reserve_slot` | `event_id: u32, category_id: u32` | `Result<u32, Error>` (bib seq) | **hanya kontrak RaceRecord** yang di-wire (invoker-contract auth) | `RaceRecordNotSet(6)`, `EventNotFound(2)`, `EventNotOpen(4)`, `CategoryNotFound(3)`, `QuotaFull(5)` |
| `reserve_addon` | `event_id: u32, addon_id: u32` | `Result<i128, Error>` (harga yang ditagih) | **hanya kontrak RaceRecord** yang di-wire (invoker-contract auth) | `RaceRecordNotSet(6)`, `EventNotFound(2)`, `EventNotOpen(4)`, `AddOnNotFound(14)`, `AddOnQuotaFull(15)` |
| `get_admin` | — | `Result<Address, Error>` | — (view) | `NotInitialized(1)` |
| `get_race_record` | — | `Result<Address, Error>` | — (view) | `RaceRecordNotSet(6)` |
| `get_event` | `event_id: u32` | `Result<EventData, Error>` | — (view) | `EventNotFound(2)` |
| `get_category` | `event_id: u32, category_id: u32` | `Result<CategoryData, Error>` | — (view) | `CategoryNotFound(3)` |
| `get_organiser` | `event_id: u32` | `Result<Address, Error>` | — (view) | `EventNotFound(2)` |
| `is_organiser` | `addr: Address` | `bool` | — (view) | **tidak pernah revert** (`false` kalau tidak di-allowlist) |
| `is_scanner` | `event_id: u32, addr: Address` | `bool` | — (view) | **tidak pernah revert** (`false` kalau tidak ada) |
| `event_count` | — | `u32` | — (view) | **tidak pernah revert** (`0` kalau belum ada) |
| `category_count` | `event_id: u32` | `u32` | — (view) | **tidak pernah revert** (`0` kalau belum ada) |
| `get_addon` | `event_id: u32, addon_id: u32` | `Result<AddOnData, Error>` | — (view) | `AddOnNotFound(14)` |
| `addon_count` | `event_id: u32` | `u32` | — (view) | **tidak pernah revert** (`0` kalau belum ada) |

Catatan penting untuk D2/D3:

- **`get_category` pada `event_id` yang tidak ada mengembalikan `CategoryNotFound(3)`, bukan
  `EventNotFound(2)`.** Dia langsung baca key `Category(event_id, category_id)` tanpa cek event
  dulu. Jangan pakai error ini untuk membedakan "event tidak ada" vs "kategori tidak ada" —
  pakai `get_event` untuk itu.
- **`reserve_slot` tidak bisa dipanggil EOA.** Gate-nya invoker-contract auth: address
  `RaceRecordAddr` yang tersimpan harus authorize, dan sebuah contract address hanya authorize
  secara implisit ketika dia adalah *direct cross-contract caller*. RaceRecord tidak
  meng-implement `CustomAccountInterface` (`__check_auth`), jadi tidak ada signature yang bisa
  dipresentasikan EOA untuk address itu.
- **`set_race_record` sekali seumur hidup.** Panggilan kedua revert `RaceRecordAlreadySet(7)`,
  jadi caller tepercaya `reserve_slot` tidak bisa ditukar setelah wiring.
- Cek kuota dan increment terjadi **dalam satu invocation**, jadi dua entry bersamaan tidak
  mungkin sama-sama mengambil slot terakhir; yang kedua membaca `entered_count` yang sudah naik
  dan revert `QuotaFull(5)`. Hal yang sama berlaku untuk `reserve_addon` dan
  `AddOnQuotaFull(15)`.
- **`reserve_addon` mengembalikan HARGA, bukan nomor urut.** Pemanggilnya (`RaceRecord.enter`)
  butuh harga untuk menagih, dan membacanya lewat panggilan kedua berarti jumlah yang ditagih dan
  unit yang dipakai datang dari dua pembacaan berbeda. Nomor urut unit-nya tetap terbit di event
  `AddOnReserved` (field `seq`) untuk keperluan fulfilment.
- **`add_addon` memakai ulang `InvalidQuota(8)` dan `InvalidPrice(9)`.** Kondisinya identik dengan
  `add_category` (`quota == 0`, `price_usdc < 0`), jadi kode barunya cuma akan memaksa client
  membedakan hal yang sama. `price_usdc == 0` legal: add-on gratis dengan kuota tetap dibatasi.
- **`create_event` punya DUA gerbang, dan keduanya menjawab pertanyaan berbeda.**
  `organiser.require_auth()` menjawab "apakah pemanggil memegang keypair ini"; cek allowlist
  menjawab "apakah keypair ini sudah divetting admin". Tanpa yang kedua, `name` adalah `String`
  bebas dan gerbang pertama dengan senang hati meloloskan orang asing yang menandatangani untuk
  address-nya sendiri sambil menamai event-nya "Jakarta Marathon 2026". Urutannya `require_auth`
  dulu, jadi pemanggil yang tidak memegang key tidak belajar apa pun tentang isi allowlist.
- **Allowlist itu per-address dan contract-wide, bukan per-event.** Hibahnya adalah hal yang
  dibutuhkan organiser **sebelum** dia punya event. Otoritas per-event tetap di tempat lamanya:
  `EventData.organiser`, yang dibaca `add_category`, `set_event_status`, `add_scanner`, dan
  `record_finish` di C2. `is_organiser(addr)` **tidak** menjawab "apakah addr organiser event
  X" — untuk itu pakai `get_organiser(event_id)`.
- **`is_organiser` bukan penegak.** Dia read yang dipakai console untuk memutuskan apakah form
  "buat event" ditampilkan. Client yang melewatinya tetap dapat revert, bukan event.
- **Allowlist-nya mulai kosong setelah upgrade** (lihat bagian "Apa yang berubah dari v2.0.1"),
  dan `remove_organiser` tidak mencabut apa pun dari event yang sudah dibuat.
- **`upgrade` mengganti wasm kontrak ini di tempat.** Alamat, storage, dan saldo tidak berubah;
  yang berubah cuma kode. Efeknya baru berlaku **setelah** invocation selesai, jadi migrasi
  storage butuh panggilan kedua. Hash-nya wajib sudah ter-upload ke ledger. Lihat §4.

### 1.2 Tipe

```text
EventData {
  metadata_hash: BytesN<32>,
  name: String,
  organiser: Address,
  starts_at: u64,
  status: EventStatus,
  uri: String,
}

CategoryData {
  code: Symbol,
  distance_m: u32,
  entered_count: u32,   // sekaligus bib sequence berikutnya
  price_usdc: i128,     // representasi 7 desimal
  quota: u32,
}

AddOnData {
  code: Symbol,
  price_usdc: i128,     // representasi 7 desimal
  quota: u32,
  reserved_count: u32,  // unit yang sudah diambil, tidak pernah turun
}

EventStatus = Draft | Open | Closed | Completed | Cancelled
```

> Urutan field di atas adalah urutan **yang keluar dari `contractspecv0`** (alfabetis), bukan
> urutan deklarasi di Rust. Itu memang bagaimana `#[contracttype]` struct di-encode: sebagai
> `ScMap` yang **dikunci nama field** dan diurutkan. Untuk client TypeScript ini tidak terasa
> (bindings mengurus), tapi kalau ada yang mem-parse XDR mentah — urutannya alfabetis.

Transisi `EventStatus` yang legal (selain itu → `InvalidStatus(11)`, termasuk transisi ke dirinya
sendiri):

```text
Draft  -> Open | Closed | Cancelled
Open   -> Closed | Completed | Cancelled
Closed -> Open | Completed | Cancelled
Completed -> (terminal)
Cancelled -> (terminal)
```

`Cancelled` **bukan** sinonim `Closed`. `Closed` = pendaftaran ditutup, lombanya tetap jalan, dan
organiser boleh membukanya lagi. `Cancelled` = lombanya batal, dan tidak ada jalan keluar. Dari
`Completed` sengaja **tidak** boleh ke `Cancelled`: lomba yang sudah dijalankan dan hasilnya
terbit memang terjadi. Tidak ada refund on-chain — itu tetap janji off-chain
(`docs/SYSTEM_DESIGN.md` §11); nilai status ini adalah "batal" jadi tercatat di chain, bukan cuma
di banner website. `reserve_slot` dan `reserve_addon` sama-sama menuntut `Open`, jadi event yang
batal otomatis menolak entry baru dengan `EventNotOpen(4)` tanpa guard tambahan.

### 1.3 Event (`#[contractevent]`)

Encoding Soroban: `topics = [Symbol(nama_event), ...field bertanda #[topic] sesuai urutan
deklarasi]`, `data = ScMap` yang dikunci nama field untuk field non-topic (**terurut alfabetis**,
bukan urutan deklarasi), dan `ScMap` **kosong** kalau semua field jadi topic.

| Event | Topics (berurutan) | Data (map, alfabetis) |
| --- | --- | --- |
| `EventCreated` | `"event_created"`, `event_id: u32`, `organiser: Address` | *(kosong)* |
| `CategoryAdded` | `"category_added"`, `event_id: u32` | `category_id: u32`, `price: i128`, `quota: u32` |
| `AddOnAdded` | `"add_on_added"`, `event_id: u32` | `addon_id: u32`, `price: i128`, `quota: u32` |
| `EventStatusChanged` | `"event_status_changed"`, `event_id: u32` | `status: EventStatus` |
| `ScannerAdded` | `"scanner_added"`, `event_id: u32`, `scanner: Address` | *(kosong)* |
| `ScannerRemoved` | `"scanner_removed"`, `event_id: u32`, `scanner: Address` | *(kosong)* |
| `OrganiserAdded` | `"organiser_added"`, `organiser: Address` | *(kosong)* |
| `OrganiserRemoved` | `"organiser_removed"`, `organiser: Address` | *(kosong)* |
| `SlotReserved` | `"slot_reserved"`, `event_id: u32`, `category_id: u32` | `seq: u32` |
| `AddOnReserved` | `"add_on_reserved"`, `event_id: u32`, `addon_id: u32` | `price: i128`, `seq: u32` |
| `ContractUpgraded` | `"contract_upgraded"`, `new_wasm_hash: BytesN<32>` | *(kosong)* |

Contoh XDR nyata (diambil dari snapshot test `emits_category_added`, disederhanakan):

```json
{
  "topics": [{"symbol": "category_added"}, {"u32": 0}],
  "data": {"map": [
    {"key": {"symbol": "category_id"}, "val": {"u32": 0}},
    {"key": {"symbol": "price"},       "val": {"i128": "50000000"}},
    {"key": {"symbol": "quota"},       "val": {"u32": 200}}
  ]}
}
```

Nilai enum muncul sebagai vec berisi satu symbol, mis. `status: Open` →
`{"vec": [{"symbol": "Open"}]}`.

Untuk STE-16 (indexer): filter `getEvents` berdasarkan topic pertama (nama event) plus topic
`event_id` untuk halaman per-event. `CategoryAdded` sengaja **tidak** menjadikan `category_id`
topic — satu event punya sedikit kategori, jadi filter per-event sudah cukup dan slot topic
disimpan. `AddOnAdded` mengikuti pola yang sama; `AddOnReserved` **memang** menjadikan `addon_id`
topic, karena yang ditanya di sana adalah "berapa unit add-on ini yang terjual", bukan "apa saja
add-on event ini".

`OrganiserAdded` / `OrganiserRemoved` sengaja **tidak** membawa `event_id`: allowlist-nya
contract-wide, dan hibahnya terjadi sebelum penerimanya punya event untuk disebut. Indexer yang
mau menampilkan "siapa saja yang boleh membuat event" mem-filter dua nama topic ini saja.

Perhatikan nama topic-nya: `AddOnReserved` → `"add_on_reserved"`, bukan `"addon_reserved"`. Soroban
menurunkan nama event dari nama struct-nya, dan `AddOn` pecah jadi dua kata. Argumen fungsi dan
field struct tetap `addon_id` / `addon_ids` — memang tidak konsisten, dan disebut di sini justru
supaya tidak ada yang menebak.

### 1.4 Error (`#[contracterror]`, `repr(u32)`)

| Kode | Nama | Kapan |
| ---: | --- | --- |
| 1 | `NotInitialized` | storage instance belum berisi `Admin`/`EventCount` |
| 2 | `EventNotFound` | `event_id` tidak dikenal |
| 3 | `CategoryNotFound` | `(event_id, category_id)` tidak dikenal |
| 4 | `EventNotOpen` | `reserve_slot` saat status ≠ `Open` |
| 5 | `QuotaFull` | `entered_count >= quota` |
| 6 | `RaceRecordNotSet` | `reserve_slot`/`get_race_record` sebelum wiring |
| 7 | `RaceRecordAlreadySet` | `set_race_record` dipanggil kedua kali |
| 8 | `InvalidQuota` | `quota == 0` |
| 9 | `InvalidPrice` | `price_usdc < 0` |
| 10 | `InvalidDistance` | `distance_m == 0` |
| 11 | `InvalidStatus` | transisi `EventStatus` ilegal (termasuk ke dirinya sendiri) |
| 12 | `ScannerAlreadyAdded` | scanner sudah ada di allowlist event itu |
| 13 | `ScannerNotFound` | `remove_scanner` untuk address yang tidak ada |
| 14 | `AddOnNotFound` | `(event_id, addon_id)` tidak dikenal |
| 15 | `AddOnQuotaFull` | `reserved_count >= quota` pada sebuah add-on |
| 16 | `OrganiserAlreadyAdded` | `add_organiser` untuk address yang sudah di allowlist |
| 17 | `OrganiserNotFound` | `remove_organiser` untuk address yang tidak ada di allowlist |
| 18 | `NotAllowlistedOrganiser` | `create_event` dari address yang tidak di-allowlist admin |

---

## 2. RaceRecord (C2) — surface publik

Satu record **non-transferable** per entry, terikat address runner. Design:
`docs/SYSTEM_DESIGN.md` §3.2 (+ §5 untuk lifecycle).

### 2.1 Fungsi

| Fungsi | Argumen | Return | Yang harus authorize | Error yang mungkin |
| --- | --- | --- | --- | --- |
| `__constructor` | `admin: Address, registry: Address, token: Address, name: String, symbol: String, base_uri: String` | — | — (sekali saat deploy) | OZ `BaseUriMaxLenExceeded(211)`, `NameMaxLenExceeded(213)`, `SymbolMaxLenExceeded(214)` |
| `upgrade` | `new_wasm_hash: BytesN<32>` | `Result<(), Error>` | **`Admin`** yang tersimpan | `NotInitialized(100)`, plus host error kalau hash-nya belum di-upload |
| `enter` | `runner: Address, event_id: u32, category_id: u32, addon_ids: Vec<u32>, participant_hash: BytesN<32>` | `Result<u32, Error>` (token_id) | **`runner`** — satu auth tree yang juga menutupi sub-invocation `transfer` SEP-41 | sendiri: `NotInitialized(100)`, `TooManyAddOns(106)`, `DuplicateAddOn(107)`; **merambat** dari EventRegistry: `2,3,4,5,6,14,15`; dari SAC: kode error SAC; OZ: `MathOverflow(205)`, `TokenIDsAreDepleted(206)` |
| `claim_racepack` | `token_id: u32, operator: Address` | `Result<(), Error>` | **`operator`**, yang wajib organiser event itu **atau** scanner ter-allowlist | `NotInitialized(100)`, `RecordNotFound(101)`, `NotAuthorized(104)`, `AlreadyClaimed(102)`, merambat `EventNotFound(2)` |
| `record_finish` | `token_id: u32, finish_time_s: u32` | `Result<(), Error>` | **organiser event itu** (dibaca dari registry) | `NotInitialized(100)`, `RecordNotFound(101)`, `InvalidFinishTime(105)`, `InvalidState(103)`, merambat `EventNotFound(2)` |
| `record_dnf` | `token_id: u32` | `Result<(), Error>` | **organiser event itu** | `NotInitialized(100)`, `RecordNotFound(101)`, `InvalidState(103)`, merambat `EventNotFound(2)` |
| `extend_record_ttl` | `token_id: u32` | `Result<(), Error>` | **tidak ada — permissionless** | `RecordNotFound(101)` |
| `record_of` | `token_id: u32` | `Result<RecordData, Error>` | — (view) | `RecordNotFound(101)` |
| `records_of` | `runner: Address` | `Vec<u32>` | — (view) | **tidak pernah revert** (`[]` kalau kosong) |
| `verify` | `token_id: u32, participant_hash: BytesN<32>` | `bool` | — (view) | **tidak pernah revert**, token tidak dikenal → `false` |
| `owner_of` | `token_id: u32` | `Address` | — (view, OZ base) | panic OZ `NonExistentToken(200)` |
| `balance` | `owner: Address` | `u32` | — (view, OZ base) | — |
| `token_uri` | `token_id: u32` | `String` | — (view, OZ base) | `NonExistentToken(200)`, `UnsetMetadata(210)` |
| `total_supply` | — | `u32` | — (view, OZ enumerable) | — |
| `name` | — | `String` | — (view, metadata koleksi) | `UnsetMetadata(210)` |
| `symbol` | — | `String` | — (view, metadata koleksi) | `UnsetMetadata(210)` |
| `get_admin` | — | `Result<Address, Error>` | — (view) | `NotInitialized(100)` |
| `get_registry` | — | `Result<Address, Error>` | — (view) | `NotInitialized(100)` |
| `get_token` | — | `Result<Address, Error>` | — (view) | `NotInitialized(100)` |

Catatan penting untuk D2/D3:

- **`enter` adalah satu batas atomicity.** Urutannya: `runner.require_auth()` → validasi
  `addon_ids` (belum menyentuh state) → `reserve_slot` ke registry → satu `reserve_addon` per
  `addon_id`, masing-masing mengembalikan harganya → `transfer(runner, organiser, total)` ke SAC
  (**dilewati kalau `total == 0`**) → `Enumerable::sequential_mint` → tulis
  `RecordData{state: Entered, addon_ids}`. Kalau langkah mana pun gagal, semuanya batal: tidak ada
  slot kuota atau unit add-on yang terpakai tanpa bayaran, dan tidak ada record tanpa fee.
- **`total = category.price_usdc + Σ addon.price_usdc`, satu transfer.** Bukan satu transfer per
  item: dompet runner menyetujui satu angka, dan itu angka yang benar-benar pindah.
- **`total == 0` yang tidak memanggil token sama sekali**, bukan `price == 0`. Kategori gratis
  **plus** add-on berbayar tetap menagih. Kategori gratis plus add-on gratis tidak memanggil token
  sama sekali — runner tidak perlu punya saldo, dan untuk akun klasik `G...` tidak perlu trustline.
- **Aturan `addon_ids`** (dicek **sebelum** state apa pun disentuh, jadi penolakannya tidak memakan
  kuota): maksimal **16** id (`MAX_ADDONS_PER_ENTRY`), tidak boleh lebih banyak dari
  `addon_count(event_id)`, dan **tidak boleh ada id yang sama dua kali**. Dua-duanya
  `TooManyAddOns(106)`; yang duplikat `DuplicateAddOn(107)`. Mau dua jersey = dua add-on dengan dua
  kuota, bukan satu id ditulis dua kali. Urutan `addon_ids` dipertahankan apa adanya di
  `RecordData`.
- **Kirim `[]` (`Vec` kosong) kalau tidak beli apa-apa.** Itu jalur v1 apa adanya: satu transfer
  sebesar harga kategori.
- **`verify` mengembalikan `true`** hanya kalau record ada, hash-nya sama persis, **dan** token
  masih punya owner. Cara menghitung `participant_hash` yang diterima fungsi ini ada di
  `docs/specs/HASH_AND_TOTP.md` — nilai yang di-hash backend adalah tepat yang diterima chain
  (dibuktikan test `host_sha256_matches_every_participant_hash_vector` di
  `sc/contracts/race_record/src/test.rs`).
- **`claim_racepack` adalah arbiter "satu pack per entry".** Guard-nya `state == Entered`;
  scan kedua (desk yang sama, atau desk offline kedua yang antriannya baru terkirim) dapat
  `AlreadyClaimed(102)`. Cek roster lokal di scanner PWA hanya optimasi UX, bukan penegak.
- **`token` adalah parameter constructor, bukan konstanta.** Testnet menunjuk SAC sUSD, mainnet
  menunjuk USDC Circle, tanpa perubahan kode. Lihat §4.

### 2.2 Tipe

```text
RecordData {
  addon_ids: Vec<u32>,           // add-on yang dibeli entry ini, urut reservasi
  bib_no: u32,                   // seq kategori dari reserve_slot
  category_id: u32,
  claimed_at: Option<u64>,
  entered_at: u64,
  event_id: u32,
  finish_time_s: Option<u32>,
  participant_hash: BytesN<32>,
  result_at: Option<u64>,
  state: RecordState,
}

RecordState = Entered | RacepackClaimed | Finished | Dnf
```

Lifecycle (di luar ini → `InvalidState(103)` / `AlreadyClaimed(102)`):

```text
(mint)  -> Entered
Entered -> RacepackClaimed   (claim_racepack, organiser/scanner)
Entered -> Dnf               (record_dnf, organiser — no-show)
RacepackClaimed -> Finished  (record_finish, organiser)
RacepackClaimed -> Dnf       (record_dnf, organiser)
Finished, Dnf                (terminal, tidak ada jalan keluar)
```

`record_finish` **menolak** record yang belum `RacepackClaimed`: runner yang tidak pernah
mengambil race pack tidak bisa punya hasil.

### 2.3 Event (`#[contractevent]`)

| Event | Topics (berurutan) | Data (map, alfabetis) |
| --- | --- | --- |
| `Mint` *(dari OZ, saat `enter`)* | `"mint"`, `to: Address` | `token_id: u32` |
| `RecordEntered` | `"record_entered"`, `runner: Address`, `event_id: u32` | `bib_no: u32`, `token_id: u32` |
| `RacepackClaimed` | `"racepack_claimed"`, `token_id: u32`, `event_id: u32` | `operator: Address` |
| `RecordFinished` | `"record_finished"`, `token_id: u32`, `event_id: u32` | `finish_time_s: u32` |
| `RecordDnf` | `"record_dnf"`, `token_id: u32`, `event_id: u32` | *(kosong)* |
| `ContractUpgraded` | `"contract_upgraded"`, `new_wasm_hash: BytesN<32>` | *(kosong)* |

**`Mint` termasuk dalam surface yang dibekukan.** Dia dipancarkan oleh
`Enumerable::sequential_mint` di dalam OZ, bukan oleh kode kita, tapi indexer tetap melihatnya
dan urutannya deterministik: `Mint` selalu **sebelum** `RecordEntered` dalam invocation `enter`
yang sama.

Satu `enter` yang berhasil memancarkan, berurutan dan dari tiga emitter berbeda:

1. `slot_reserved` — **contract id EventRegistry**
2. `add_on_reserved` × jumlah add-on — **contract id EventRegistry** (v2; tidak ada kalau
   `addon_ids` kosong), urut sesuai `addon_ids`
3. `transfer` — **contract id SAC** (hanya kalau `total > 0`)
4. `mint` — contract id RaceRecord
5. `record_entered` — contract id RaceRecord

Indexer harus memfilter **per contract id**, bukan per offset tetap: jumlah event dalam satu
`enter` sekarang bergantung pada berapa add-on yang dibeli dan apakah totalnya nol.

**`record_entered` tidak membawa `addon_ids`.** Add-on yang dibeli dibaca dari `record_of` (field
`addon_ids`) atau direkonstruksi dari `add_on_reserved` milik registry, yang malah lebih kaya —
membawa `seq` unitnya dan `price` yang benar-benar ditagih.

### 2.4 Error (`#[contracterror]`, `repr(u32)`)

| Kode | Nama | Kapan |
| ---: | --- | --- |
| 100 | `NotInitialized` | wiring instance (`Admin`/`RegistryAddr`/`TokenAddr`) tidak ada |
| 101 | `RecordNotFound` | `token_id` tidak dikenal |
| 102 | `AlreadyClaimed` | `claim_racepack` saat state ≠ `Entered` — guard anti-double-racepack |
| 103 | `InvalidState` | `record_finish` saat state ≠ `RacepackClaimed`, atau keluar dari state terminal |
| 104 | `NotAuthorized` | operator bukan organiser dan bukan scanner ter-allowlist |
| 105 | `InvalidFinishTime` | `finish_time_s == 0` |
| 106 | `TooManyAddOns` | `addon_ids` lebih panjang dari `addon_count(event_id)` atau dari 16 |
| 107 | `DuplicateAddOn` | `addon_ids` memuat id yang sama dua kali |

Plus enum OZ yang ikut ter-embed di spec RaceRecord (bukan milik kita, jangan dipakai ulang):

| Kode | Nama |
| ---: | --- |
| 200 | `NonExistentToken` |
| 201 | `IncorrectOwner` |
| 202 | `InsufficientApproval` |
| 203 | `InvalidApprover` |
| 204 | `InvalidLiveUntilLedger` |
| 205 | `MathOverflow` |
| 206 | `TokenIDsAreDepleted` |
| 207 | `InvalidAmount` |
| 208 | `TokenNotFoundInOwnerList` |
| 209 | `TokenNotFoundInGlobalList` |
| 210 | `UnsetMetadata` |
| 211 | `BaseUriMaxLenExceeded` |
| 212 | `InvalidRoyaltyAmount` |
| 213 | `NameMaxLenExceeded` |
| 214 | `SymbolMaxLenExceeded` |

---

## 3. Konvensi band kode error (WAJIB)

| Band | Pemilik |
| --- | --- |
| `1..=99` | EventRegistry (C1) |
| `100..=199` | RaceRecord (C2) |
| `200+` | OpenZeppelin `NonFungibleTokenError` (200–214 di `stellar-tokens 0.7.2`) |
| kelipatan 100 berikutnya | kontrak baru |

**Kenapa band ini ada.** Sebuah `ScError` Soroban membawa `u32` telanjang dan **tidak membawa
identitas kontrak**. `enter` memanggil EventRegistry dan SAC secara cross-contract, dan revert
mereka merambat ke pemanggil apa adanya. Tanpa band disjoint, `Error(Contract, #4)` yang keluar
dari `enter` bisa berarti `EventRegistry::EventNotOpen` **atau** `RaceRecord::InvalidState`, dan
SDK D2 harus menebak. Dengan band, **angkanya sendiri sudah menyebut asalnya**: `#4` pasti C1,
`#103` pasti C2, `#200+` pasti OZ.

Contoh konkret yang akan dilihat James/Ancung: `enter` pada event yang belum `Open` gagal dengan
`Error(Contract, #4)` — itu `EventNotOpen` milik EventRegistry, bukan error RaceRecord.

Dijaga mekanis oleh test `error_codes_of_the_two_contracts_are_disjoint_bands` di
`sc/contracts/race_record/src/test.rs`: build gagal kalau band-nya pernah tumpang tindih lagi.

**Kode error adalah ABI publik.** Setelah pembekuan ini merged, kode tidak boleh di-renumber,
dan varian yang dihapus tidak boleh dipakai ulang nomornya. Varian baru mengambil nomor bebas
berikutnya di dalam band kontraknya.

---

## 4. Non-transferable: fungsinya TIDAK ADA — dan apa artinya sekarang v2 upgradeable

**RaceRecord tidak mengekspor `transfer`, `transfer_from`, `approve`, `approve_for_all`, `burn`,
maupun `burn_from`.** Itulah yang membuat record tidak bisa pindah tangan — bukan guard yang
revert, tapi ketiadaan jalur kode terekspor yang menulis ulang owner mapping. Guard bisa salah
konfigurasi; fungsi yang tidak ada tidak bisa dipanggil.

**v2 menambah `upgrade`, dan itu mengubah bentuk jaminannya. Jangan dibaca seolah tidak berubah:**

| | v1 (live, non-upgradeable) | v2 |
| --- | --- | --- |
| Yang dijamin mekanis | wasm yang ter-deploy tidak punya fungsi pemindah record — **selamanya, untuk alamat itu** | wasm yang ter-deploy tidak punya fungsi pemindah record — **untuk kode yang terpasang sekarang** |
| Yang jadi asumsi kepercayaan | tidak ada | **kunci admin tidak memasang wasm yang menambahkannya** |
| Cara mengeceknya | `check-exports.sh` + test wasm + cek kontrak live saat deploy | sama persis, plus `contract_upgraded` di ledger tiap kali kode berganti |

Alternatifnya adalah membekukan RaceRecord sementara EventRegistry dapat add-on — artinya
perubahan `enter` berikutnya butuh alamat baru lagi. Itu pertukaran yang diambil sadar, dan
`ContractUpgraded` ada supaya perubahan kode di bawah alamat yang sama tetap terlihat di chain.

Secara teknis: kontrak Soroban mengekspos persis fungsi di `#[contractimpl]`-nya — tidak ada
fallback dispatch, tidak ada `delegatecall`. Modul non-fungible OZ memisahkan *storage primitive*
(`Base::mint`, `Base::owner_of`, `Base::balance`, `Base::token_uri`,
`Enumerable::sequential_mint`) dari trait publik `NonFungibleToken` / `NonFungibleEnumerable`
yang akan mengekspor fungsi-fungsi terlarang itu. RaceRecord **tidak meng-implement trait
tersebut** dan hanya memanggil storage primitive-nya.

Export surface RaceRecord yang sah — **19 fungsi, tidak lebih**:

```text
__constructor  upgrade  enter  claim_racepack  record_finish  record_dnf  extend_record_ttl
record_of  records_of  verify  owner_of  balance  token_uri  total_supply
name  symbol  get_admin  get_registry  get_token
```

Ditegakkan dari dua sisi, keduanya wajib hijau sebelum PR/deploy:

1. **`sc/scripts/check-exports.sh`** — build, `stellar contract info interface`, lalu grep. Exit
   non-zero kalau ada nama terlarang, kalau surface EventRegistry bocor ke RaceRecord, atau
   kalau wasm > 128KB. `upgrade` sengaja **tidak** masuk daftar "surface EventRegistry": kedua
   kontrak punya `upgrade` sendiri-sendiri, jadi menemukannya di sini benar, bukan bocor.
2. **`cargo test`** — test `exports::race_record_wasm_exports_nothing_that_could_move_a_record`
   mem-parse export section wasm-nya langsung (bukan source-nya).

`burn` juga sengaja tidak ada: riwayat lari bersifat append-only. Konsekuensi privasinya diakui
terbuka di `docs/SYSTEM_DESIGN.md` §11 poin 2.

---

## 5. Token pembayaran (SEP-41 / SAC)

`RaceRecord.__constructor` menerima `token: Address` dan menyimpannya di instance storage
(`DataKey::TokenAddr`, dibaca lewat `get_token`). **Bukan konstanta di dalam kode.**

| Network | Asset | Address |
| --- | --- | --- |
| testnet | sUSD (Sterun USD), issue sendiri | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| mainnet (nanti) | USDC (Circle) | *(config saat deploy mainnet — belum ada)* |

Detail lengkap sUSD (issuer, distributor, tx issuance, verifikasi SEP-41, cara dapat trustline)
ada di **`docs/deployments.md`**, yang datang bersama branch STE-30
(`ops/26-issue-susd-deploy-sac`) dan **belum ter-merge saat branch STE-10 ini dibuat** — jadi
kalau file itu belum ada di working tree kamu, itu sebabnya, bukan salah tulis. Alamat SAC di
tabel atas disalin apa adanya dari sana dan sudah live di testnet. Explorer:
<https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU>

Keduanya classic Stellar asset **7 desimal** yang diekspos ke kontrak lewat SAC, jadi pergantian
sUSD → USDC hanya mengganti nilai config saat deploy. Tidak ada perubahan logika kontrak, tidak
ada perubahan interface, tidak ada regenerate bindings.

`price_usdc` di `CategoryData` **dan `AddOnData`** adalah `i128` dalam representasi 7 desimal
(mis. 5,00 sUSD = `50000000`). Yang benar-benar pindah dalam satu `enter` adalah **jumlahnya**:
`category.price_usdc + Σ addon.price_usdc`.

---

## 6. Siapa yang mengonsumsi pembekuan ini

| Tiket | Komponen | Yang dipakai |
| --- | --- | --- |
| STE-11 | PII vault + hash/salt backend (James) | `docs/specs/HASH_AND_TOTP.md`, `verify`, `enter` |
| STE-14 | TS bindings (Axel) | seluruh dokumen ini — bindings di-generate dari wasm yang sama |
| STE-15 | `SterunClient` (James) | signature fungsi + kode error + band |
| STE-16 | Indexer (James) | §1.3 dan §2.3 — bentuk topic/data + urutan emisi |
| STE-17 | Organiser console (Ancung) | `create_event`, `add_category`, `set_event_status`, scanner, `record_finish` |
| STE-18 / 21 / 22 | QR pass + scanner PWA (Ancung) | `claim_racepack`, `is_scanner`, `record_of`, plus TOTP di `HASH_AND_TOTP.md` |
| STE-33 | Deploy testnet | wasm hash + parameter constructor (§0, §5) |
| STE-35 | Add-on berbayar (Ancung) | `add_addon`, `get_addon`, `addon_count`, `enter(addon_ids)`, `AddOnReserved` |

---

## 7. Aturan perubahan

Setelah PR STE-10 ini merged, **setiap** perubahan pada:

- signature fungsi (nama, argumen, tipe, urutan, return),
- layout `#[contractevent]` (nama event, field mana yang topic, urutan),
- kode atau nama error,
- definisi `participant_hash` / TOTP,

wajib melalui:

1. **PR baru** yang di-approve **Axel (PM) + fable (AI co-PM)**. Tidak ada self-merge.
2. **Entri di `docs/specs/CHANGELOG.md`** dengan versi baru + tanggal + alasan + dampak.
3. **Regenerate TS bindings (STE-14)** dan naikkan versinya, karena setiap konsumen D2/D3
   memegang salinan yang di-generate.
4. Untuk perubahan hash/TOTP: **`bash docs/specs/verify.sh` harus tetap hijau**, dan vector lama
   yang berubah artinya wajib disebut eksplisit di changelog (bukan diam-diam di-regenerate).

Kode error **tidak pernah di-renumber**. Menambah varian baru boleh; mengubah angka varian lama
tidak.

---

## 8. Checklist migrasi client ke v2 (BELUM dikerjakan — buat tiketnya)

Kontrak v2 sudah live (alamatnya di `docs/deployments.md`), tapi `be/`, `fe/`, dan `sdk/` masih
ditulis untuk v1. Yang di bawah ini **sengaja tidak** dikerjakan bersama PR kontrak ini — itu kode
James dan Ancung — jadi dicatat di sini supaya tidak ada yang menemukannya lewat runtime error.

| Paket | Yang harus berubah | Kalau tidak diubah |
| --- | --- | --- |
| `sdk/` | ~~`EventStatus` menerima `"Cancelled"`~~ — **selesai** | — |
| `sdk/` | ~~`EnterArgs.addOnIds` diteruskan ke `enter`~~ — **selesai** | — |
| `sdk/` | ~~Method add-on di `SterunClient`~~ — **selesai (STE-37)**: `addAddon`, `getAddon`, `listAddOns`, `addonCount`, tipe `SterunAddOn` | — |
| `be/` | ~~`EVENT_STATUSES` + JSON schema `directory.ts`~~ — **selesai**, plus CHECK constraint `events_status_check` (migrasi 006) yang baris ini dulu tidak sebut | — |
| `be/` | ~~alamat v2~~ — **selesai**: `be/` dan `fe/` menunjuk pasangan v2, index + vault di-truncate | — |
| `be/` | opsional: index `add_on_reserved` untuk laporan penjualan add-on | tidak ada data add-on di roster |
| `fe/` | ~~`EventStatusBadge` butuh warna untuk `Cancelled`~~ — **selesai** | — |
| `fe/` | UI pilih add-on di alur entry (STE-21) | add-on tidak bisa dibeli lewat web app |
| `fe/` | UI harga + kuota add-on di organiser console (STE-17) | console masih model v1: add-on sebagai deskripsi, tanpa harga dan tanpa stok |

> **Baris `fe/` punya prasyarat yang dulu tidak tertulis di sini, dan itu menahan STE-21 diam-diam.**
> Untuk menampilkan add-on yang bisa dipilih, `fe/` harus bisa **membaca** add-on sebuah event — dan
> sampai STE-37 `SterunClient` tidak punya satu pun method add-on. Bukan hanya membuatnya yang
> terhalang; membacanya juga. Yang membuat itu tidak kelihatan: `sdk/vendor/event-registry.ts`
> **punya** semua fungsinya, jadi sekilas terlihat siap — padahal itu cetakan otomatis dari wasm,
> bukan permukaan yang boleh dipakai (`registry` dan `record` private, bindings tidak di-export dari
> `src/index.ts`).
>
> Sekarang tersedia:
>
> ```ts
> const addOns = await sterun.listAddOns(eventId);   // SterunAddOn[]
> // { addonId, code, priceStroops, quota, reservedCount, unitsLeft }
> await sterun.enter({ runner, eventId, categoryId, addOnIds: [0, 2], participantHash }, asRunner);
> ```
>
> `reserve_addon` **tidak** di-wrap dan tidak akan: dia memanggil `race_record.require_auth()`, jadi
> itu langkah antar-kontrak di dalam `enter`, bukan sesuatu yang boleh dipanggil client. Mem-wrap-nya
> cuma memberi orang cara memanggil sesuatu yang selalu revert.

`be/` men-decode `RecordData` per nama field, jadi `addon_ids` yang baru **tidak** merusaknya —
field itu hanya diabaikan sampai ada yang memakainya.
