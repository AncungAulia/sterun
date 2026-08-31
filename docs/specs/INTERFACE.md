# INTERFACE — kontrak Sterun yang DIBEKUKAN (v1.0.0)

> **Status: FROZEN 2026-08-31 (STE-10, komponen C4).**
> Dokumen ini adalah *handoff contract* nomor 1 di `docs/SYSTEM_DESIGN.md` §9: signature fungsi
> dan layout `#[contractevent]` yang dipegang **James** (backend/indexer) dan **Ancung**
> (web app, QR pass, scanner PWA) supaya mereka bisa jalan paralel tanpa menunggu kerjaan kontrak.
>
> Setiap perubahan pada signature, layout event, atau kode error setelah PR ini merged wajib:
> **PR baru + approval Axel (PM) + fable**, entri di `docs/specs/CHANGELOG.md`, dan **regenerate TS
> bindings** (STE-14). Kode error adalah ABI publik — **jangan pernah di-renumber**.

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
| EventRegistry (C1, STE-5) | `sc/target/wasm32v1-none/release/event_registry.wasm` | `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` | 14.964 B |
| RaceRecord (C2, STE-9) | `sc/target/wasm32v1-none/release/race_record.wasm` | `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` | 19.435 B |

Hash itu **sha256 biasa dari file wasm** — reviewer bisa cek tanpa Stellar CLI:

```bash
shasum -a 256 sc/target/wasm32v1-none/release/event_registry.wasm
# 61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474
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
| `set_race_record` | `race_record: Address` | `Result<(), Error>` | **`Admin`** yang tersimpan | `NotInitialized(1)`, `RaceRecordAlreadySet(7)` |
| `create_event` | `organiser: Address, name: String, metadata_hash: BytesN<32>, uri: String, starts_at: u64` | `Result<u32, Error>` (event_id) | **`organiser`** (argumen) | `NotInitialized(1)` |
| `add_category` | `event_id: u32, code: Symbol, distance_m: u32, quota: u32, price_usdc: i128` | `Result<u32, Error>` (category_id) | **organiser event itu** (dari storage) | `EventNotFound(2)`, `InvalidQuota(8)`, `InvalidPrice(9)`, `InvalidDistance(10)` |
| `set_event_status` | `event_id: u32, status: EventStatus` | `Result<(), Error>` | **organiser event itu** | `EventNotFound(2)`, `InvalidStatus(11)` |
| `add_scanner` | `event_id: u32, scanner: Address` | `Result<(), Error>` | **organiser event itu** | `EventNotFound(2)`, `ScannerAlreadyAdded(12)` |
| `remove_scanner` | `event_id: u32, scanner: Address` | `Result<(), Error>` | **organiser event itu** | `EventNotFound(2)`, `ScannerNotFound(13)` |
| `reserve_slot` | `event_id: u32, category_id: u32` | `Result<u32, Error>` (bib seq) | **hanya kontrak RaceRecord** yang di-wire (invoker-contract auth) | `RaceRecordNotSet(6)`, `EventNotFound(2)`, `EventNotOpen(4)`, `CategoryNotFound(3)`, `QuotaFull(5)` |
| `get_admin` | — | `Result<Address, Error>` | — (view) | `NotInitialized(1)` |
| `get_race_record` | — | `Result<Address, Error>` | — (view) | `RaceRecordNotSet(6)` |
| `get_event` | `event_id: u32` | `Result<EventData, Error>` | — (view) | `EventNotFound(2)` |
| `get_category` | `event_id: u32, category_id: u32` | `Result<CategoryData, Error>` | — (view) | `CategoryNotFound(3)` |
| `get_organiser` | `event_id: u32` | `Result<Address, Error>` | — (view) | `EventNotFound(2)` |
| `is_scanner` | `event_id: u32, addr: Address` | `bool` | — (view) | **tidak pernah revert** (`false` kalau tidak ada) |
| `event_count` | — | `u32` | — (view) | **tidak pernah revert** (`0` kalau belum ada) |
| `category_count` | `event_id: u32` | `u32` | — (view) | **tidak pernah revert** (`0` kalau belum ada) |

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
  dan revert `QuotaFull(5)`.

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

EventStatus = Draft | Open | Closed | Completed
```

> Urutan field di atas adalah urutan **yang keluar dari `contractspecv0`** (alfabetis), bukan
> urutan deklarasi di Rust. Itu memang bagaimana `#[contracttype]` struct di-encode: sebagai
> `ScMap` yang **dikunci nama field** dan diurutkan. Untuk client TypeScript ini tidak terasa
> (bindings mengurus), tapi kalau ada yang mem-parse XDR mentah — urutannya alfabetis.

Transisi `EventStatus` yang legal (selain itu → `InvalidStatus(11)`, termasuk transisi ke dirinya
sendiri):

```text
Draft  -> Open | Closed
Open   -> Closed | Completed
Closed -> Open | Completed
Completed -> (terminal)
```

### 1.3 Event (`#[contractevent]`)

Encoding Soroban: `topics = [Symbol(nama_event), ...field bertanda #[topic] sesuai urutan
deklarasi]`, `data = ScMap` yang dikunci nama field untuk field non-topic (**terurut alfabetis**,
bukan urutan deklarasi), dan `ScMap` **kosong** kalau semua field jadi topic.

