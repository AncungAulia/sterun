# sc/ — Sterun Soroban contracts

Cargo workspace untuk kontrak Sterun (Stellar/Soroban, Rust `#![no_std]`, target `wasm32v1-none`).

| Contract | Ticket | Deskripsi |
|---|---|---|
| `contracts/event_registry` | STE-5 (C1) | Registry event, kategori, kuota, harga sUSD, scanner allowlist, `reserve_slot` |
| `contracts/race_record` | STE-9 (C2) | Record lari **non-transferable** + lifecycle (`Entered` → `RacepackClaimed` → `Finished`/`Dnf`), `enter` atomik (kuota + bayar sUSD + mint dalam satu invocation), `extend_record_ttl` permissionless |

## Versi (pinned EXACT)

- `soroban-sdk = "=26.1.1"` — **protocol 26**, bukan 27/28.
  Alasan: crate OpenZeppelin `stellar-tokens` / `stellar-access` / `stellar-contract-utils` /
  `stellar-macros` versi terbaru (`0.7.2`, per 2026-08-31) mensyaratkan `soroban-sdk ^26.1.0`.
  Naikkan ke 27 hanya setelah OZ merilis versi yang kompatibel.
- OZ crates `= "0.7.2"` di `[workspace.dependencies]`.

## Perintah

```bash
cd sc
stellar contract build            # -> target/wasm32v1-none/release/*.wasm
cargo test                        # unit + integration test (butuh build di atas, lihat catatan)
cargo clippy --all-targets -- -D warnings
cargo fmt --all
cargo llvm-cov --summary-only     # coverage (target >80%)
./scripts/check-exports.sh        # WAJIB sebelum PR/deploy — lihat di bawah
```

> **Urutan build → test itu wajib.** Test
> `race_record::test::exports::race_record_wasm_exports_nothing_that_could_move_a_record`
> membaca `target/wasm32v1-none/release/race_record.wasm` dan membongkar export
> section-nya. Kalau wasm-nya belum ada, test gagal dengan pesan yang menyuruh
> jalankan `stellar contract build` dulu — sengaja gagal, bukan skip diam-diam.

## Konvensi kode error: band per kontrak

`ScError` di Soroban cuma `u32` **tanpa identitas kontrak**, dan revert dari
sub-invocation (EventRegistry, SAC) merambat ke pemanggil apa adanya. Jadi kode
error dibagi per band supaya `Error(Contract, #N)` mentah langsung ketahuan
asalnya:

| Band | Pemilik |
|---|---|
| `1..=99` | `event_registry` (C1) |
| `100..=199` | `race_record` (C2) |
| `200+` | OpenZeppelin `NonFungibleTokenError` (200–214 di stellar-tokens 0.7.2) |
| kelipatan 100 berikutnya | kontrak baru |

Contoh konkret: `enter` yang gagal karena event belum `Open` keluar sebagai
`Error(Contract, #4)` — itu `EventRegistry::EventNotOpen`, dan karena 4 di luar
band RaceRecord, client tahu pasti itu bukan error RaceRecord. Test
`error_codes_of_the_two_contracts_are_disjoint_bands` gagal kalau band-nya
pernah tumpang tindih lagi.

## Non-transferable = fungsinya TIDAK ADA (STE-9)

Klaim produk Sterun bertumpu pada satu hal: record lari tidak bisa pindah tangan.
Itu bukan dijaga oleh guard yang bisa salah konfigurasi, tapi karena
`race_record.wasm` **tidak mengekspor** satu pun fungsi yang bisa memindahkannya.
RaceRecord memakai *storage primitive* OpenZeppelin saja (`Base::mint`,
`Base::owner_of`, `Base::balance`, `Base::token_uri`,
`Enumerable::sequential_mint`) dan **tidak** meng-implement trait
`NonFungibleToken` / `NonFungibleEnumerable` yang akan mengekspor `transfer`,
`transfer_from`, `approve`, `approve_for_all`, `burn`, `burn_from`.

Dicek mekanis dari dua sisi:

1. `scripts/check-exports.sh` — build, lalu `stellar contract info interface`
   dan grep. Exit non-zero kalau ada nama terlarang, kalau surface EventRegistry
   bocor ke RaceRecord, atau kalau wasm > 128KB.
2. `cargo test` — test `exports::…` di `contracts/race_record/src/test.rs`
   mem-parse export section wasm-nya langsung.

Export surface RaceRecord yang sah (18 fungsi): `__constructor`, `enter`,
`claim_racepack`, `record_finish`, `record_dnf`, `extend_record_ttl`,
`record_of`, `records_of`, `verify`, `owner_of`, `balance`, `token_uri`,
`total_supply`, `name`, `symbol`, `get_admin`, `get_registry`, `get_token`.

## Cara RaceRecord memanggil EventRegistry

**Jangan** pakai `event_registry` sebagai `[dependencies]` biasa. Kedua crate
`crate-type = ["lib", "cdylib"]` dan `#[contractimpl]` memasang
`#[cfg_attr(target_family = "wasm", export_name = "…")]` di tiap entry point,
jadi linking rlib-nya ke cdylib RaceRecord langsung gagal:

```
warning: Linking globals named '__constructor': symbol multiply defined!
error: failed to load bitcode of module "event_registry.…-cgu.0.rcgu.o"
```

Yang dipakai: trait lokal dengan `#[contractclient]` di
`contracts/race_record/src/registry.rs` — hanya 4 fungsi yang memang dibutuhkan
(`reserve_slot`, `get_category`, `get_organiser`, `is_scanner`) plus mirror
`#[contracttype] CategoryData` dengan nama field identik. `#[contractclient]`
cuma menghasilkan struct client (tanpa `export_name`, tanpa entry
`contractspecv0`), dan `event_registry` tetap ada sebagai **dev-dependency**
supaya test bisa mendaftarkan registry sungguhan di `Env` yang sama.
Test `mirrored_category_data_decodes_the_registrys_own_struct` menjaga mirror
itu tetap sinkron dengan C1.
