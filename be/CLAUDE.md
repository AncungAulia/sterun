# `be/` — backend Node/TS (CLAUDE.md)

API + helper Stellar + **PII vault** + **indexer** + **TTL keeper** + **results review** +
**file metadata event**.
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

> **`maxLength` di response schema itu DOKUMENTASI, bukan penegakan.** Diuji, bukan diasumsikan:
> `fast-json-stringify` mengabaikannya saat serialisasi dan mengirim string apa adanya. Yang
> ditegakkan cuma **daftar propertinya** — field yang tidak disebut schema memang tidak bisa lewat.
> Panjangnya harus dibatasi di nilainya, sebelum masuk object response (`bounded()` di
> `routes/roster.ts`). Komentar lama di sana mengklaim sebaliknya; klaim keamanan yang dipercaya
> tapi tidak ada lebih buruk daripada yang diketahui tidak ada, karena tidak ada yang mencari
> penggantinya.

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

**Dua encoding tanda tangan diterima, dan itu bukan kelonggaran.** Script yang memegang keypair
menandatangani byte nonce langsung; browser tidak bisa, karena kuncinya ada di wallet dan wallet
menandatangani lewat **SEP-53** — yang ditandatangani adalah sha256 dari pesan di bawah prefix tetap
`Stellar Signed Message:`, bukan pesannya. Itu justru inti standarnya: yang di-approve user di popup
dijamin tidak pernah bisa sekaligus jadi transaksi yang sah. Jadi dapp tidak punya pilihan untuk
tidak memakainya, dan menerima cuma bentuk mentah berarti **tidak ada browser yang bisa login sama
sekali** — yang mana itu sebagian besar produk ini. `ChallengeStore.verify` mencoba `verify` lalu
`verifyMessage`. Tidak ada yang melemah: byte-nya tetap harus nonce ini, ditandatangani kunci
address ini, dan nonce-nya sudah dibelanjakan sebelum pengecekan.

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

Lima hal yang akan bikin bingung kalau tidak disebut:

1. **`source` di tiap baris bukan hiasan.** `'event'` = poller melihatnya terjadi (ada ledger + tx
   hash). `'state'` = rebuild membacanya dari storage: sama benarnya, tanpa provenance.
2. **Event tidak pernah dipercaya sendirian.** `EventCreated` tidak membawa nama, `CategoryAdded`
   tidak membawa jarak, `RecordEntered` tidak membawa kategori. Yang kurang dibaca ulang dari
   kontrak, dan yang dibawa event **dicocokkan** dengan hasil bacaan itu. Beda = `throw`, bukan
   pilih salah satu.
3. **Filter per contract id, bukan per nama topic** (`INTERFACE.md` §2.3). `getEvents` itu feed
   publik; siapa pun bisa men-deploy kontrak yang memancarkan topic `record_entered`.
4. **Daftar scanner adalah satu-satunya tabel yang TIDAK bisa dibangun ulang dari state.**
   EventRegistry cuma punya `is_scanner(event_id, address)` — tanya satu address, jawab ya/tidak.
   Tidak ada fungsi yang meng-enumerate. Itulah kenapa `/events/:eventId/scanners` membaca index,
   bukan chain. Konsekuensinya `rebuild` tidak boleh menghapus `event_scanners` begitu saja:
   kandidatnya dikumpulkan dari tabelnya **dan** dari replay `scanner_added`/`scanner_removed` di
   `chain_events` (log mentah itu sengaja diselamatkan lewat rebuild), lalu tiap address diverifikasi
   ulang ke chain dengan `is_scanner` sebelum ditulis balik. Yang tetap **tidak** bisa dipulihkan:
   scanner yang ditambahkan sebelum index ini pernah poll sama sekali — tidak ada barisnya, tidak
   ada event-nya, dan chain tidak bisa ditanya "siapa saja". Hasilnya under-report, arah yang aman,
   tapi tetap under-report. Ada test yang mengunci batas itu supaya tidak dibaca sebagai pemulihan
   total.

5. **Keeper memperpanjang ledger key, bukan memanggil `extend_record_ttl`.** Fungsi kontrak itu
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

777 test (`pnpm --filter be test`; sebagian butuh Postgres), dan sebagian besar kasus
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

## Pilihan race pack (STE-17): kolom `add_ons`

