# `race_record` — C2 (CLAUDE.md)

Record lari **non-transferable** + lifecycle-nya. Desain otoritatif:
`docs/SYSTEM_DESIGN.md` §3.2. Interface beku: `docs/specs/INTERFACE.md` §2.

## Klaim produk yang seluruh Sterun bertumpu padanya

> Record lari tidak bisa pindah tangan.

Itu **tidak** dijaga oleh guard yang bisa salah konfigurasi. Itu benar karena `race_record.wasm`
**tidak mengekspor** satu pun fungsi yang bisa memindahkannya. Kontrak Soroban cuma punya fungsi
yang ada di export surface-nya — tidak ada fallback dispatch, tidak ada delegatecall.

Caranya: pakai *storage primitive* OpenZeppelin saja (`Base::mint`, `Base::owner_of`,
`Base::balance`, `Base::token_uri`, `Enumerable::sequential_mint`) dan **tidak** meng-implement
trait `NonFungibleToken` / `NonFungibleEnumerable` — trait itulah yang akan mengekspor `transfer`,
`transfer_from`, `approve`, `approve_for_all`, `burn`, `burn_from`.

**Kalau kamu meng-implement salah satu trait itu, klaim produknya bohong.** Dijaga dari dua sisi:
`scripts/check-exports.sh` (grep interface hasil build) dan test `exports::…` di `src/test.rs`
(mem-parse export section wasm-nya langsung). Keduanya jalan di CI.

Export surface sah — **18 fungsi**: `__constructor`, `enter`, `claim_racepack`, `record_finish`,
`record_dnf`, `extend_record_ttl`, `record_of`, `records_of`, `verify`, `owner_of`, `balance`,
`token_uri`, `total_supply`, `name`, `symbol`, `get_admin`, `get_registry`, `get_token`.

## `enter` — satu invocation, tiga efek, urutannya penting

```
reserve_slot (C1)  →  transfer sUSD (SAC, hanya kalau price > 0)  →  sequential_mint + write_record
```

**Kuota sebelum uang.** Event yang tutup atau kategori yang penuh gagal di langkah pertama, dan
runner cuma kehilangan fee transaksi yang gagal — bukan uangnya. Membalik urutan ini berarti
mengambil uang lalu mungkin menolak slot-nya.

Ketiganya atomik karena satu invocation: pembayaran yang gagal me-rollback kuota **dan** mint.
Test `a_failed_payment_rolls_back_quota_and_mint` yang menjaganya.

Emisi event-nya juga **beku dan berurutan** (`INTERFACE.md` §2.3), dari **tiga emitter berbeda**:

| # | Event | Emitter |
| --- | --- | --- |
| 1 | `slot_reserved` | EventRegistry |
| 2 | `transfer` | SAC sUSD — **hanya** kalau `price > 0` |
| 3 | `mint` | RaceRecord |
| 4 | `record_entered` | RaceRecord |

Indexer STE-16 harus key ke **contract id**, bukan ke offset tetap: kategori gratis tidak
memancarkan event nomor 2 sama sekali dan sisanya merapat. Test
`enter_emits_four_events_from_three_emitters_in_the_frozen_order` menguji kedua bentuk itu.

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
`NotAuthorized=104`, `InvalidFinishTime=105`. OZ `NonFungibleTokenError` menempati `200..=214`.

Error di luar dua band itu yang keluar dari fungsi kontrak ini **bukan** error kontrak ini — dia
merambat dari EventRegistry (`1..=99`) atau dari SAC.

## Cara memanggil EventRegistry

**Jangan** jadikan `event_registry` `[dependencies]` biasa — simbol `__constructor`-nya bentrok
(lihat `sc/CLAUDE.md`). Yang dipakai: trait `#[contractclient]` lokal di `src/registry.rs`, cuma 4
fungsi yang memang dibutuhkan (`reserve_slot`, `get_category`, `get_organiser`, `is_scanner`) plus
mirror `#[contracttype] CategoryData` dengan **nama field identik**. `event_registry` tetap ada
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

`src/test.rs`, 42 test, coverage `lib.rs` 97% region / 99% line. Snapshot `test_snapshots/` ikut
di-commit (dihasilkan otomatis oleh soroban testutils) — kalau diff-nya berubah tanpa kamu
mengubah perilaku, itu sinyal, bukan noise.

```bash
cd sc && stellar contract build && cargo test -p race_record
```
