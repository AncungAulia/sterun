# sc/ — Sterun Soroban contracts

Cargo workspace untuk kontrak Sterun (Stellar/Soroban, Rust `#![no_std]`, target `wasm32v1-none`).

| Contract | Ticket | Deskripsi |
|---|---|---|
| `contracts/event_registry` | STE-5 (C1) | Registry event, kategori, kuota, harga sUSD, scanner allowlist, `reserve_slot` |
| `contracts/race_record` | STE-9 (C2) | Record lari non-transferable + lifecycle (belum ada) |

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
cargo test                        # unit + integration test
cargo llvm-cov --summary-only     # coverage (target >80%)
```
