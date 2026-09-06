# `be/` — backend Node/TS (CLAUDE.md)

API + helper Stellar + **PII vault** + **indexer** + **TTL keeper** + **results review**.
Owner: **James**. Komponen **C7** (PII vault + API, STE-11; results CSV + hardening, STE-20) dan
**C8** (indexer, TTL keeper, roster bundle, STE-16).

Tiga proses, satu paket. Yang mana yang jalan ditentukan oleh perintah yang kamu ketik, bukan flag:

| Proses | Perintah | Tugasnya |
| --- | --- | --- |
| API | `pnpm dev` | melayani vault, directory/history, roster bundle, review hasil |
| Poller | `pnpm indexer follow` | `getEvents` → Postgres |
| Keeper | `pnpm keeper run` | bayar sewa record supaya tidak ter-archive (cron mingguan) |

API **melayani** index; dia tidak mengisinya. Kalau `/events` kosong, yang belum jalan adalah
poller-nya. Operasional lengkap (rebuild, runbook restore, format roster): [`OPERATIONS.md`](OPERATIONS.md).

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
pnpm indexer follow             # poller (STE-16); `poll`, `rebuild`, `doctor`, `status`
pnpm keeper scan                # TTL keeper dry run; `run`, `report`, `restore`
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

> Satu-satunya turunan nama yang keluar dari vault adalah **`name_fragment`** di roster bundle
> (STE-16): nama depan utuh + inisial sisanya, dihitung sekali saat submit dan **itu** yang
> disimpan, terenkripsi dengan AAD per-baris yang sama. Bukan nama yang dikaburkan — informasinya
> memang sudah tidak ada di sana. Alasannya, batasannya, dan siapa yang boleh mengunduhnya:
> [`OPERATIONS.md`](OPERATIONS.md) bagian roster bundle.

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

`test/response-schemas.test.ts` menjalankan itu ke **seluruh** API sekaligus, jadi router baru ikut
terjaga tanpa menambah test. Konsekuensi yang kelihatan aneh sampai kamu tahu alasannya: nama event
on-chain dikirim sebagai **`event_name`**, bukan `name`. Satu aturan tanpa pengecualian bisa
diperiksa; aturan dengan daftar "yang ini `name` boleh" berhenti menangkap apa pun.

**5b. Nilai yang tidak muat di JSON number dikirim sebagai string.** `starts_at`, `entered_at`,
`price_stroops`, dan kawan-kawannya adalah u64/i128. Ada test yang membaca schema-nya dan menolak
`type: "integer"` untuk field-field itu.

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

## Memanggil kontrak

Ada **dua** jalur, dan yang mana dipakai bukan selera:

| Jalur | Dipakai oleh | Kenapa |
| --- | --- | --- |
| `@stellar/stellar-sdk` ^17 langsung (`src/chain/`) | faucet (STE-6), indexer + keeper (STE-16) | satu versi SDK di dalam proses yang jalan terus, dan tidak menambah langkah build ke CI TS |
| bindings di `sc/bindings/` lewat `file:` | `SterunClient` (STE-15) | tidak mengetik ulang signature kontrak untuk konsumen D2/D3 |

Alasan indexer **tidak** memakai bindings, ditulis supaya tidak dibahas ulang: bindings menyematkan
`@stellar/stellar-sdk ^14.6.1` (dua RPC client dalam satu proses), `dist/`-nya tidak di-commit
sehingga butuh `npm install && npm run build` di dua paket lagi — langkah yang tidak dimiliki
`typescript.yml` dan tidak pantas ditambahkan hanya supaya indexer bisa membaca sebuah struct — dan
yang dibutuhkan indexer cuma **bentuk** empat return value, yang dicek `src/chain/decode.ts` lebih
ketat daripada parser hasil generate.

```json
{ "dependencies": { "race-record": "file:../sc/bindings/race-record" } }
```

Detail + tiga jebakan pertama: [`sc/bindings/README.md`](../sc/bindings/README.md).

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
terikat ke satu address.

