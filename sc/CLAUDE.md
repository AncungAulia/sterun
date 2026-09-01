# `sc/` — kontrak Soroban (CLAUDE.md)

Cargo workspace untuk kedua kontrak Sterun. Rust `#![no_std]`, target `wasm32v1-none`.
Referensi lengkap ada di [`README.md`](README.md) — file ini cuma aturan main yang harus kamu
pegang **sebelum** menulis kode di sini.

| Member | Tiket | CLAUDE.md-nya |
| --- | --- | --- |
| `contracts/event_registry/` | STE-5 (C1) | [`contracts/event_registry/CLAUDE.md`](contracts/event_registry/CLAUDE.md) |
| `contracts/race_record/` | STE-9 (C2) | [`contracts/race_record/CLAUDE.md`](contracts/race_record/CLAUDE.md) |
| `bindings/` | STE-14 (C3) | output generator — **jangan diedit tangan**, lihat [`bindings/README.md`](bindings/README.md) |
| `scripts/` | STE-9 / STE-14 | tiga gate yang juga dijalankan CI |

## Perintah harian

```bash
cd sc
stellar contract build            # WAJIB duluan — test membaca wasm hasilnya
cargo test                        # 33 (event_registry) + 42 (race_record)
cargo clippy --all-targets -- -D warnings
cargo fmt --all
./scripts/check-exports.sh        # non-transferable dibuktikan dari wasm
node scripts/check-interface.mjs  # spec beku vs wasm vs bindings
```

**Urutan `build` → `test` itu wajib**, bukan gaya-gayaan: test
`race_record::test::exports::race_record_wasm_exports_nothing_that_could_move_a_record` membongkar
export section `target/wasm32v1-none/release/race_record.wasm`. Kalau wasm-nya belum ada, test
**gagal** (sengaja, bukan skip diam-diam).

Coverage — floor 80%, sekarang 99%:

```bash
cargo llvm-cov --no-report
cargo llvm-cov report --json --summary-only --output-path target/coverage.json
node scripts/coverage-gate.mjs target/coverage.json
```

## Versi di-pin EXACT — jangan dinaikkan tanpa cek ini dulu

`soroban-sdk = "=26.1.1"` (**protocol 26**, bukan 27/28) dan OZ `stellar-*` `= "0.7.2"` di
`[workspace.dependencies]`. Alasannya bukan kehati-hatian umum: OZ 0.7.2 (rilis terbaru per
2026-08-31) mensyaratkan `soroban-sdk ^26.1.0`, jadi selama RaceRecord memakai OZ non-fungible
base, workspace ini **tidak bisa** naik ke 27. Naikkan hanya setelah OZ merilis versi yang
kompatibel protocol 27 — dan verifikasi dulu lewat MCP Stellar Raven, jangan dari ingatan.

Stellar CLI **27.0.0** tetap dipakai (build/deploy kompatibel mundur). Versi CLI dan rustc yang
menghasilkan hash wasm tercatat di `README.md`; CI mem-pin angka yang sama.

## Band kode error — konvensi paling mudah dilanggar di repo ini

| Band | Pemilik |
| --- | --- |
| `1..=99` | `event_registry` (C1) |
| `100..=199` | `race_record` (C2) |
| `200+` | OpenZeppelin `NonFungibleTokenError` (200–214 di stellar-tokens 0.7.2) |
| kelipatan 100 berikutnya | kontrak baru |

`ScError` Soroban cuma membawa `u32` **tanpa identitas kontrak**, dan revert dari sub-invocation
merambat ke pemanggil apa adanya. `enter` cross-call ke EventRegistry **dan** SAC, jadi tanpa band
disjoint `Error(Contract, #4)` dari `enter` bisa `EventNotOpen` (C1) atau `InvalidState` (C2), dan
SDK D2 harus menebak. Test `error_codes_of_the_two_contracts_are_disjoint_bands` menjaganya.

**Kode error adalah ABI publik: tidak pernah di-renumber, nomor varian yang dihapus tidak boleh
dipakai ulang.** Varian baru ambil nomor bebas berikutnya di band-nya, lewat prosedur di
`docs/specs/CLAUDE.md`.

## Kontrak TIDAK boleh jadi dependency biasa antar-member

Kedua crate `crate-type = ["lib", "cdylib"]`, dan `#[contractimpl]` memasang
`#[cfg_attr(target_family = "wasm", export_name = "…")]` di tiap entry point. Menautkan rlib
kontrak lain ke cdylib langsung gagal:

```
warning: Linking globals named '__constructor': symbol multiply defined!
error: failed to load bitcode of module "event_registry.…-cgu.0.rcgu.o"
```

Untuk cross-call pakai `#[contractclient]` lokal (lihat `contracts/race_record/src/registry.rs`)
atau `contractimport!`. Crate kontrak lain **hanya** boleh masuk `[dev-dependencies]`, untuk test.

## Caveat auth di test (soroban-sdk 26.1.1)

`mock_all_auths()` memakai *recording* auth mode, di mana `require_auth` pada root frame dipenuhi
untuk address apa pun — **termasuk contract address**. Jadi `mock_all_auths()` **tidak bisa**
membuktikan gate auth di root frame (mis. gate invoker-contract `reserve_slot`). Untuk tiap
assertion gate auth pakai `env.mock_auths(&[...])` (enforcing).

## Sebelum bilang "selesai"

1. `cargo test` hijau (positive + negative + edge, tiap revert path punya test sendiri).
2. `./scripts/check-exports.sh` hijau.
3. `node scripts/check-interface.mjs` hijau — kalau merah, **jangan edit `INTERFACE.md` supaya
   cocok**; itu spec beku. Lihat `docs/specs/CLAUDE.md`.
4. Coverage gate hijau.
5. `cargo clippy --all-targets -- -D warnings` dan `cargo fmt --all -- --check` bersih.

CI (`.github/workflows/contracts.yml`) menjalankan kelimanya. Jalankan lokal dulu — run CI 4–5
menit, siklus lokal 30 detik.
