# `be/` — backend Node/TS (CLAUDE.md)

API + helper Stellar + **PII vault**. Owner: **James**. Komponen C7 (PII vault + API) dan C8
(indexer + TTL keeper, STE-16 — belum ada).

## Stack (sudah dipilih, jangan diputuskan ulang tanpa alasan)

| Bagian | Pilihan | Kenapa |
| --- | --- | --- |
| Runtime | Node ≥ 22 (dipakai 24), ESM (`"type": "module"`) | Next.js dan bindings juga ESM |
| Framework | **Fastify 5** | ringan, TS-first, schema validation bawaan |
| Stellar | `@stellar/stellar-sdk` ^17 | mayor terbaru; be/ bicara langsung ke testnet protocol 26 |
| Database | **Postgres 17** + `pg`, tanpa ORM | yang dilakukan service ini ke DB cuma segelintir statement tangan; ORM menambah lapisan mapping dan SQL kejutan tanpa imbalan |
| Migrasi | script sendiri (~60 baris) di `src/db/migrate.ts` | urut nama, sekali jalan, dalam transaksi, sha256 dicatat; framework menambah DSL dan mode gagal untuk fitur yang tidak dipakai |
| Test | **Vitest** | cepat, ESM native, `inject()` Fastify tanpa buka socket |
| Lint | ESLint 10 flat config + typescript-eslint | |
| Build | `tsc` ke `dist/`, `tsx` untuk dev/CLI | |

`tsconfig.json` sengaja ketat: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`. `pnpm typecheck` mengecek **src + test** (dua tsconfig) — Vitest cuma
mentranspilasi test, tidak mengecek tipenya.

```bash
docker compose up -d postgres   # dari root — Postgres di :55432
cp be/.env.example be/.env      # isi DATABASE_URL + PII_KEYS
pnpm --filter be dev            # atau `pnpm dev` dari root
pnpm --filter be test           # test DB di-skip kalau DATABASE_URL kosong
pnpm --filter be lint
pnpm --filter be typecheck
pnpm faucet --new               # dari root
```

Test yang butuh database **di-skip** lokal kalau `DATABASE_URL` kosong (dengan instruksinya), tapi
**gagal keras** kalau `CI` di-set. Suite yang diam-diam melewati test terpentingnya lebih buruk
daripada tidak ada suite.

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

**4. Secret cuma di `be/.env`.** `SUSD_DISTRIBUTOR_SECRET` bisa memindahkan seluruh supply test;
`PII_KEYS` membuka seluruh PII. `.env` di-gitignore, `.env.example` yang di-commit. Jangan pernah
menaruh `S...` atau kunci PII di file lain, di tiket, di chat, atau di log.

**5. Response tidak boleh bisa membawa PII.** Tiap response punya JSON schema eksplisit dengan
`additionalProperties: false`. Fastify men-serialisasi **hanya** properti yang disebut schema, jadi
field yang tidak ada di schema **tidak bisa** sampai ke client walaupun ada di object-nya. Ini
kontrol keamanan, bukan dokumentasi — dan ada test yang membaca schema-nya untuk membuktikan tidak
satu pun bisa mengekspresikan `name`/`national_id`/`emergency_contact`.

**6. `removeAdditional` dimatikan.** Default Fastify diam-diam **membuang** field yang tidak dikenal
schema. Untuk API yang dipakai orang lain, itu mengubah typo nama field jadi request yang sukses
sambil membuang sesuatu yang dikira terkirim. Sekarang `additionalProperties: false` berarti **400**.

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

## PII vault (STE-11)

Aturan produknya: **PII masuk, dan tidak pernah keluar.** Tidak ada method di `Vault` yang
mengembalikan nama, NIK, atau kontak — bukan karena belum sempat, tapi karena tidak ada bagian
desain Sterun yang perlu membacanya. Yang dibutuhkan hilir cuma hash (on-chain), `totp_secret`
(roster bundle STE-16), dan tautan baris vault ↔ `token_id`.

`decryptForAudit` satu-satunya pengecualian, dan sengaja dinamai bikin tidak nyaman. Dia ada supaya
"kita enkripsi" jadi klaim yang bisa dites, dan supaya permintaan akses data yang sah punya jalur
yang terdefinisi. **Tidak terhubung ke route mana pun.**

Enkripsi: AES-256-GCM level aplikasi, kunci bernomor (`PII_KEYS`), AAD `"<kolom>:<row uuid>"` yang
mengikat tiap ciphertext ke barisnya — tanpa itu, siapa pun yang bisa menulis ke DB bisa memindahkan
nama terenkripsi orang A ke baris orang B dan decrypt-nya tetap sukses.

**Custody kunci, prosedur rotasi, dan dampak kalau DB bocor: [`OPERATIONS.md`](OPERATIONS.md).**
Baca sebelum menyalakan ini di mana pun selain laptop sendiri.

Auth: signature wallet Stellar (challenge → sign → spend). Nonce sekali pakai, kedaluwarsa 2 menit,
terikat ke satu address. **Store-nya masih in-memory** — aman untuk satu proses, tidak aman untuk
dua; STE-31 wajib memindahkannya sebelum ada instance kedua.

> Jebakan yang pasti kena client: `Keypair.sign()` mengembalikan `Uint8Array`, dan
> `Uint8Array.toString("base64")` **mengabaikan argumennya** — hasilnya `"12,34,56,…"`. Bungkus:
> `Buffer.from(kp.sign(msg)).toString("base64")`. Server menjawabnya dengan `malformed-signature`
> yang menyebut perbaikannya, bukan `bad-signature` yang menyuruh orang mencurigai kuncinya.

## Test

172 test (`pnpm --filter be test`; 37 di antaranya butuh Postgres), dan sebagian besar kasus
negatif — di situ kerusakannya.
Tidak ada network call di test: `/health` sengaja tidak menyentuh Horizon (health check yang
memanggil layanan orang lain melaporkan outage mereka sebagai outage kita), dan perilaku live
faucet dibuktikan manual lalu dicatat di `docs/deployments.md`.

Tiap tiket berikutnya: **e2e + edge + positive + negative**, sama seperti sisi kontrak.

## Yang belum ada (jangan diasumsikan sudah)

Indexer + TTL keeper (STE-16), roster bundle, rate limit, job re-encrypt untuk rotasi kunci, nonce
store yang tahan multi-instance, dan deploy ke VPS (STE-31). Daftar lengkapnya di bagian akhir
[`OPERATIONS.md`](OPERATIONS.md). Perbarui file ini begitu salah satunya mendarat.
