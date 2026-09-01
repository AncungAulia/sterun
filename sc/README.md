# sc/ — Sterun Soroban contracts

Cargo workspace untuk kontrak Sterun (Stellar/Soroban, Rust `#![no_std]`, target `wasm32v1-none`).

| Contract | Ticket | Deskripsi |
|---|---|---|
| `contracts/event_registry` | STE-5 (C1) | Registry event, kategori, kuota, harga sUSD, scanner allowlist, `reserve_slot` |
| `contracts/race_record` | STE-9 (C2) | Record lari **non-transferable** + lifecycle (`Entered` → `RacepackClaimed` → `Finished`/`Dnf`), `enter` atomik (kuota + bayar sUSD + mint dalam satu invocation), `extend_record_ttl` permissionless |

## Spec BEKU (STE-10) — baca sebelum konsumsi kontrak ini

Interface kedua kontrak, layout event, dan kode error **sudah dibekukan** di
`docs/specs/` (beku sejak v1.0.0, 2026-08-31; folder sekarang di **v1.0.1** — patch dokumen,
nol perubahan perilaku). Kalau kamu bikin backend, indexer, SDK, atau
frontend, itu sumber kebenarannya — bukan file `lib.rs` ini:

| File | Isi |
| --- | --- |
| [`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md) | signature fungsi + siapa yang authorize + error yang mungkin, layout `#[contractevent]` (topic vs data), kedua enum error + band, wasm hash, alamat SAC sUSD |
| [`docs/specs/HASH_AND_TOTP.md`](../docs/specs/HASH_AND_TOTP.md) | `participant_hash` + TOTP + payload QR, **byte-exact** |
| [`docs/specs/vectors/`](../docs/specs/vectors/) | test vector JSON |
| [`docs/specs/reference/`](../docs/specs/reference/) | 2 implementasi referensi (Node + Rust) yang wajib sepakat |
| [`docs/specs/CHANGELOG.md`](../docs/specs/CHANGELOG.md) | riwayat versi + **aturan perubahan** |

```bash
bash ../docs/specs/verify.sh   # dari sc/ — kedua implementasi referensi harus sepakat
```

Mengubah signature fungsi, layout event, kode error, atau definisi hash/TOTP
butuh **PR baru + approval @Axel + @fable + entri di CHANGELOG + regenerate TS
bindings (STE-14)**. Kode error adalah ABI publik: **jangan pernah di-renumber.**

Test `spec_vectors::host_sha256_matches_every_participant_hash_vector` dan
`spec_vectors::every_participant_hash_vector_is_accepted_by_enter_and_verify`
di `contracts/race_record/src/test.rs` membaca file vector yang sama, jadi
kalau spec dan kontrak pernah berpisah jalan, `cargo test` yang gagal duluan.

## Versi (pinned EXACT)

- `soroban-sdk = "=26.1.1"` — **protocol 26**, bukan 27/28.
  Alasan: crate OpenZeppelin `stellar-tokens` / `stellar-access` / `stellar-contract-utils` /
  `stellar-macros` versi terbaru (`0.7.2`, per 2026-08-31) mensyaratkan `soroban-sdk ^26.1.0`.
  Naikkan ke 27 hanya setelah OZ merilis versi yang kompatibel.
- OZ crates `= "0.7.2"` di `[workspace.dependencies]`.

## Artefak build (STE-14)

`stellar contract build` di `sc/` menghasilkan dua wasm. Ini yang akan di-deploy
STE-33, dan yang menjadi sumber TS bindings di [`bindings/`](bindings/):

| Kontrak | Wasm | sha256 | Ukuran |
| --- | --- | --- | ---: |
| EventRegistry (C1) | `target/wasm32v1-none/release/event_registry.wasm` | `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` | 14.964 B |
| RaceRecord (C2) | `target/wasm32v1-none/release/race_record.wasm` | `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` | 19.435 B |

Toolchain yang menghasilkan angka di atas:

| | Versi |
| --- | --- |
| `rustc` | 1.93.0 (254b59607 2026-01-19) |
| `stellar` CLI | 27.0.0 |
| `soroban-sdk` | `=26.1.1` (pinned, lihat di atas) |
| OZ `stellar-tokens` dkk | `=0.7.2` (pinned) |
| target | `wasm32v1-none`, profil `release` dari `Cargo.toml` |

Cek ulang tanpa Stellar CLI — `stellar contract info hash` mengembalikan sha256
biasa dari file wasm, jadi `shasum` sudah cukup:

```bash
shasum -a 256 target/wasm32v1-none/release/*.wasm
```

### Yang reproducible: interface-nya, bukan byte-nya

**Jangan berasumsi hash di atas akan sama persis di mesin kamu.** Build Rust
tidak bit-for-bit reproducible lintas mesin, versi toolchain, dan path — dan
`docs/specs/INTERFACE.md` §0 sudah menyatakan itu terbuka-terbukaan. Hash ada
supaya ada satu artefak konkret yang bisa ditunjuk dan dibandingkan orang lain,
bukan sebagai janji determinisme.

Ini bukan kehati-hatian teoretis, dan tidak seragam. Run CI pertama
(`ubuntu-24.04`, toolchain sama persis) menghasilkan:

| Kontrak | macOS (tabel di atas) | Linux CI | Sama? |
| --- | --- | --- | --- |
| `race_record.wasm` | `75d38045…07919f` | `75d38045…07919f` | ya |
| `event_registry.wasm` | `61d85dd5…578474` | `ed6c552a…7f80e8` | **tidak** |

Satu wasm identik, satunya tidak, dari commit dan toolchain yang sama. Itulah
alasan `check-interface.mjs` memperlakukan beda hash sebagai **WARN** dan beda
*interface* sebagai **FAIL**: yang pertama bergantung pada mesin, yang kedua
tidak. Deploy STE-33 karena itu mencatat hash artefak yang **benar-benar
di-upload**, bukan mengasumsikan hash di tabel ini.

Yang **wajib** sama dan dijaga mekanis adalah **isi interface**-nya. Itu tugas:

```bash
node scripts/check-interface.mjs      # butuh `stellar contract build` dulu
```

Script itu membaca tiga sisi dan mem-*diff* ketiganya:

1. `stellar contract info interface --output json` dari wasm yang barusan di-build,
2. tabel beku di `docs/specs/INTERFACE.md` (signature + argumen + tipe return,
   kode error, layout event, field tipe),
3. `bindings/*/src/index.ts` hasil generate.

Beda signature, kode error yang di-renumber, field event yang pindah dari topic
ke data, atau fungsi baru yang belum didokumentasikan = **exit non-zero**.
Perbedaan hash wasm cuma **WARN**, dengan alasannya dicetak. Itu jaminan yang
jujur: bentuknya reproducible, byte-nya tidak.

## Perintah

```bash
cd sc
stellar contract build            # -> target/wasm32v1-none/release/*.wasm
cargo test                        # unit + integration test (butuh build di atas, lihat catatan)
cargo clippy --all-targets -- -D warnings
cargo fmt --all
cargo llvm-cov --summary-only     # coverage (floor 80%)
./scripts/check-exports.sh        # WAJIB sebelum PR/deploy — lihat di bawah
node scripts/check-interface.mjs  # WAJIB — spec beku vs wasm vs bindings
```

Dua script Node di `scripts/` adalah gerbang yang sama yang dipakai CI:

```bash
node scripts/check-interface.mjs               # butuh `stellar contract build` dulu

cargo llvm-cov --no-report                     # coverage, tiga langkah
cargo llvm-cov report --json --summary-only --output-path target/coverage.json
node scripts/coverage-gate.mjs target/coverage.json
```

`coverage-gate.mjs` mencetak tabel Markdown dan **exit non-zero** kalau
`lib.rs` salah satu kontrak turun di bawah 80% (region atau line). Yang di-gate
cuma dua `lib.rs` itu: coverage `test.rs` nyaris tak bermakna (kode test
meng-cover dirinya sendiri) dan `race_record/src/registry.rs` cuma deklarasi
trait `#[contractclient]` — input makro tanpa body, jadi llvm-cov selamanya
melaporkannya 0%. Keduanya tetap dicetak, tidak disembunyikan.

Mau bukti gerbangnya bukan hiasan? Naikkan ambangnya dan lihat dia merah:

```bash
COVERAGE_MIN=99 node scripts/coverage-gate.mjs target/coverage.json
```

## CI — `.github/workflows/contracts.yml`

Semua klaim di file ini diturunkan ulang dari sumbernya di mesin bersih tiap
push dan PR, dalam tiga job:

| Job | Yang dibuktikan |
| --- | --- |
| `contracts` | `cargo fmt --check`, `clippy -D warnings`, `stellar contract build`, `cargo test`, `check-exports.sh`, `check-interface.mjs`, lalu `cargo llvm-cov` lewat `coverage-gate.mjs` |
| `bindings` | kedua paket di `bindings/` `npm ci && npm run build` — compile apa adanya, tanpa edit tangan |
| `spec` | `bash ../docs/specs/verify.sh` — implementasi Node dan Rust sepakat di tiap vector beku |

Dua angka sengaja ditulis ke **job summary** (bukan cuma log), supaya bisa
dibaca orang yang tidak akan pernah meng-install Rust — mis. reviewer grant yang
cuma punya URL run-nya: **sha256 + ukuran tiap wasm**, dan **tabel coverage**
dengan lantai 80% ditandai.

Versi di workflow di-pin ke toolchain yang tercatat di atas: Rust `1.93.0`
(lewat `rustup` bawaan runner, tanpa action pihak ketiga), stellar CLI `27.0.0`
(lewat `stellar/stellar-cli@v27.0.0` — action itu membaca ref-nya sendiri untuk
memilih rilis, jadi ref itulah versinya), dan `cargo-llvm-cov 0.8.7`. Mengubah
salah satu angka di sana berarti mengubahnya di sini juga.

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