Migration **005**. Satu-satunya kolom per-pelari di tabel `participants` yang **tidak dienkripsi**,
dan itu disengaja:

- **Bukan PII.** "Event jersey: L" tidak mengidentifikasi siapa pun. Dump kolom ini isinya daftar
  ukuran kaos di sebelah nomor bib.
- **Panitia HARUS bisa membacanya.** Gunanya mengumpulkan ukuran adalah memesan kaosnya. Vault
  dibangun dengan arah sebaliknya (tidak ada route yang mengembalikan nama, `decryptForAudit`
  sengaja dinamai bikin tidak nyaman), jadi menaruh ukuran di sana berarti memilih antara jalur
  decrypt baru keluar dari vault atau panitia yang tidak bisa menghitung pesanannya sendiri. Dua-duanya
  lebih buruk daripada kolom biasa berisi non-rahasia.

Bentuknya **array pasangan**, bukan object:

```json
[{ "item": "Event jersey", "choice": "L" }]
```

Bukan selera: tiap response schema di service ini tertutup (`additionalProperties: false`) dan ada
test yang gagal kalau ada satu yang tidak. Map tidak bisa ditutup, array of two-field object bisa —
dan bentuk yang sama di kolom dan di wire berarti tidak ada terjemahan yang bisa salah.

Nama item mengacu ke `add_ons` di **dokumen event** (`docs/WEB_APP_IA.md` §6), yang di-hash dan beku
di `create_event`, jadi nama di sana tidak bisa berubah di bawah baris yang merujuknya. Itu properti
yang biasanya dibeli dengan id, tanpa perlu mengarang id.

Tidak divalidasi terhadap dokumen itu: file-nya off-chain di url yang service ini tidak punya, dan
mengambilnya tiap submit cuma untuk mencocokkan string berarti menambah dependency jaringan ke jalur
tulis demi cek yang sudah dilakukan console dengan data yang sama di depannya. Yang membatasi:
maksimal 20 item, masing-masing 128 karakter.

Ikut keluar di **roster bundle** (`GET /events/:eventId/roster`) karena di situlah satu-satunya
tempat pemanggil berwenang mendapat seluruh pendaftar satu event dalam satu request, dan dua
pembacanya sama-sama butuh: panitia menghitung ukuran, volunteer di meja race pack perlu tahu kaos
mana yang masuk ke tas.

**Yang v1 tidak bisa: stok per ukuran.** Kuota di kontrak dihitung per kategori dan tidak tahu apa
itu M atau L, jadi "M habis" tidak bisa ditegakkan. Cara panitia menjualnya adalah kategori terpisah
(`10K` vs `10K_JERSEY`), dan kuota kategori jersey itulah jumlah kaos yang dipesan.

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

## File metadata event (untuk STE-17)

`POST /events/files` → `{ url, sha256, size, content_type, created }`, dan `GET /files/:sha256`
menyajikannya kembali. Diminta Ancung buat organiser console: sebelum ini panitia disuruh hosting
poster sendiri lalu menempel URL-nya, langkah paling nyebelin di wizard.

**Tidak menyentuh spec beku.** `create_event` sudah punya `metadata_hash: BytesN<32>` + `uri: String`
(`INTERFACE.md` §1.1), jadi separuh on-chain-nya memang sudah ada; yang kurang cuma tempat menaruh
byte-nya.

**Content-addressed, dan itu keseluruhan desainnya.** Key penyimpanan **adalah** sha256 byte-nya —
bukan id acak dengan hash dicatat di sebelahnya, tapi satu angka yang dipakai untuk dua tugas.
Konsekuensinya:

- URL tidak bisa berubah isi. Byte berbeda = URL berbeda, jadi `metadata_hash` on-chain dan file
  yang disajikan tidak mungkin berselisih.
- Upload **idempoten**. Kirim file yang sama dua kali = satu file, URL sama, `created: false`.
- Tidak ada jalur overwrite, jadi tidak ada cara satu organiser menimpa poster organiser lain.
- `Cache-Control: immutable` jadi pernyataan fakta, bukan harapan.

Ini properti yang Ancung suka dari IPFS ("CID itu sendiri hash konten") tanpa pinning service dan
tanpa gateway yang bisa mati.

**Tipe ditentukan dari BYTE, bukan dari header `Content-Type`.** Header itu klaim si pengunggah;
mengecek allow-list terhadapnya cuma teater. `src/files/content-type.ts` mengendus signature-nya.

