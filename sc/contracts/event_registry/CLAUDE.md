# `event_registry` — C1 (CLAUDE.md)

Registry organiser-facing untuk event lari. **Satu instance melayani semua event.** Desain
otoritatif: `docs/SYSTEM_DESIGN.md` §3.1. Interface beku: `docs/specs/INTERFACE.md` §1.

## Yang disimpan (`DataKey`)

| Key | Storage | Isi |
| --- | --- | --- |
| `Admin` | instance | `Address` |
| `RaceRecordAddr` | instance | `Address` — **one-shot**, lihat di bawah |
| `EventCount` | instance | `u32` |
| `Event(event_id)` | persistent | `EventData` |
| `Category(event_id, category_id)` | persistent | `CategoryData` |
| `CategoryCount(event_id)` | persistent | `u32` |
| `Scanner(event_id, scanner)` | persistent | `bool` |

`DataKey` **tidak** didokumentasikan di `INTERFACE.md`: dia skema storage, bukan surface yang
dipanggil client. `check-interface.mjs` menuliskannya sebagai `internalTypes`, jadi
`#[contracttype]` **baru** apa pun yang muncul akan bikin gate merah — sengaja, supaya tipe publik
baru memaksa PR spec.

## Empat hal yang gampang dirusak

1. **`set_race_record` one-shot.** Panggilan kedua ditolak (`RaceRecordAlreadySet = 7`). Alasan:
   alamat itu satu-satunya caller tepercaya `reserve_slot`. Kalau bisa di-swap, admin yang
   ter-kompromi bisa menunjuk kontrak lain dan mencetak slot tanpa bayar. Wiring-nya urusan
   STE-33.
2. **`reserve_slot` cuma boleh dipanggil RaceRecord.** Gate-nya invoker-contract di root frame.
   **`mock_all_auths()` tidak bisa membuktikan gate ini** (recording mode memenuhi `require_auth`
   untuk address apa pun, termasuk contract address) — pakai `env.mock_auths(&[...])`.
3. **`entered_count` merangkap nomor bib.** `reserve_slot` menaikkannya dan mengembalikan nilainya
   sebagai `seq`. Jadi menyentuh cara counter itu naik = mengubah nomor bib yang sudah tercetak di
   record on-chain. Bukan refactor, itu perubahan data.
4. **Transisi `EventStatus`.** `Draft → Open → Closed → Completed`, dengan `Closed ↔ Open` boleh
   (organiser bisa buka lagi pendaftaran) dan `Completed` **terminal**. Transisi ilegal =
   `InvalidStatus = 11`.

## Kode error — band `1..=99`, jangan di-renumber

`NotInitialized=1`, `EventNotFound=2`, `CategoryNotFound=3`, `EventNotOpen=4`, `QuotaFull=5`,
`RaceRecordNotSet=6`, `RaceRecordAlreadySet=7`, `InvalidQuota=8`, `InvalidPrice=9`,
`InvalidDistance=10`, `InvalidStatus=11`, `ScannerAlreadyAdded=12`, `ScannerNotFound=13`.

Angka 4 dan 5 adalah yang paling sering dilihat client, karena `RaceRecord.enter` cross-call ke
sini dan revert-nya merambat apa adanya: `Error(Contract, #4)` dari `enter` itu `EventNotOpen`
**milik C1**, bukan error C2. Itulah gunanya band.

## Event yang dipancarkan

`EventCreated`, `CategoryAdded`, `EventStatusChanged`, `ScannerAdded`, `ScannerRemoved`,
`SlotReserved`. Layout topic-vs-data-nya **beku** di `INTERFACE.md` §1.3 dan itu yang di-filter
indexer STE-16. Ingat: field `data` adalah `ScMap` berkunci nama field, jadi urutan wire-nya
**alfabetis**, bukan urutan deklarasi. `#[topic]` yang tetap berurutan deklarasi.

## Test

`src/test.rs`, 33 test, coverage `lib.rs` 98%. Tiap revert path punya test-nya sendiri. Kalau
kamu menambah `pub fn` atau varian error, tambahkan **positive + negative + edge** sekaligus —
`cargo test` bukan tempat menaruh happy path saja.

```bash
cd sc && stellar contract build && cargo test -p event_registry
```
