# `sc/bindings/` — TypeScript bindings kontrak Sterun (STE-14, C3)

Client TypeScript untuk kedua kontrak, **di-generate** dari wasm hasil build di
`sc/target/wasm32v1-none/release/`. Ini handoff D2: yang dipakai **James**
(`SterunClient`, STE-15; indexer, STE-16) dan **Ancung** (web app + scanner PWA,
STE-17/18/21/22) supaya tidak ada yang mengetik ulang signature kontrak.

| Paket | Kontrak | Dari wasm | sha256 wasm |
| --- | --- | --- | --- |
| [`event-registry/`](event-registry/) | EventRegistry (C1, STE-5) | `event_registry.wasm` | `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` |
| [`race-record/`](race-record/) | RaceRecord (C2, STE-9) | `race_record.wasm` | `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` |

Kontrak beku yang mereka wakili: **[`docs/specs/INTERFACE.md`](../../docs/specs/INTERFACE.md)
v1.0.0**. Kalau ada beda antara dokumen itu dan file di sini, **dokumen itu yang
benar** — dan bedanya itu sendiri sebuah bug (lihat "Penjaga" di bawah).

---

## JANGAN diedit tangan

Semua yang ada di `event-registry/` dan `race-record/` adalah **output
generator**, termasuk `src/index.ts`, `tsconfig.json`, `package.json`, dan
`README.md` di dalam masing-masing paket. Edit tangan akan hilang tanpa jejak
pada regenerate berikutnya, dan lebih buruk: bikin bindings berbohong tentang
apa yang sebenarnya ada di wasm.

Butuh perubahan? Ubah kontraknya, build ulang, generate ulang — lewat prosedur
spec-change di [`docs/specs/CHANGELOG.md`](../../docs/specs/CHANGELOG.md)
(approval @Axel + @fable, entri changelog, naikkan versi). Kode error **tidak
pernah di-renumber**.

> `README.md` bawaan di dalam tiap paket itu boilerplate generator dan
> **menyesatkan** untuk repo ini: dia menyarankan generate ulang dari
> `--contract-id` lewat `postinstall`. Kita tidak melakukan itu — kita generate
> dari wasm lokal dan commit hasilnya. File ini yang berlaku.

## Regenerate

Persis dua perintah ini, dijalankan dari **root repo**:

```bash
cd sc && stellar contract build && cd ..

stellar contract bindings typescript \
  --wasm sc/target/wasm32v1-none/release/event_registry.wasm \
  --output-dir sc/bindings/event-registry --overwrite

stellar contract bindings typescript \
  --wasm sc/target/wasm32v1-none/release/race_record.wasm \
  --output-dir sc/bindings/race-record --overwrite
```

Dua catatan yang menentukan hasilnya:

- **`--output-dir` menentukan nama paket.** Generator mengambil nama paket dari
  basename direktori output, jadi `--output-dir sc/bindings/event-registry`
  itulah yang membuat paketnya bernama `event-registry`. Pakai path lain =
  paket dengan nama lain = `import` di `be/`/`fe/` putus. Jangan diubah.
- **Output-nya deterministik.** Dengan wasm dan `--output-dir` yang sama,
  `src/index.ts` dan `tsconfig.json` yang dihasilkan **byte-identical** dengan
  yang ter-commit. Jadi `git diff` kosong setelah regenerate = bindings memang
  masih sinkron dengan wasm.

Generator tidak butuh network dan tidak butuh kontrak yang sudah ter-deploy —
`--wasm` dibaca dari file lokal. Itu sebabnya STE-15/16/17 tidak perlu menunggu
STE-33.

## Build (wajib sebelum dikonsumsi)

`package.json` hasil generate menunjuk `exports: "./dist/index.js"`, dan `dist/`
**tidak di-commit** (lihat `.gitignore` di folder ini). Jadi setelah clone:

```bash
cd sc/bindings/event-registry && npm install && npm run build
cd ../race-record            && npm install && npm run build
```

`npm run build` menjalankan `tsc` dan menghasilkan `dist/index.js` +
`dist/index.d.ts`. Kedua paket **compile apa adanya, tanpa satu pun perbaikan
tangan**. Ini juga langkah di CI (`.github/workflows/contracts.yml`), jadi
kalau generator suatu saat mengeluarkan sesuatu yang tidak compile, CI merah
sebelum ada yang sempat memakainya.

## Cara `be/` dan `fe/` memakainya

**Pakai `file:` dependency, bukan pnpm workspace.** Alasannya: repo ini belum
punya pnpm workspace di root, dan `fe/` + `landing-page/` masing-masing berdiri
sendiri dengan lockfile-nya sendiri. Menambah `pnpm-workspace.yaml` di root
berarti merombak cara ketiga app itu di-install — perubahan struktural yang
bukan porsi tiket ini. `file:` jalan sama saja di npm maupun pnpm, tanpa
menyentuh app yang sudah ada.