Yang diterima: `application/json`, `application/pdf`, dan lima tipe gambar raster
(PNG/JPEG/GIF/WebP/AVIF).

**PDF diterima untuk surat waiver**, dan alasannya sama dengan alasan fitur ini ada: nilai hukum
sebuah waiver bergantung pada bisa dibuktikannya apa yang disetujui orang saat itu. Content
addressing memberikan persis itu — URL-nya sha256 isinya, jadi dokumen tidak bisa diedit setelah
orang mendaftar. Panitia yang menempel link ke Drive-nya sendiri bisa menggantinya belakangan dan
tidak ada yang bisa membuktikan itu berubah.

PDF **bisa** membawa JavaScript, dan itu beda nyata dari gambar. Tetap diterima atas pertimbangan
yang layak ditulis daripada diasumsikan: response-nya sudah mengirim `default-src 'none'; sandbox`
+ `nosniff`, yang menaruh dokumen di origin buram tanpa jaringan sendiri, dan viewer PDF browser
modern sendiri proses tersandbox. `Content-Disposition`-nya sengaja **`inline`**, bukan
`attachment`: ini dokumen yang orang diminta menyetujuinya, dan memaksa unduh dulu itu hostile —
CSP `sandbox` yang membuat `inline` bisa dipertanggungjawabkan.

**Yang sengaja TIDAK dilakukan: memindai byte untuk `/JS` atau `/JavaScript`.** Object stream PDF
bisa dikompres, jadi pemindaian string sekaligus meleset untuk kasus terobfuskasi dan salah tembak
untuk konten sah. Cek yang bisa dilewati lebih buruk daripada tidak ada cek, karena dia dipercaya.
Header penyajiannya tidak bergantung pada mendeteksi apa pun.

PDF juga dicek **header DAN trailer**-nya (`%PDF-1.x`/`2.x` di awal, `%%EOF` di 1024 byte terakhir),
bukan cuma magic bytes. Alasannya sama dengan JSON yang di-parse: upload terpotong harus ketahuan
sekarang, bukan pas hari-H waktu waiver-nya tidak mau dibuka.

> **SVG tidak ada di allow-list dan jangan ditambahkan.** SVG itu dokumen XML yang bisa membawa
> `<script>`. Disajikan dari `api-sterun.jameshub.fun` — origin yang sama dengan PII vault — itu
> stored XSS dari file yang bisa diunggah siapa saja pemegang keypair. Bedanya dengan PDF: SVG itu
> script di origin halaman itu sendiri, bukan dokumen yang dirender viewer terpisah. Kalau nanti
> perlu poster vektor, jawabannya raster saat upload atau origin terpisah, bukan menambah cabang.

> **Daftar tipe yang di-parse Fastify DITURUNKAN dari allow-list**, bukan ditulis ulang. Fastify
> menolak content type yang tidak punya parser dengan 415 miliknya sendiri **sebelum** handler jalan,
> jadi tipe yang ditambahkan ke allow-list tapi lupa didaftarkan ke parser gagal dengan error yang
> tidak menyebut penyendusan dan tidak menunjuk perbaikan apa pun. Sudah kejadian sekali waktu PDF
> ditambahkan. Ada test yang membuktikan penurunan itu masih berlaku.

**Waiver yang sudah DITANDATANGANI bukan untuk endpoint ini.** `/files/:sha256` publik tanpa auth —
memang begitu desainnya, karena URL-nya masuk chain. Dokumen bertanda tangan berisi nama dan tanda
tangan, itu PII, tempatnya vault. Dan kemungkinan besar tidak perlu disimpan sama sekali: pelari
sudah menandatangani transaksi `enter` dengan wallet-nya, jadi "orang ini setuju dengan dokumen
persis ini" sudah terbukti dari chain begitu waiver-nya tercakup `metadata_hash`. Apakah itu memenuhi
syarat tanda tangan elektronik yang sah menurut hukum Indonesia adalah pertanyaan hukum, bukan
teknis — belum dijawab.

Lapisan kedua saat menyajikan: `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`,
tipe yang dikirim adalah tipe hasil endus, dan `Content-Disposition` menamai file dengan hash-nya —
tidak ada apa pun pilihan pengunggah yang dipantulkan ke header.