**Store-nya sekarang bisa dua-duanya** (STE-31): `MemoryNonces` untuk satu proses, `PostgresNonces`
untuk lebih. Entry point memilih berdasarkan ada-tidaknya pool. Sifat sekali-pakai lintas instance
dijaga `DELETE … RETURNING` — satu statement atomik; read-then-delete meninggalkan celah, dan di
belakang load balancer dua statement itu ada di mesin berbeda.

> Jebakan yang pasti kena client: `Keypair.sign()` mengembalikan `Uint8Array`, dan
> `Uint8Array.toString("base64")` **mengabaikan argumennya** — hasilnya `"12,34,56,…"`. Bungkus:
> `Buffer.from(kp.sign(msg)).toString("base64")`. Server menjawabnya dengan `malformed-signature`
> yang menyebut perbaikannya, bukan `bad-signature` yang menyuruh orang mencurigai kuncinya.

## Indexer, TTL keeper, roster (STE-16, C8)

Aturan pokoknya satu: **chain sumber kebenaran, ini cache.** Tidak ada apa pun di Postgres yang jadi
satu-satunya salinan, dan itulah yang membuat `pnpm indexer rebuild` mungkin — truncate semua tabel
materialisasi, jalan ulang dari **state** kontrak, dan index-nya utuh lagi. Jalur itu ada karena RPC
testnet cuma menyimpan jendela `getEvents` terbatas; desain yang butuh replay event akan berjarak
satu minggu buruk dari index yang tidak bisa diperbaiki.

Empat hal yang akan bikin bingung kalau tidak disebut:

1. **`source` di tiap baris bukan hiasan.** `'event'` = poller melihatnya terjadi (ada ledger + tx
   hash). `'state'` = rebuild membacanya dari storage: sama benarnya, tanpa provenance.
2. **Event tidak pernah dipercaya sendirian.** `EventCreated` tidak membawa nama, `CategoryAdded`
   tidak membawa jarak, `RecordEntered` tidak membawa kategori. Yang kurang dibaca ulang dari
   kontrak, dan yang dibawa event **dicocokkan** dengan hasil bacaan itu. Beda = `throw`, bukan
   pilih salah satu.
3. **Filter per contract id, bukan per nama topic** (`INTERFACE.md` §2.3). `getEvents` itu feed
   publik; siapa pun bisa men-deploy kontrak yang memancarkan topic `record_entered`.
4. **Keeper memperpanjang ledger key, bukan memanggil `extend_record_ttl`.** Fungsi kontrak itu
   tidak menyentuh entry `Owner` milik OpenZeppelin, dan record yang entry `Owner`-nya ter-archive
   tetap mematahkan `verify` dan `records_of`. Key-nya didapat dari footprint hasil simulasi, bukan
   disusun tangan.

Threshold TTL **wajib sama** dengan `BUMP_THRESHOLD` di `sc/contracts/race_record/src/lib.rs`
(120 hari). Tapi target perpanjangannya **satu ledger di bawah** `BUMP_TO` (3.110.399, bukan
3.110.400): `ExtendFootprintTTLOp` menolak angka batasnya sebagai malformed, sementara host function
`extend_ttl` yang dipakai kontrak justru meng-clamp ke situ. Beda satu ledger itu disengaja dan ada
komentarnya di `src/keeper/ttl.ts` — jangan "dibetulkan" biar cocok.

## `be/.env` benar-benar dibaca sekarang

`src/env.ts` memuat `be/.env` di tiap entry point (API + kedua CLI). Sebelumnya tidak ada yang
membacanya sama sekali, padahal dokumennya sejak STE-6 menyuruh `cp .env.example .env` — secret-nya
nangkring di file dan prosesnya jalan tanpa itu, persis kelihatan seperti kunci yang salah.

