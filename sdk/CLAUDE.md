# `sdk/` — `@sterun/sdk` (CLAUDE.md)

Client TypeScript untuk kedua kontrak. Komponen **C5** (STE-15) + **C6** (STE-19:
RaceRecord JSON Schema v1.0, packaging, publish npm). Owner: **James**.

Ini seam yang dilewati **semua** client D3 — organiser console, entry flow, scanner
PWA, public profile — sesuai aturan design "clients never talk to contracts raw"
(`docs/SYSTEM_DESIGN.md` §2). Kontrak yang diwakili **beku** di
[`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md) v1.0.0.

```bash
pnpm install
pnpm --filter @sterun/sdk test        # 134 test, nol network
pnpm --filter @sterun/sdk typecheck
pnpm --filter @sterun/sdk lint
pnpm --filter @sterun/sdk vendor      # refresh salinan bindings setelah regenerate
pnpm --filter @sterun/sdk e2e         # flow penuh melawan testnet live
```

## Bindings di-vendor, bukan di-`file:`

`@sterun/sdk` di-publish ke npm, dan **`file:` dependency tidak bisa di-publish**.
Jadi kode bindings ikut masuk ke dalam paket: `vendor/` berisi salinan
**byte-identical** dari `sc/bindings/*/src/index.ts`, di-compile
`tsconfig.vendor.json` dengan setelan milik generator.

Kenapa tsconfig sendiri: di bawah `tsconfig.json` paket ini, kedua file itu
memunculkan 12 error yang semuanya soal gaya, bukan substansi — type-only import
di bawah `verbatimModuleSyntax`, `override` yang hilang, dan `window` tanpa lib
DOM. Melonggarkan aturan seluruh paket demi dua file hasil generate itu
pertukaran yang salah.

Kenapa salinannya wajib byte-identical: `sc/bindings/README.md` melarang edit
tangan, dan salinan yang "disesuaikan" diam-diam berhenti menjadi apa yang
dihasilkan wasm. `test/vendor.test.ts` membandingkan byte per byte, jadi
"regenerate bindings lalu lupa SDK-nya" jadi test merah — bukan client
ter-publish yang diam-diam bicara interface lama.

Refresh: `node scripts/vendor-bindings.mjs` (atau `--check` untuk memverifikasi).

> **Jebakan `file:` dari STE-15 sudah HILANG.** Dulu urutan `pnpm bindings`
> sebelum `pnpm install` itu wajib karena pnpm menyalin `file:` dependency ke
> store-nya sebagai snapshot. Sekarang tidak ada `file:` dependency sama sekali,
> jadi clone bersih langsung jalan dan langkah CI yang khusus mengakali itu sudah
> dicabut. Build vendor jadi pre-hook di `build`/`typecheck`/`test`.

## Satu versi `@stellar/stellar-sdk` untuk seluruh workspace

`stellar contract bindings typescript` (CLI 27.0.0) menulis
`"@stellar/stellar-sdk": "^14.5.0"` di `package.json` yang dia generate,
sedangkan `be/` dan `sdk/` jalan di `^17.0.1`. Tanpa penanganan, satu graph
berisi **dua** copy SDK — persis bahaya yang ditulis di header
`be/src/chain/reader.ts`: dua RPC client, dan objek signer dari satu mayor
diserahkan ke `AssembledTransaction` dari mayor lain.

Jawabannya `pnpm.overrides` di `package.json` root, bukan mengedit
`package.json` bindings — `sc/bindings/README.md` melarang edit tangan, dan
regenerate berikutnya akan menghapusnya diam-diam. Override menyatakan hal yang
sama di tempat yang bertahan.

Sudah dibuktikan sebelum dipakai: kedua paket bindings compile dengan `tsc` exit
0 melawan 17.0.1, dan membaca kontrak testnet live lewat versi itu.

## Kenapa error TIDAK diambil dari `Result` bawaan bindings

Ini temuan yang membentuk seluruh `tx.ts`. Diprobe ke kontrak live:

```
get_event(999)  -> result.unwrapErr()  === { message: "" }
owner_of(9999)  -> result === Err { error: { message:
                     "Indicates a non-existent `token_id`." } }
```

Yang pertama **membuang kodenya**. Yang kedua mengembalikan `Err` dari method
yang tipenya `string`, berisi **doc comment Rust** — bukan nama varian, dan
tidak stabil pula (mengedit komentar di kontrak akan mengubahnya).

Yang bisa dipakai cuma `tx.simulation.error`: seragam untuk keduanya, selalu
berbentuk `HostError: Error(Contract, #N)`. Itu input untuk `errors.ts`, dan
band-nya (`INTERFACE.md` §3) yang menentukan kontrak asalnya. **Jangan pernah**
mengganti ini dengan `result.unwrapErr()` karena "lebih rapi" — hasilnya error
tanpa identitas.

## Tabel error sengaja diduplikasi dari `be/src/chain/errors.ts`

Bukan lupa di-DRY. `be/` sengaja tidak bergantung pada bindings (alasannya di
header `be/src/chain/reader.ts`), dan membuat indexer bergantung pada paket ini
cuma untuk tiga tabel lookup akan membatalkan itu.

Gantinya kedua salinan dipatok ke dokumen beku yang sama oleh test masing-masing:
`sdk/test/errors.test.ts` dan `be/test/chain-errors.test.ts` sama-sama mem-parse
`docs/specs/INTERFACE.md`. Tidak ada satu pun yang jadi sumber kebenaran — **spec
beku yang jadi sumbernya**, dan keduanya diperiksa terhadapnya. Ini pengaturan
yang sama dengan `docs/specs/reference/{node,rust}`.

Test di sini juga membandingkan tabel dengan peta error **hasil generate** di
bindings, jadi segitiganya tertutup: dokumen ↔ artefak (oleh
`sc/scripts/check-interface.mjs`) dan SDK ↔ keduanya.

## Alamat kontrak selalu argumen

Tidak ada contract id sebagai konstanta di paket ini, sama seperti aturan nomor 1
di `be/CLAUDE.md`. Alasannya di sini bahkan lebih keras: paket yang sudah
ter-publish ke npm tidak bisa membaca `docs/deployments.md`, dan kontrak v1
**non-upgradeable** — redeploy berarti **pasangan alamat baru**, bukan upgrade.
Konstanta di sini akan terus bicara ke pasangan lama sampai ada yang merilis
versi baru.

`network.ts` cuma menyimpan yang benar-benar properti *network*: `rpcUrl` dan
`networkPassphrase`.

## `publicKey` bukan pelengkap `signTransaction`

`CallOptions` membawa keduanya dan keduanya wajib benar. `signTransaction`
menentukan siapa yang menandatangani; `publicKey` menentukan source account yang
transaksinya **di-build dan disimulasikan**, dan simulasi itulah yang merekam
auth entry. Simulasi sebagai address yang salah menghasilkan auth tree untuk
address itu, dan tanda tangan yang benar tidak akan memenuhinya.

Karena itu `runWrite` tidak lagi menerima signer: signer masuk saat transaksi
dirakit. Menyuntikkan signer lain saat `signAndSend` berarti menandatangani
sesuatu yang berbeda dari yang disimulasikan.

## Testing (WAJIB, no bug)

- **Unit + integration**: `test/`, nol network, lewat seam struktural
  (`AssembledLike` di `tx.ts` dan opsi `bindings` di `SterunClient`) — pola yang
  sama dengan `ContractCaller` di `be/`. Ini yang jalan di `typescript.yml`.
- **E2E**: `scripts/e2e.ts` melawan testnet live, plus **7 negative case** yang
  masing-masing memastikan varian **dan** band-nya benar. Buktinya di-commit ke
  `docs/deployments.md`.

**`typescript.yml` tidak boleh menyentuh network.** Itu keputusan STE-6 dan tetap
berlaku: CI tidak boleh merah gara-gara testnet lagi jelek. E2E dijalankan tangan,
hasilnya jadi bukti tertulis — pola yang sama dengan faucet (STE-6) dan STE-16.

## JSON Schema: satu definisi, dua artefak

zod di `src/schema.ts` adalah **sumber kebenaran**.
`schema/race-record-v1.0.json` di-*generate* darinya lewat `z.toJSONSchema`, dan
`test/schema.test.ts` gagal kalau file yang ter-commit dan hasil generate
berbeda. Jangan pernah mengedit JSON-nya tangan.

**Semua object pakai `strictObject`, bukan `object`.** Default zod adalah
**membuang** key asing lalu melaporkan sukses — yang membuat validator runtime
dan JSON Schema yang di-publish (`additionalProperties: false`) diam-diam
berbeda perilaku: validator luar akan menolak dokumen yang baru saja dinyatakan
valid oleh SDK ini. Dan untuk properti yang paling penting, diam adalah jawaban
yang salah: dokumen yang datang membawa `national_id` bukan dokumen valid dengan
field nyasar — itu bukti ada yang membocorkan PII ke format yang memang dibuat
untuk diserahkan ke orang asing.

**Angka besar selalu decimal string** (`price_stroops`, `starts_at`,
`entered_at`, `claimed_at`, `result_at`). `JSON.parse` menghasilkan double
IEEE-754; di atas 2^53 presisinya hilang diam-diam, dan `price_stroops` itu
`i128`. Field `u32` tetap number.

## Yang belum

- **`npm publish`** — butuh kredensial npm milik James. Runbook-nya di
  `README.md` bagian Development + `docs/deployments.md`. Semua langkah
  sebelumnya sudah diverifikasi lewat `npm pack` + install tarball di project
  TypeScript kosong di luar repo (typecheck bersih, quickstart jalan ke testnet,
  dokumen valid terhadap schema).
- **Leg `enter` berbayar di e2e** — butuh `SUSD_DISTRIBUTOR_SECRET` di `be/.env`.
  Script-nya sudah menangani, dan kalau secret tidak ada dia **bilang** dia
  melewatinya, bukan diam-diam lulus dengan test yang lebih lemah.