**Siapa yang boleh upload: siapa pun dengan signature wallet yang sah, dan itu disengaja.** Brief-nya
mengusulkan membatasi ke address yang sudah pernah bikin event. Itu justru mengunci organiser
pertama kali — persis orang yang fiturnya dibuat untuk mereka — karena URL-nya dibutuhkan
**sebelum** `create_event` dipanggil. Yang membatasi penyalahgunaan: 5 MB per file, rate limit
12/menit, allow-list hasil endus, dan **plafon keras seluruh store** (`STERUN_FILES_MAX_BYTES`,
default 512 MiB) yang menjawab **507**. Keypair Stellar gratis dibikin, jadi aturan per-address
tidak membatasi apa pun; plafon itulah yang membatasi.

**`STERUN_PUBLIC_BASE_URL` wajib di-set di box yang publik.** Kalau kosong, origin diambil dari
header `Host` — yang dikendalikan penyerang — dan URL yang dikembalikan endpoint ini adalah URL yang
organiser commit **permanen** on-chain.

### Di mana byte-nya disimpan: R2, dengan disk sebagai fallback

`FileStore` punya dua implementasi, dan yang dipakai ditentukan config — bukan flag:

| Kondisi | Store | Dipakai di |
| --- | --- | --- |
| keempat `STERUN_R2_*` ada | `R2FileStore` | produksi |
| keempatnya kosong | `LocalFileStore` (disk) | `pnpm dev`, test |

**Keempatnya atau tidak sama sekali.** Tiga dari empat membuat proses start dengan normal, melayani
semua endpoint lain, lalu gagal di upload pertama dengan **403** dari R2 — yang persis mirip secret
salah dan mengirim orang me-regenerate kredensial yang sebenarnya benar. `loadR2Config` menolak itu
saat startup.

**Yang TIDAK berubah: URL publiknya.** File tetap disajikan API ini di `/files/:sha256`, bukan dari
bucket publik atau custom domain R2. Ini keputusan paling berkonsekuensi di fitur ini:

- **URL-nya di-commit on-chain, permanen.** `create_event` menyimpan `uri` di storage kontrak dan v1
  non-upgradeable. URL yang menunjuk ke penyedia storage adalah taruhan bahwa kita tidak akan pernah
  pindah penyedia; URL di domain sendiri selamat dari migrasi berikutnya — dan akan ada.
- **Header keamanannya milik kita.** Byte ini diunggah siapa pun pemegang keypair dan disajikan dari
  origin yang juga melayani PII vault. CSP `sandbox`, tipe hasil endus, dan nama file dari hash
  semuanya di `routes/files.ts`. Bucket yang menyajikan sendiri menjawab dengan apa pun yang
  dikonfigurasi di tempat yang `git log` tidak bisa menjawabnya.
- Cloudflare sudah men-cache jalur baca, jadi API tidak ada di hot path untuk pembacaan berulang.

Jadi R2 mengganti **di mana byte disimpan**, bukan **siapa yang menyajikannya**.

**SigV4-nya ditulis tangan** (`src/files/sigv4.ts`), bukan `@aws-sdk/client-s3`. Alasannya sama
dengan migrator ~60 baris: paket ini punya **enam** dependency runtime dengan sengaja, dan SDK itu
membawa puluhan paket transitif plus middleware stack-nya untuk empat operasi ke satu bucket.
Risikonya rendah karena mode gagalnya keras dan langsung: signature meleset satu byte = `403
SignatureDoesNotMatch` di request pertama, bukan kebocoran diam-diam. Cara membuktikannya ada tiga
lapis, dan itu sengaja: **implementasi pembanding independen** di file test (pola yang sama dengan
`docs/specs/verify.sh` — dua implementasi referensi wajib sepakat), aturan struktural, dan R2 sendiri
yang menerima signature-nya (dicatat di `docs/deployments.md`, tidak bisa jalan di CI).

Satu detail yang enak: SigV4 butuh sha256 dari body, dan content-addressing sudah menghitung angka
yang persis sama untuk dijadikan key. Satu hash, dua kegunaan.

