# `race_record` — C2 (CLAUDE.md)

Record lari **non-transferable** + lifecycle-nya. Desain otoritatif:
`docs/SYSTEM_DESIGN.md` §3.2. Interface beku: `docs/specs/INTERFACE.md` §2.

## Klaim produk yang seluruh Sterun bertumpu padanya

> Record lari tidak bisa pindah tangan.

Itu **tidak** dijaga oleh guard yang bisa salah konfigurasi. Itu benar karena `race_record.wasm`
**tidak mengekspor** satu pun fungsi yang bisa memindahkannya. Kontrak Soroban cuma punya fungsi
yang ada di export surface-nya — tidak ada fallback dispatch, tidak ada delegatecall.

**Sejak v2 kalimat itu punya batas, dan jangan disalin tanpa batasnya.** Kontrak ini sekarang
punya `upgrade`, jadi:

| | Dijamin mekanis | Asumsi kepercayaan |
| --- | --- | --- |
| v1 (live, non-upgradeable) | wasm-nya tidak punya fungsi pemindah record, **selamanya** | — |
| v2 | wasm yang **terpasang sekarang** tidak punya fungsi pemindah record | kunci admin tidak memasang wasm yang menambahkannya |

Yang dicek tetap sama persis (`check-exports.sh`, test wasm, cek kontrak live saat deploy), plus
`contract_upgraded` di ledger tiap kali kodenya berganti. Kalau kamu menulis ulang klaim ini di
README, landing page, atau materi grant: **tulis versi v2-nya**, bukan versi v1-nya.

Caranya: pakai *storage primitive* OpenZeppelin saja (`Base::mint`, `Base::owner_of`,
`Base::balance`, `Base::token_uri`, `Enumerable::sequential_mint`) dan **tidak** meng-implement
trait `NonFungibleToken` / `NonFungibleEnumerable` — trait itulah yang akan mengekspor `transfer`,
`transfer_from`, `approve`, `approve_for_all`, `burn`, `burn_from`.

**Kalau kamu meng-implement salah satu trait itu, klaim produknya bohong.** Dijaga dari dua sisi:
`scripts/check-exports.sh` (grep interface hasil build) dan test `exports::…` di `src/test.rs`
(mem-parse export section wasm-nya langsung). Keduanya jalan di CI.

Export surface sah — **19 fungsi**: `__constructor`, `upgrade`, `enter`, `claim_racepack`,
`record_finish`, `record_dnf`, `extend_record_ttl`, `record_of`, `records_of`, `verify`,
`owner_of`, `balance`, `token_uri`, `total_supply`, `name`, `symbol`, `get_admin`, `get_registry`,
`get_token`.

`upgrade` sengaja **tidak** masuk daftar "surface EventRegistry yang bocor" di `check-exports.sh`:
kedua kontrak punya `upgrade` sendiri-sendiri, jadi menemukannya di sini benar, bukan bocor.

## `enter` — satu invocation, empat efek, urutannya penting

```
validasi addon_ids (belum menyentuh state)
  →  reserve_slot (C1)
  →  reserve_addon (C1) × jumlah add-on, tiap panggilan mengembalikan harganya
  →  transfer sUSD (SAC, hanya kalau TOTAL > 0)
  →  sequential_mint + write_record
```

**Kuota sebelum uang.** Event yang tutup, kategori yang penuh, atau add-on yang habis gagal
sebelum satu stroop pun pindah, dan runner cuma kehilangan fee transaksi yang gagal — bukan
uangnya. Membalik urutan ini berarti mengambil uang lalu mungkin menolak slot-nya.

Semuanya atomik karena satu invocation: pembayaran yang gagal me-rollback kuota kategori, **setiap
unit add-on yang sudah diambil di panggilan yang sama**, dan mint. Test
`a_failed_payment_rolls_back_quota_and_mint`,
`a_failed_payment_rolls_back_the_add_on_reservations_too`, dan
`a_sold_out_add_on_rolls_back_the_slot_the_fee_and_the_mint` yang menjaganya.

**Satu transfer untuk seluruh keranjang**, bukan satu per item: dompet runner menyetujui satu
angka, dan itu angka yang benar-benar pindah. Yang menentukan token dipanggil atau tidak adalah
**total**, bukan harga kategori — kategori gratis + add-on berbayar tetap menagih.

Aturan `addon_ids` (dicek sebelum state disentuh, jadi penolakannya tidak memakan kuota):
maksimal `MAX_ADDONS_PER_ENTRY` (16), tidak lebih banyak dari `addon_count(event_id)`, dan tidak
ada id yang sama dua kali. Dua bound itu **tidak** redundan: yang kedua menjaga loop tetap pendek
untuk event yang wajar, yang pertama menjaganya tetap terbatas apa pun yang di-publish organiser.
Duplikat ditolak (`DuplicateAddOn = 107`) karena akan mengambil dua unit stok sementara record-nya
mencatat satu.

Emisi event-nya juga **beku dan berurutan** (`INTERFACE.md` §2.3), dari **tiga emitter berbeda**:

