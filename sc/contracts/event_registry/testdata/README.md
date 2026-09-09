# `testdata/` — the wasm the upgrade replaces

One file, and it is not a build artifact of this repo:

| File | sha256 | What it is |
| --- | --- | --- |
| `event_registry_live_pre_allowlist.wasm` | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | EventRegistry v2.0.1, the executable running at `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` before STE-36 |

Diambil apa adanya dari testnet:

```bash
stellar contract fetch \
  --id CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU \
  --network testnet \
  --out-file sc/contracts/event_registry/testdata/event_registry_live_pre_allowlist.wasm
```

## Kenapa di-commit, bukan di-fetch saat test jalan

`mod upgrade` yang lama men-deploy kontrak dari wasm hasil build lalu meng-`upgrade`
ke wasm yang **sama**. Itu membuktikan storage tidak hilang saat executable diganti,
tapi tidak membuktikan hal yang sebenarnya dipertaruhkan STE-36: bahwa state yang
ditulis kode **lama** tetap terbaca oleh kode **baru**. Untuk itu dibutuhkan dua wasm
yang benar-benar berbeda, dan yang "lama" harus artefak yang memang menulis event-event
yang sekarang hidup di chain — bukan salinan build hari ini.

Test-nya tidak menyentuh network (CI `contracts.yml` tidak punya akses testnet, dan
test yang butuh internet adalah test yang suatu hari merah karena RPC-nya down), jadi
byte-nya ikut di repo. `state_written_by_the_live_wasm_survives_the_allowlist_upgrade`
mem-verifikasi sendiri bahwa file ini asli: host meng-hash-nya saat upload dan hasilnya
dibandingkan dengan hash di tabel atas — hash yang sama yang dilaporkan ledger untuk
`CAPB6NQP…` dan yang dibekukan `docs/specs/INTERFACE.md` §0.

## Kapan file ini diganti

Hanya setelah upgrade in-place berikutnya benar-benar mendarat di testnet: fetch ulang,
perbarui hash di tabel ini **dan** `LIVE_PRE_ALLOWLIST_HASH` di `src/test.rs`. Jangan
menggantinya dengan hasil `stellar contract build` lokal — begitu file ini jadi salinan
build sekarang, test-nya berhenti membuktikan apa pun.