**Kegagalan R2 yang sementara di-retry, dan itu bukan hiasan.** Upload sungguhan pernah dapat 500
karena R2 menjawab `InternalError` dengan badan pesan *"We encountered an internal error. Please try
again."* — instruksi eksplisit yang kode ini abaikan, jadi gangguan sesaat di sisi Cloudflare jadi
upload gagal buat panitia. Sekarang: 3 percobaan, backoff eksponensial + jitter, menghormati
`Retry-After`, dan **cuma untuk 5xx/429**. 403 (kredensial salah) dan 404 (objek tidak ada) tidak
di-retry — keduanya tidak membaik dengan waktu.

Retry di sini aman dengan cara yang tidak berlaku di kebanyakan tempat, dan itu bukan keberuntungan:
**semua operasi store ini idempoten by construction.** PUT menulis byte di alamat hash byte itu
sendiri, jadi tulis ganda adalah tulis yang sama; GET/HEAD/LIST tidak mengubah apa pun. Tidak ada
operasi yang pengulangannya bisa menggandakan sesuatu.

Request **ditandatangani ulang tiap percobaan**, bukan memakai header yang sama: signature mencakup
`x-amz-date`, jadi retry yang menyeberang jendela clock skew akan gagal autentikasi karena alasan
yang tidak ada hubungannya dengan kenapa dia di-retry.

Kalau retry-nya habis, route menjawab **503 + `Retry-After`**, bukan 500 — "upstream lagi sakit,
coba lagi" itu jawaban jujur yang menentukan apa yang orang lakukan berikutnya, dan aman diiklankan
justru karena upload-nya idempoten.

**Tipe objek dicek ulang saat dibaca**, tidak dipercaya karena kita yang menulisnya. Token yang
menjangkau bucket bisa menulis objek apa pun dengan content type apa pun, dan bucket itu bukan milik
kode ini sendirian. Satu perbandingan murah yang menahan objek `text/html` nyasar disajikan ke
browser dari origin kita.

**Volume `sterun-files` bukan cache** (dan sekarang cuma dipakai kalau R2 tidak dikonfigurasi). File
hilang = event rusak selamanya, karena hash-nya sudah di ledger dan menunjuk 404. Dockerfile membuat
`/app/data/files` milik uid 1000 lebih dulu: named volume kosong mewarisi ownership direktori itu
dari image, dan kalau path-nya tidak ada di image Docker membuatnya milik root sehingga upload
pertama gagal `EACCES`. Bentuk bug yang sama dengan cloudflared di STE-31, dan cuma muncul di
deployment sungguhan.

**Belum ada: sweeper file yatim.** File yang tidak pernah dirujuk `uri` event mana pun tetap
tersimpan. Plafon store yang menahan pertumbuhannya, bukan penghapusan. Kandidat perintah keeper
berikutnya: index sudah menyimpan `uri` tiap event, jadi selisihnya bisa dihitung tanpa tabel baru.

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
upload hasil, 12 untuk upload file metadata. Key-nya hop pertama `x-forwarded-for` — di belakang reverse proxy (STE-31) semua
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

Verifikasi dari luar tanpa SSH: `./deploy/verify-deployment.sh https://…` — 18 cek, termasuk bahwa
endpoint sensitif tetap 401 dan bahwa SVG tidak ada di tipe upload yang diterima. Prosedur lengkap: [`OPERATIONS.md`](OPERATIONS.md) bagian "Deploy ke VPS".

## Yang belum ada (jangan diasumsikan sudah)

Job re-encrypt untuk rotasi kunci, alert kalau keeper berhenti, sweeper file yatim, dan backup
Postgres terjadwal.

**Blocker replica sudah HILANG.** `R2FileStore` menghapusnya: byte tidak lagi di disk satu box, jadi
API sekarang stateless. Yang tersisa sebelum benar-benar menyalakan replica kedua:

1. **backup Postgres terjadwal** — dan ini harus duluan. Replica itu ketersediaan, backup itu
   pemulihan; replica menyalin `DROP TABLE` yang salah ketik dengan setia.
2. **Redis untuk rate limit** — limiter-nya sudah ada dan sudah per-endpoint, tapi state-nya
   in-memory, jadi dua instance = limit efektif dua kali lipat.

**Poller dan keeper tetap singleton.** Dua poller berebut cursor yang sama; dua keeper membayar sewa
dua kali. Yang di-replika cuma API.

Daftar lengkapnya di bagian akhir [`OPERATIONS.md`](OPERATIONS.md). Perbarui file ini begitu salah
satunya mendarat.
