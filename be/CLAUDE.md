# `be/` — backend Node/TS (CLAUDE.md)

API + helper Stellar. Owner: **James**. Komponen C7 (PII vault + API) dan C8 (indexer + TTL
keeper). Sekarang berisi skeleton dari **STE-6**; isi sesungguhnya menyusul di STE-11 dan STE-16.

## Stack (sudah dipilih, jangan diputuskan ulang tanpa alasan)

| Bagian | Pilihan | Kenapa |
| --- | --- | --- |
| Runtime | Node ≥ 22 (dipakai 24), ESM (`"type": "module"`) | Next.js dan bindings juga ESM |
| Framework | **Fastify 5** | ringan, TS-first, schema validation bawaan |
| Stellar | `@stellar/stellar-sdk` ^17 | mayor terbaru; be/ bicara langsung ke testnet protocol 26 |
| Test | **Vitest** | cepat, ESM native, `inject()` Fastify tanpa buka socket |
| Lint | ESLint 10 flat config + typescript-eslint | |
| Build | `tsc` ke `dist/`, `tsx` untuk dev/CLI | |

`tsconfig.json` sengaja ketat: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`. `pnpm typecheck` mengecek **src + test** (dua tsconfig) — Vitest cuma
mentranspilasi test, tidak mengecek tipenya.

```bash
pnpm --filter be dev        # atau `pnpm dev` dari root
pnpm --filter be test
pnpm --filter be lint
pnpm --filter be typecheck
pnpm faucet --new           # dari root
```

## Aturan yang tidak bisa ditawar

**1. Alamat Stellar TIDAK PERNAH di-hardcode.** Semuanya dibaca dari
[`docs/deployments.md`](../docs/deployments.md) lewat `src/deployments.ts`, boleh ditimpa env var.
Tidak ada fallback ketiga: dokumen tidak terbaca + env kosong = proses mati saat startup, bukan
jalan sambil menunjuk kontrak yang salah. Parser-nya sekalian mengecek konsistensi dokumen itu —
alamat SAC muncul di tiga tabel, ketiganya wajib sama.

**2. PII tidak pernah menyentuh chain.** On-chain cuma `participant_hash`. Nama, NIK, kontak
darurat: terenkripsi at rest, off-chain, tidak pernah masuk `uri`, tidak pernah masuk event.
Sesuatu yang bisa mengidentifikasi orang dan terlanjur masuk chain **tidak bisa dihapus**.

**3. Uang tidak pernah lewat float.** sUSD itu `i128` stroop, 7 desimal. Round-trip float untuk
0,1 sUSD meleset satu stroop, dan satu stroop meleset di biaya pendaftaran = `enter` gagal tanpa
penjelasan. Pakai `BigInt`; `parseFloat` diblokir eslint di paket ini.

**4. Secret cuma di `be/.env`.** `SUSD_DISTRIBUTOR_SECRET` bisa memindahkan seluruh supply test.
`.env` di-gitignore, `.env.example` yang di-commit. Jangan pernah menaruh `S...` di file lain.

## Kode error kontrak: pilih peta dari band-nya

`enter` cross-call ke EventRegistry **dan** SAC, dan revert mereka merambat apa adanya. `ScError`
cuma `u32` tanpa identitas kontrak, jadi angkanya yang menentukan:

| Band | Peta error yang benar |
| --- | --- |
| `1..=99` | `Errors` dari paket `event-registry` |
| `100..=199` | `Errors` dari paket `race-record` |
| `200..=214` | `NonFungibleTokenError` dari paket `race-record` |

`Error(Contract, #4)` dari `enter` **bukan** error RaceRecord — itu `EventNotOpen` milik
EventRegistry.

## Memanggil kontrak (mulai STE-15)

Bindings TS sudah di-generate dan di-commit di `sc/bindings/`. Pakai lewat `file:` dependency:

```json
{ "dependencies": { "race-record": "file:../sc/bindings/race-record" } }
```

Belum dipasang di STE-6 karena faucet cuma butuh operasi classic. Detail + tiga jebakan pertama:
[`sc/bindings/README.md`](../sc/bindings/README.md).

> **Seam yang perlu diingat:** bindings memakai `@stellar/stellar-sdk ^14.6.1` (output generator,
> jangan diedit), `be/` memakai ^17. Aman karena yang menyeberangi batas itu **string XDR**, bukan
> objek SDK — `signAndSend({ signTransaction })` menerima callback yang mengembalikan XDR
> ter-signed. Jangan mengoper objek `Transaction`/`Account` lintas batas itu.

## Kenapa faucet-nya ada

sUSD itu asset **classic**: akun tidak bisa memegangnya tanpa **trustline**. `RaceRecord.enter`
membayar lewat `transfer` di SAC, jadi runner tanpa trustline gagal di situ — dan karena `enter`
atomik, seluruh pendaftaran ter-rollback (kuota tidak terpakai, tidak ada mint). Benar secara
teknis, buruk sebagai pengalaman pertama. `pnpm faucet` menghapusnya.

Saldonya dibaca ulang lewat **SAC**, bukan Horizon. Itu satu-satunya bacaan yang membuktikan
sesuatu: `enter` memanggil `balance` di SAC, jadi itulah angka yang menentukan runner bisa bayar
atau tidak.

> Protocol 26 menambah fungsi `trust` di SAC yang memungkinkan kontrak membuka trustline sendiri.
> Memakainya berarti mengubah RaceRecord yang interface-nya **beku** v1.0.0 — itu PR spec-change
> (`docs/specs/CLAUDE.md`), bukan keputusan backend. Dicatat sebagai penyederhanaan v2.

## Test

57 test (`pnpm --filter be test`), dan sebagian besar kasus negatif — di situ kerusakannya.
Tidak ada network call di test: `/health` sengaja tidak menyentuh Horizon (health check yang
memanggil layanan orang lain melaporkan outage mereka sebagai outage kita), dan perilaku live
faucet dibuktikan manual lalu dicatat di `docs/deployments.md`.

Tiap tiket berikutnya: **e2e + edge + positive + negative**, sama seperti sisi kontrak.

## Yang belum ada (jangan diasumsikan sudah)

Database, autentikasi, PII vault (STE-11), indexer + TTL keeper (STE-16), roster bundle, deploy ke
VPS (STE-31). Perbarui file ini begitu salah satunya mendarat.