| # | Event | Emitter |
| --- | --- | --- |
| 1 | `slot_reserved` | EventRegistry |
| 2 | `add_on_reserved` × jumlah add-on | EventRegistry — tidak ada kalau `addon_ids` kosong |
| 3 | `transfer` | SAC sUSD — **hanya** kalau `total > 0` |
| 4 | `mint` | RaceRecord |
| 5 | `record_entered` | RaceRecord |

Indexer STE-16 harus key ke **contract id**, bukan ke offset tetap: jumlah event dalam satu `enter`
sekarang bergantung pada berapa add-on yang dibeli dan apakah totalnya nol. Test
`enter_emits_four_events_from_three_emitters_in_the_frozen_order` dan
`an_entry_with_add_ons_emits_one_addon_reserved_per_unit_before_the_transfer` menguji bentuk-bentuk
itu.

`record_entered` **tidak** membawa `addon_ids`. Yang dibeli dibaca dari `record_of`, atau dari
`add_on_reserved` milik registry — yang malah lebih kaya, membawa `seq` unitnya dan `price` yang
benar-benar ditagih.

## Lifecycle

`Entered → RacepackClaimed → Finished` atau `→ Dnf`. `Finished` dan `Dnf` terminal.

**Guard anti-double-racepack ada di `claim_racepack`**: state harus persis `Entered`. Scan kedua —
dari meja yang sama, atau dari meja offline kedua yang antriannya baru drain belakangan — ketemu
`RacepackClaimed` dan revert `AlreadyClaimed` (102). Yang membuat "satu pack per entry" benar itu
**chain**, bukan kedisiplinan volunteer.

`record_finish` menolak record yang belum `RacepackClaimed` (`InvalidState` 103): tidak bisa
finish balapan yang racepack-nya belum diambil.

## Kode error — band `100..=199`, jangan di-renumber

`NotInitialized=100`, `RecordNotFound=101`, `AlreadyClaimed=102`, `InvalidState=103`,
`NotAuthorized=104`, `InvalidFinishTime=105`, `TooManyAddOns=106`, `DuplicateAddOn=107`.
OZ `NonFungibleTokenError` menempati `200..=214`.

Error di luar dua band itu yang keluar dari fungsi kontrak ini **bukan** error kontrak ini — dia
merambat dari EventRegistry (`1..=99`) atau dari SAC.

## Cara memanggil EventRegistry

**Jangan** jadikan `event_registry` `[dependencies]` biasa — simbol `__constructor`-nya bentrok
(lihat `sc/CLAUDE.md`). Yang dipakai: trait `#[contractclient]` lokal di `src/registry.rs`, cuma 6
fungsi yang memang dibutuhkan (`reserve_slot`, `reserve_addon`, `addon_count`, `get_category`,
`get_organiser`, `is_scanner`) plus mirror `#[contracttype] CategoryData` dengan **nama field
identik**. `event_registry` tetap ada
sebagai `[dev-dependencies]` supaya test bisa mendaftarkan registry sungguhan di `Env` yang sama.

Mirror itu bisa diam-diam melenceng dari C1 — test
`mirrored_category_data_decodes_the_registrys_own_struct` yang menjaganya. `registry.rs` tampil
0% di laporan coverage dan itu **wajar**: dia input makro tanpa body, makanya tidak di-gate.

## `participant_hash` dan `verify`

On-chain cuma ada hash, **tidak pernah** PII. Definisi byte-exact-nya beku di
`docs/specs/HASH_AND_TOTP.md`, dan dua test di `src/test.rs`
(`host_sha256_matches_every_participant_hash_vector`,
`every_participant_hash_vector_is_accepted_by_enter_and_verify`) membaca **file vector yang sama**
dengan implementasi referensi. Jadi kalau spec dan kontrak pernah berpisah jalan, `cargo test`
yang merah duluan — bukan ketahuan di produksi.

## TTL

`extend_record_ttl` **permissionless**: siapa pun boleh membayar untuk memperpanjang umur record
orang lain. Itu disengaja — record yang ter-archive tidak bisa diverifikasi, dan runner tidak
boleh kehilangan buktinya cuma karena tidak punya XLM. Keeper job STE-12 yang memanggilnya rutin.

## Test

`src/test.rs`, 60 test, coverage `lib.rs` 97% region / 99% line.

`mod upgrade` men-deploy RaceRecord **dari wasm**, jadi `stellar contract build` harus jalan
duluan — dan World-nya bikin registry sendiri, karena `set_race_record` one-shot.

**`RecordData` tidak boleh menambah field WAJIB lagi.** Struct `#[contracttype]` adalah map
berkunci nama field, jadi record yang sudah tersimpan gagal di-decode ke struct yang bertambah
field wajib. Itu alasan `addon_ids` masuk di v2, saat belum ada satu pun record v2. Butuh data baru
per record nanti? `DataKey` varian baru, atau `Option`. Snapshot `test_snapshots/` ikut
di-commit (dihasilkan otomatis oleh soroban testutils) — kalau diff-nya berubah tanpa kamu
mengubah perilaku, itu sinyal, bukan noise.

```bash
cd sc && stellar contract build && cargo test -p race_record
```