`be/package.json` (dan sama persis untuk `fe/package.json`):

```json
{
  "dependencies": {
    "event-registry": "file:../sc/bindings/event-registry",
    "race-record": "file:../sc/bindings/race-record"
  }
}
```

Lalu:

```ts
import { Client as EventRegistry, Errors as RegistryErrors } from "event-registry";
import { Client as RaceRecord, Errors as RecordErrors, NonFungibleTokenError } from "race-record";

const registry = new EventRegistry({
  contractId: EVENT_REGISTRY_ID,       // dari docs/deployments.md (STE-33)
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const tx = await registry.get_event({ event_id: 1 });
console.log(tx.result);                // Result<EventData, Error>
```

Sudah dibuktikan: paket probe dengan dua `file:` dependency di atas lolos
`tsc --noEmit` dengan **`"strict": true`** dan berhasil `import` saat runtime
(`RegistryErrors[5].message === "QuotaFull"`,
`RecordErrors[102].message === "AlreadyClaimed"`,
`NonFungibleTokenError[200].message === "NonExistentToken"`).

### Tiga hal yang akan bikin bingung kalau tidak disebut

1. **Tidak ada export `networks`.** Bindings yang di-generate dari
   `--contract-id` biasanya membawa konstanta `networks` berisi contract id.
   Punya kita di-generate dari `--wasm`, jadi tidak ada contract id di dalamnya
   — `contractId` **wajib** kamu suplai sendiri saat `new Client({...})`. Ambil
   dari `docs/deployments.md` (lihat bagian bawah), jangan di-hardcode di
   banyak tempat.
2. **`__constructor` bukan method.** Dia jadi argumen `Client.deploy({...})`
   (static), karena constructor hanya jalan sekali saat deploy. Ini urusan
   STE-33, bukan urusan client harian.
3. **`version` di `package.json` tertulis `0.0.0`.** Itu yang dikeluarkan
   generator, dan sengaja **tidak** kita ubah supaya output tetap byte-identical
   dengan hasil regenerate. Versi yang bermakna adalah versi spec yang mereka
   wakili — **v1.0.0**, tercatat di `docs/specs/CHANGELOG.md` — plus sha256 wasm
   di tabel paling atas. Itu dua-duanya identitas yang bisa diverifikasi;
   nomor di `package.json` tidak.

## Kode error: angkanya sendiri yang menyebut asalnya

`Errors` di tiap paket memetakan kode → nama, persis seperti `INTERFACE.md` §1.4
dan §2.4:

| Paket | Export | Band |
| --- | --- | --- |
| `event-registry` | `Errors` | `1..=13` (EventRegistry, C1) |
| `race-record` | `Errors` | `100..=105` (RaceRecord, C2) |
| `race-record` | `NonFungibleTokenError` | `200..=214` (OpenZeppelin) |

`enter` memanggil EventRegistry dan SAC secara cross-contract, dan revert mereka
merambat apa adanya. Jadi `Error(Contract, #4)` dari `enter` **bukan** error
RaceRecord — itu `EventNotOpen` milik EventRegistry. Band inilah yang membuat
`SterunClient` (STE-15) bisa memilih peta error yang benar dari angkanya saja.
Detail lengkap: `INTERFACE.md` §3.

## Penjaga: bindings tidak boleh diam-diam berbeda dari spec beku

```bash
node sc/scripts/check-interface.mjs
```

Script itu mem-*diff* **tiga** sisi sekaligus dan exit non-zero kalau ada yang
berpisah jalan:

1. wasm hasil build (`stellar contract info interface --output json`),
2. tabel beku di `docs/specs/INTERFACE.md`,
3. `*/src/index.ts` di folder ini.

Yang dijaga: setiap fungsi beku punya method di client (atau `Client.deploy`
untuk `__constructor`), dan setiap kode error beku ada di peta error dengan nama
yang sama. Jalan otomatis di CI setiap push dan pull request.

## Hubungannya dengan deploy (STE-33)

Wasm yang menghasilkan bindings ini **persis** wasm yang akan di-deploy STE-33 —
sha256-nya ada di tabel paling atas dan di `sc/README.md`. Contract id hasil
deploy mendarat di **`docs/deployments.md`** beserta link stellar.expert-nya.

Contract id yang sudah live (STE-33), siap dipakai `new Client({ contractId })`:

```
EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
```

Hash wasm on-chain kedua kontrak itu **sama persis** dengan hash di tabel paling
atas file ini — dicek lewat `stellar contract info hash --contract-id`. Jadi
bindings ini memang mewakili kontrak yang benar-benar dipanggil, bukan build
lain yang mirip.