Dua aturannya: **env var asli selalu menang** (CI dan systemd yang menentukan, bukan `.env` basi di
laptop yang sama — ini kebalikan dari `process.loadEnvFile()`), dan **file yang tidak ada bukan
error** (clone baru harus tetap bisa start). Tidak dipanggil dari `config.ts`: modul itu tetap murni
supaya test menyuntikkan environment, bukan mewarisi `.env` developer.

## Test

586 test (`pnpm --filter be test`; sebagian butuh Postgres), dan sebagian besar kasus
negatif — di situ kerusakannya.
Tidak ada network call di test: `/health` sengaja tidak menyentuh Horizon (health check yang
memanggil layanan orang lain melaporkan outage mereka sebagai outage kita), dan perilaku live
faucet + indexer + keeper dibuktikan manual lalu dicatat di `docs/deployments.md`.

Yang dipalsukan hanya **network**, tidak pernah kode kita: `test/helpers/fake-chain.ts` meng-implement
`ContractCaller` dan menjawab dengan `xdr.ScVal` sungguhan dalam bentuk yang dibekukan
`INTERFACE.md`, jadi decoder, reader, indexer, dan keeper jalan apa adanya di atasnya.

Tiap file test dapat **schema Postgres sendiri** (`freshDatabase()`). Vitest menjalankan file secara
paralel dan test-test ini men-truncate tabel; berbagi `public` bikin suite yang gagal satu dari lima
run, dan suite begitu berhenti dibaca orang.

Tiap tiket berikutnya: **e2e + edge + positive + negative**, sama seperti sisi kontrak.

## Results CSV (STE-20, C7)

`POST /events/:eventId/results/preview` — organiser upload CSV, dapat preview + anomali per baris.
Service ini **tidak menandatangani apa pun**: yang boleh mem-publish hasil adalah organiser, dan
kuncinya harus tetap di perangkat organiser, bukan jadi kunci yang dipegang server ini.

Alasan seluruh langkah review ini ada: `record_finish` memindahkan record ke `Finished` yang
**terminal**. Waktu yang salah dan terlanjur ter-publish tidak bisa dikoreksi oleh siapa pun.

**Bib TIDAK unik dalam satu event.** `reserve_slot` mengembalikan `entered_count` milik
**kategori**, jadi 5K dan 10K di event yang sama sama-sama mulai dari bib 0. CSV `(bib_no,
finish_time)` — persis bentuk yang disebut tiket — jadi ambigu begitu event punya dua kategori.
Karena itu ada kolom opsional `category_id`, bib telanjang cuma di-resolve kalau **tepat satu**
kategori mengklaimnya, sisanya jadi anomali `ambiguous_bib`. Menebak di sini berarti mem-publish
waktu pelari lain ke record seseorang, permanen.

Tujuh anomali, dan `severity`-nya lebih penting daripada jumlahnya:

| severity | artinya |
| --- | --- |
| `reverts` | chain menolak baris itu; biayanya satu transaksi gagal (`unknown_bib`, `not_claimed`, `already_final`) |
| `wrong` | chain **menerimanya** dan hasilnya bohong selamanya (`ambiguous_bib`, `impossible_time`, `duplicate_bib`, `malformed_row`) |

Parser-nya longgar soal **bentuk**, ketat soal **makna**: `52:41`, `1:02:41`, `3161`, `3161.4`
semuanya diterima, header `Bib No`/`chip_time`/`;` sebagai delimiter juga. Membaca `52:41` sebagai
5241 detik = hasil meleset 35 menit yang tidak bisa ditarik. Pecahan detik di-**truncate**, bukan
dibulatkan — membulatkan berarti mengarang waktu yang tidak pernah dicatat.

`source_sha256` di response adalah hash byte yang **persis** diunggah, dihitung sebelum parsing.
Itu yang dicatat di event metadata supaya hasil yang ter-publish tetap tamper-evident
(SYSTEM_DESIGN §11 risiko 4).

```bash
pnpm --filter be e2e:results   # butuh DATABASE_URL + PII_KEYS; bikin event baru di testnet
```

## Hardening (STE-20)

**Satu bentuk error untuk seluruh API**, dari satu root handler di `src/http/errors.ts`:

```json
{ "error": "<kode kebab stabil>", "message": "<kalimat>", "details": [...] }
```

`error` milik mesin dan tidak pernah berubah untuk kondisi yang sama; `message` milik manusia dan
boleh ditulis ulang. Handler per-router sudah **dihapus** — dulu ada tiga bentuk beredar, salah
satunya `{"error": "Bad Request"}` bawaan Fastify yang isinya reason phrase HTTP, jadi client yang
mem-branch ke situ mem-branch ke string yang berubah mengikuti status code.

Kode error sekarang **kebab-case semua**. `AuthError` memang sudah kebab (`unknown-nonce`),
router-nya snake (`not_found`) — client harus tahu dua konvensi.

**500 tidak membocorkan apa pun.** Teks exception membawa path file, potongan SQL, dan kadang nilai
yang menyebabkan kegagalan — di service yang memegang dokumen identitas, itu persis yang tidak boleh
sampai ke response body. Isinya kalimat tetap + `x-request-id` untuk dikutip; error aslinya masuk log.

**Rate limit** per-endpoint sesuai biayanya: 240/menit global, 30 untuk `/auth/challenge`, 10 untuk
upload hasil. Key-nya hop pertama `x-forwarded-for` — di belakang reverse proxy (STE-31) semua
request datang dari satu socket, dan tanpa itu satu client berisik akan mengunci seluruh event.
**Mati saat `NODE_ENV=test`** supaya suite tidak gagal di request ke-241 karena alasan yang tidak
ada hubungannya.

**Log me-redact** `x-sterun-signature` dan `x-sterun-nonce`, dan membuang query string (bisa membawa
address).

**OpenAPI di `/openapi.json`**, di-generate dari schema yang sama yang dipakai Fastify untuk
validasi dan serialisasi — jadi dia tidak bisa mendeskripsikan endpoint yang perilakunya berbeda.

> Jebakan Fastify yang menghabiskan waktu dan sudah ada komentarnya di `src/server.ts`: route yang
> didaftarkan **sinkron** ter-mount sebelum plugin yang di-`register` sempat memasang hook
> `onRoute`-nya. Akibatnya `/health` dan `/config` tidak terlihat oleh swagger. Semua route sekarang
> lewat `register`.

## Deploy (STE-31)

`compose.prod.yml` di root: Postgres + API + poller + keeper + Caddy (TLS otomatis lewat ACME, tanpa
cron renewal yang bisa diam-diam berhenti bekerja). Tiga service Node-nya **image yang sama dengan
perintah berbeda** — memang begitu bentuknya.

Dua hal yang layak diingat:

- **`/health` vs `/ready`.** `/health` sengaja tidak menyentuh apa pun (liveness probe yang memanggil
  dependency melaporkan outage orang lain sebagai outage kita). `/ready` mengecek database dan
  menjawab 503 kalau tidak bisa. Caddy mengawasi yang kedua, Docker yang pertama.
- **Postgres tidak punya `ports:`.** Satu baris yang menahan kesalahan firewall menaruh database PII
  di internet publik.

`docs/deployments.md` **ikut masuk image**: `src/deployments.ts` mem-parse-nya untuk alamat kontrak,
jadi aturan "alamat tidak pernah di-hardcode" tetap berlaku di dalam container.

Verifikasi dari luar tanpa SSH: `./deploy/verify-deployment.sh https://…` — 13 cek, termasuk bahwa
endpoint sensitif tetap 401. Prosedur lengkap: [`OPERATIONS.md`](OPERATIONS.md) bagian "Deploy ke VPS".

## Yang belum ada (jangan diasumsikan sudah)

Job re-encrypt untuk rotasi kunci, alert kalau keeper berhenti, replica API kedua (mungkin sekarang,
belum diuji di bawah load nyata), dan backup Postgres terjadwal. Daftar lengkapnya di bagian akhir
[`OPERATIONS.md`](OPERATIONS.md). Perbarui file ini begitu salah satunya mendarat.
