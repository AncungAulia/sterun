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
| `AddOn(event_id, addon_id)` | persistent | `AddOnData` (v2) |
| `AddOnCount(event_id)` | persistent | `u32` (v2) |

`DataKey` **tidak** didokumentasikan di `INTERFACE.md`: dia skema storage, bukan surface yang
dipanggil client. `check-interface.mjs` menuliskannya sebagai `internalTypes`, jadi
`#[contracttype]` **baru** apa pun yang muncul akan bikin gate merah — sengaja, supaya tipe publik
baru memaksa PR spec.

**Sejak v2 tabel ini APPEND-ONLY selamanya.** Kontraknya upgradeable, jadi kode baru akan membaca
entry yang ditulis kode lama. Varian `DataKey` dikirim sebagai **nama**-nya, jadi menambah varian
di ujung aman; menghapus, me-rename, atau mengganti tipe nilainya membuat entry lama jadi yatim
tanpa satu pun error. Aturan lengkap + kenapa: `sc/CLAUDE.md`.

## Enam hal yang gampang dirusak

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
   `InvalidStatus = 11`. **v2** menambah `Cancelled`: boleh dari `Draft`/`Open`/`Closed`, terminal,
   dan **tidak** boleh dari `Completed` — lomba yang sudah jalan dan hasilnya terbit memang
   terjadi. `Cancelled` ≠ `Closed`: `Closed` itu "pendaftaran tutup, lombanya jalan, bisa dibuka
   lagi". Tidak ada refund on-chain; nilainya adalah "batal" tercatat di chain.
5. **`reserve_addon` mengembalikan HARGA, bukan `seq`.** (v2) Pemanggilnya `RaceRecord.enter`, yang
   butuh angka untuk menagih. Membacanya lewat panggilan kedua berarti jumlah yang ditagih dan unit
   yang dipakai datang dari dua pembacaan berbeda. `seq` unitnya tetap terbit di event
   `AddOnReserved` untuk fulfilment. Mengubah return-nya = mengubah cara `enter` menagih.
6. **`reserved_count` tidak pernah turun.** Membatalkan event tidak "mengembalikan" jersey yang
   sudah terjual, karena refundnya off-chain. Kalau suatu hari itu berubah, itu fitur baru dengan
   fungsi baru — bukan diam-diam mengurangi counter.

## Kode error — band `1..=99`, jangan di-renumber

`NotInitialized=1`, `EventNotFound=2`, `CategoryNotFound=3`, `EventNotOpen=4`, `QuotaFull=5`,
`RaceRecordNotSet=6`, `RaceRecordAlreadySet=7`, `InvalidQuota=8`, `InvalidPrice=9`,
`InvalidDistance=10`, `InvalidStatus=11`, `ScannerAlreadyAdded=12`, `ScannerNotFound=13`,
`AddOnNotFound=14`, `AddOnQuotaFull=15`.

`add_addon` **memakai ulang** `InvalidQuota=8` dan `InvalidPrice=9` — kondisinya persis sama dengan
`add_category` (`quota == 0`, `price < 0`), dan kode baru cuma akan memaksa client membedakan hal
yang sama.

Angka 4 dan 5 adalah yang paling sering dilihat client, karena `RaceRecord.enter` cross-call ke
sini dan revert-nya merambat apa adanya: `Error(Contract, #4)` dari `enter` itu `EventNotOpen`
**milik C1**, bukan error C2. Itulah gunanya band.

## Event yang dipancarkan

`EventCreated`, `CategoryAdded`, `EventStatusChanged`, `ScannerAdded`, `ScannerRemoved`,
`SlotReserved`, plus v2: `AddOnAdded`, `AddOnReserved`, `ContractUpgraded`.

Nama topic-nya diturunkan dari nama struct, dan `AddOn` pecah jadi dua kata:
`AddOnReserved` → `"add_on_reserved"`, **bukan** `"addon_reserved"`. Argumen fungsi tetap
`addon_id`. Tidak konsisten, memang — jangan menebak, cek `INTERFACE.md` §1.3.

Layout topic-vs-data-nya **beku** di `INTERFACE.md` §1.3 dan itu yang di-filter indexer STE-16.
Ingat: field `data` adalah `ScMap` berkunci nama field, jadi urutan wire-nya **alfabetis**, bukan
urutan deklarasi. `#[topic]` yang tetap berurutan deklarasi.

## Test

`src/test.rs`, 54 test, coverage `lib.rs` 98%. Tiap revert path punya test-nya sendiri. Kalau
kamu menambah `pub fn` atau varian error, tambahkan **positive + negative + edge** sekaligus —
`cargo test` bukan tempat menaruh happy path saja.

`mod upgrade` men-deploy registry **dari wasm** (`env.register(bytes, args)`), karena
`update_current_contract_wasm` cuma bisa mengganti executable yang benar-benar ada. Jadi
`stellar contract build` bukan cuma saran di sini: wasm basi = test upgrade menguji kode kemarin.

```bash
cd sc && stellar contract build && cargo test -p event_registry
```