| Event | Topics (berurutan) | Data (map, alfabetis) |
| --- | --- | --- |
| `EventCreated` | `"event_created"`, `event_id: u32`, `organiser: Address` | *(kosong)* |
| `CategoryAdded` | `"category_added"`, `event_id: u32` | `category_id: u32`, `price: i128`, `quota: u32` |
| `EventStatusChanged` | `"event_status_changed"`, `event_id: u32` | `status: EventStatus` |
| `ScannerAdded` | `"scanner_added"`, `event_id: u32`, `scanner: Address` | *(kosong)* |
| `ScannerRemoved` | `"scanner_removed"`, `event_id: u32`, `scanner: Address` | *(kosong)* |
| `SlotReserved` | `"slot_reserved"`, `event_id: u32`, `category_id: u32` | `seq: u32` |

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
disimpan.

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

---

## 2. RaceRecord (C2) — surface publik

Satu record **non-transferable** per entry, terikat address runner. Design:
`docs/SYSTEM_DESIGN.md` §3.2 (+ §5 untuk lifecycle).

### 2.1 Fungsi

| Fungsi | Argumen | Return | Yang harus authorize | Error yang mungkin |
| --- | --- | --- | --- | --- |
| `__constructor` | `admin: Address, registry: Address, token: Address, name: String, symbol: String, base_uri: String` | — | — (sekali saat deploy) | OZ `BaseUriMaxLenExceeded(211)`, `NameMaxLenExceeded(213)`, `SymbolMaxLenExceeded(214)` |
| `enter` | `runner: Address, event_id: u32, category_id: u32, participant_hash: BytesN<32>` | `Result<u32, Error>` (token_id) | **`runner`** — satu auth tree yang juga menutupi sub-invocation `transfer` SEP-41 | sendiri: `NotInitialized(100)`; **merambat** dari EventRegistry: `2,3,4,5,6`; dari SAC: kode error SAC; OZ: `MathOverflow(205)`, `TokenIDsAreDepleted(206)` |
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

- **`enter` adalah satu batas atomicity.** Urutannya: `runner.require_auth()` → `reserve_slot`
  ke registry → `transfer(runner, organiser, price)` ke SAC (**dilewati kalau `price == 0`**) →
  `Enumerable::sequential_mint` → tulis `RecordData{state: Entered}`. Kalau langkah mana pun
  gagal, semuanya batal: tidak ada slot kuota yang terpakai tanpa bayaran, dan tidak ada record
  tanpa fee.
- **Kategori gratis (`price_usdc == 0`) tidak memanggil token sama sekali** — runner tidak perlu
  punya saldo, dan untuk akun klasik `G...` tidak perlu trustline.
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

**`Mint` termasuk dalam surface yang dibekukan.** Dia dipancarkan oleh
`Enumerable::sequential_mint` di dalam OZ, bukan oleh kode kita, tapi indexer tetap melihatnya
dan urutannya deterministik: `Mint` selalu **sebelum** `RecordEntered` dalam invocation `enter`
yang sama.

Satu `enter` yang berhasil memancarkan, berurutan dan dari tiga emitter berbeda:

1. `slot_reserved` — **contract id EventRegistry**
2. `transfer` — **contract id SAC** (hanya kalau `price > 0`)
3. `mint` — contract id RaceRecord
4. `record_entered` — contract id RaceRecord

Indexer harus memfilter **per contract id**, bukan hanya per nama topic.

### 2.4 Error (`#[contracterror]`, `repr(u32)`)

| Kode | Nama | Kapan |
| ---: | --- | --- |
| 100 | `NotInitialized` | wiring instance (`Admin`/`RegistryAddr`/`TokenAddr`) tidak ada |
| 101 | `RecordNotFound` | `token_id` tidak dikenal |
| 102 | `AlreadyClaimed` | `claim_racepack` saat state ≠ `Entered` — guard anti-double-racepack |
| 103 | `InvalidState` | `record_finish` saat state ≠ `RacepackClaimed`, atau keluar dari state terminal |
| 104 | `NotAuthorized` | operator bukan organiser dan bukan scanner ter-allowlist |
| 105 | `InvalidFinishTime` | `finish_time_s == 0` |

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

## 4. Non-transferable: fungsinya TIDAK ADA

**RaceRecord tidak mengekspor `transfer`, `transfer_from`, `approve`, `approve_for_all`, `burn`,
maupun `burn_from`.** Itulah yang membuat record tidak bisa pindah tangan — bukan guard yang
revert, tapi ketiadaan jalur kode terekspor yang menulis ulang owner mapping. Guard bisa salah
konfigurasi atau di-upgrade; fungsi yang tidak ada tidak bisa dipanggil (dan v1 non-upgradeable).

Secara teknis: kontrak Soroban mengekspos persis fungsi di `#[contractimpl]`-nya — tidak ada
fallback dispatch, tidak ada `delegatecall`. Modul non-fungible OZ memisahkan *storage primitive*
(`Base::mint`, `Base::owner_of`, `Base::balance`, `Base::token_uri`,
`Enumerable::sequential_mint`) dari trait publik `NonFungibleToken` / `NonFungibleEnumerable`
yang akan mengekspor fungsi-fungsi terlarang itu. RaceRecord **tidak meng-implement trait
tersebut** dan hanya memanggil storage primitive-nya.

Export surface RaceRecord yang sah — **18 fungsi, tidak lebih**:

```text
__constructor  enter  claim_racepack  record_finish  record_dnf  extend_record_ttl
record_of  records_of  verify  owner_of  balance  token_uri  total_supply
name  symbol  get_admin  get_registry  get_token
```

Ditegakkan dari dua sisi, keduanya wajib hijau sebelum PR/deploy:

1. **`sc/scripts/check-exports.sh`** — build, `stellar contract info interface`, lalu grep. Exit
   non-zero kalau ada nama terlarang, kalau surface EventRegistry bocor ke RaceRecord, atau
   kalau wasm > 128KB.
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

`price_usdc` di `CategoryData` adalah `i128` dalam representasi 7 desimal
(mis. 5,00 sUSD = `50000000`).

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
