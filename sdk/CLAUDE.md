# `sdk/` — `@sterun/sdk` (CLAUDE.md)

Client TypeScript untuk kedua kontrak. Komponen **C5** (STE-15); packaging + JSON
Schema v1.0 + publish npm menyusul di **C6** (STE-19). Owner: **James**.

Ini seam yang dilewati **semua** client D3 — organiser console, entry flow, scanner
PWA, public profile — sesuai aturan design "clients never talk to contracts raw"
(`docs/SYSTEM_DESIGN.md` §2). Kontrak yang diwakili **beku** di
[`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md) v1.0.0.

```bash
pnpm bindings                    # dari root — WAJIB sebelum install
pnpm install
pnpm --filter @sterun/sdk test        # 84 test, nol network
pnpm --filter @sterun/sdk typecheck
pnpm --filter @sterun/sdk lint
pnpm --filter @sterun/sdk e2e         # flow penuh melawan testnet live
```

## Jebakan nomor satu: `pnpm bindings` sebelum `pnpm install`

Urutannya **wajib**, dan kalau terbalik gejalanya menyesatkan.

`sdk/` memakai `sc/bindings/*` lewat `file:` dependency. pnpm menyelesaikan
`file:` ke sebuah direktori dengan cara **menyalinnya** ke store — snapshot,
bukan symlink. `dist/` bindings di-gitignore (itu output generator), jadi kalau
`pnpm install` jalan duluan, yang tersalin adalah copy **tanpa `dist/`**. Build
ulang bindings setelah itu tidak memperbaiki apa pun: yang kamu build adalah
source-nya, sementara yang dibaca `tsc` adalah snapshot di store.

Gejalanya: `Cannot find module 'race-record'` yang tidak hilang walau sudah
di-build tiga kali. Obatnya: `pnpm bindings && pnpm install` — install ulang
setelah build, bukan build ulang setelah install.

Sudah diverifikasi dua arah di clone bersih, dan `.github/workflows/typescript.yml`
menjalankan `pnpm bindings` **sebelum** `pnpm install` karena alasan itu.

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

## Yang belum, dan memang bukan porsi STE-15

- **Publish npm** — `file:` dependency tidak bisa di-publish. STE-19 harus
  membundel bindings ke `dist/` sebelum `npm publish`. Tiketnya memang menyerahkan
  keputusan bundling ke owner.
- **RaceRecord JSON Schema v1.0** — STE-19.
- **Leg `enter` berbayar di e2e** — butuh `SUSD_DISTRIBUTOR_SECRET` di `be/.env`.
  Script-nya sudah menangani, dan kalau secret tidak ada dia **bilang** dia
  melewatinya, bukan diam-diam lulus dengan test yang lebih lemah.
