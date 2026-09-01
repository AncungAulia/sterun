# `docs/specs/` — spec BEKU (CLAUDE.md)

**Semua yang ada di folder ini sudah dibekukan.** Ini *handoff contract* C4 (STE-10): yang dipegang
**James** (backend + indexer) dan **Ancung** (web app + QR pass + scanner PWA) supaya bisa jalan
paralel tanpa membaca `lib.rs` siapa pun. Versi folder sekarang: **v1.0.1**.

| File | Isi |
| --- | --- |
| `INTERFACE.md` | signature fungsi + siapa yang authorize + error yang mungkin, layout `#[contractevent]` (topic vs data), kedua enum error + band, wasm hash, alamat SAC sUSD |
| `HASH_AND_TOTP.md` | `participant_hash` + TOTP + payload QR, **byte-exact** |
| `vectors/` | test vector JSON — **artefak beku** |
| `reference/node/`, `reference/rust/` | dua implementasi referensi yang wajib sepakat |
| `verify.sh` | menjalankan keduanya, gagal keras kalau tidak sepakat |
| `CHANGELOG.md` | riwayat versi + **aturan perubahan** |

## Aturan nomor satu

Kalau kode dan dokumen ini berbeda, **dokumen ini yang benar**, dan perbedaannya itu sendiri
sebuah bug. Jangan pernah mengedit `INTERFACE.md` supaya cocok dengan wasm yang baru — arah
perbaikannya kebalikannya.

Dijaga mekanis oleh `node sc/scripts/check-interface.mjs`, yang mem-*diff* tiga sisi: wasm hasil
build, tabel di `INTERFACE.md`, dan `sc/bindings/*/src/index.ts`. Jalan di CI tiap push.

## Cara mengubah spec (kalau memang harus)

Berlaku untuk perubahan **signature fungsi**, **layout `#[contractevent]`**, **kode error**, atau
**definisi hash/TOTP**:

1. **PR baru**, approval **@Axel (PM) + @fable**. Tidak ada self-merge untuk perubahan spec —
   ini satu-satunya pengecualian dari workflow merge-langsung di `CLAUDE.md` root.
2. **Entri di `CHANGELOG.md`**: versi baru, tanggal, apa yang berubah, alasannya, dampaknya ke
   data yang sudah ada dan client yang sudah jalan.
3. **Regenerate TS bindings** (`sc/bindings/`, prosedur di `sc/bindings/README.md`).
4. `bash docs/specs/verify.sh` hijau **dan** `cd sc && cargo test` hijau.
5. Kalau ada **vector lama yang nilainya berubah**, sebut **eksplisit** di entri changelog.

**Vector tidak pernah di-regenerate diam-diam supaya test lewat.** Vector adalah artefak beku;
kalau implementasi tidak setuju dengannya, implementasinya yang salah sampai terbukti sebaliknya.

## Dua hal yang tidak boleh terjadi, titik

- **Kode error tidak pernah di-renumber.** `ScError` Soroban cuma `u32` tanpa identitas kontrak,
  jadi angkanya sendiri yang menjadi kontrak. Nomor varian yang dihapus tidak boleh dipakai ulang.
  Varian baru ambil nomor bebas berikutnya di band-nya (`1..=99` C1, `100..=199` C2, `200+` OZ).
- **Definisi hash tidak diubah dengan patch.** Mengubahnya membatalkan **setiap**
  `participant_hash` yang sudah ada on-chain — record lama tidak bisa diverifikasi ulang. Itu
  minimal MAJOR, plus rencana migrasi tertulis.

## Versi per file

Versinya satu untuk seluruh folder; judul tiap file membawa versi di mana **file itu** terakhir
berubah. Jadi `INTERFACE.md (v1.0.0)` di sebelah `HASH_AND_TOTP.md (v1.0.1)` itu disengaja: berarti
dokumen interface-nya memang belum tersentuh sejak pembekuan. Yang berlaku selalu entri paling
atas di `CHANGELOG.md`.

## Verifikasi

```bash
bash docs/specs/verify.sh          # dua implementasi referensi harus sepakat
node sc/scripts/check-interface.mjs # wasm ↔ INTERFACE.md ↔ bindings
cd sc && cargo test                 # termasuk test yang membaca vectors/ yang sama
```

Ketiganya jalan di CI. `reference/node/` sengaja **nol dependency npm** dan `reference/rust/`
adalah crate berdiri sendiri (`[workspace]` sendiri, **bukan** member `sc/`) — supaya keduanya
benar-benar independen dan kesepakatannya bermakna.
