# Deployments — Sterun (Instawards MVP)

File ini adalah **bukti deploy wajib** (Working agreement poin 8): setiap deploy harus dicatat di sini
dengan contract address / account address yang nyata plus link explorer yang bisa diklik, supaya
reviewer, PM, atau juri grant bisa memverifikasi sendiri tanpa perlu menjalankan apa pun.

> **Semua yang ada di file ini adalah TESTNET** (`Test SDF Network ; September 2015`).
> Tidak ada nilai riil di sini. Mainnet punya section sendiri kalau nanti sudah ada.
>
> **Tidak pernah ada secret key (`S...`) atau seed phrase di file ini.** Hanya public address (`G...`),
> contract address (`C...`), dan transaction hash. Secret key hidup di `~/.config/stellar/identity/*`
> di mesin masing-masing dan tidak pernah masuk repo.

---

## sUSD (Sterun USD) — asset pembayaran testnet

`sUSD` adalah asset klasik Stellar yang kita issue sendiri untuk testnet, dipakai sebagai token biaya
pendaftaran (entry fee) di RaceRecord. Design-nya ada di `docs/SYSTEM_DESIGN.md` §3.3: fee mengalir
**langsung runner → organiser** lewat cross-contract `transfer` ke SAC, harga disimpan sebagai `i128`
dalam representasi **7 desimal**.

### Identitas & parameter

| Item | Nilai |
| --- | --- |
| Asset code | `sUSD` |
| Nama panjang | Sterun USD |
| Network | Stellar **testnet** (`Test SDF Network ; September 2015`) |
| Issuer (`G...`) | `GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW` |
| Distributor (`G...`) | `GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO` |
| SAC contract address (`C...`) | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| Supply awal | **1.000.000 sUSD** (`10000000000000` unit mentah / stroop) |
| Decimals | **7** (inheren untuk classic asset Stellar) |
| Auth flags issuer | **tidak ada** — `auth_required=false`, `auth_revocable=false`, `auth_immutable=false`, `auth_clawback_enabled=false` |

Keputusan **tanpa auth flags** diambil sengaja untuk v1: tanpa `AUTH_REQUIRED` siapa pun boleh
langsung buka trustline dan menerima sUSD tanpa perlu di-approve issuer, jadi friction testing nol.

### Alias identity lokal (Stellar CLI)

Nama alias ini dipakai di semua perintah di bawah. Alias hanya ada di mesin masing-masing;
yang autoritatif adalah address `G...`-nya.

| Alias | Address (`G...`) | Fungsi |
| --- | --- | --- |
| `sterun-susd-issuer` | `GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW` | issuer asset |
| `sterun-susd-distributor` | `GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO` | pemegang supply, sumber faucet |
| `sterun-test-a` | `GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF` | akun uji coba `transfer` |
| `sterun-test-b` | `GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS` | akun uji coba `transfer` |

### Link explorer (stellar.expert, testnet)

- Issuer: <https://stellar.expert/explorer/testnet/account/GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW>
- Distributor: <https://stellar.expert/explorer/testnet/account/GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO>
- Asset `sUSD`: <https://stellar.expert/explorer/testnet/asset/sUSD-GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW>
- **SAC contract**: <https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU>
- Akun uji `sterun-test-a`: <https://stellar.expert/explorer/testnet/account/GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF>
- Akun uji `sterun-test-b`: <https://stellar.expert/explorer/testnet/account/GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS>

### Transaksi issuance (classic)

Semua sukses di testnet (`successful=true`):

| Langkah | Tx hash | Ledger |
| --- | --- | --- |
| `change-trust` distributor → sUSD | [`5d5df86f…`](https://stellar.expert/explorer/testnet/tx/5d5df86f8b686177d17af9dcbb8610d61022cdf2e042b1ab55144e42f0f334f8) | 4431614 |
| `change-trust` test-a → sUSD | [`703d83a7…`](https://stellar.expert/explorer/testnet/tx/703d83a7fa531a487ea4ac274072527287532e25f27c54bf98bed6fe3f1e5f9a) | 4431615 |
| `change-trust` test-b → sUSD | [`5ae1e0fb…`](https://stellar.expert/explorer/testnet/tx/5ae1e0fb1fdcdb128615662f457f4b26ee0dda5217ed8ba05ba85e6760c50984) | 4431616 |
| `payment` issuer → distributor, 1.000.000 sUSD | [`d26d2b42…`](https://stellar.expert/explorer/testnet/tx/d26d2b425aeaa667933b4cec07509352270a113bf315bb6f5022bfb1cce888c5) | 4431619 |

Perintah yang dijalankan (issuer tidak perlu trustline ke asset-nya sendiri):

```bash
ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
DIST=GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO

# 1. buat + fund identity (Friendbot)
stellar keys generate sterun-susd-issuer      --network testnet --fund
stellar keys generate sterun-susd-distributor --network testnet --fund

# 2. trustline distributor
stellar tx new change-trust \
  --source-account sterun-susd-distributor \
  --line "sUSD:$ISSUER" \
  --network testnet

# 3. issue 1.000.000 sUSD (--amount dalam stroop: 1.000.000 x 10^7)
stellar tx new payment \
  --source-account sterun-susd-issuer \
  --destination "$DIST" \
  --asset "sUSD:$ISSUER" \
  --amount 10000000000000 \
  --network testnet
```

> ⚠️ `--amount` di `stellar tx new payment` selalu dalam **stroop** (1 stroop = 0,0000001 asset).
> Jadi 1.000.000 sUSD = `10000000000000`. Salah di sini bikin supply meleset 10 juta kali.

---

## Stellar Asset Contract (SAC) sUSD

Supaya asset klasik `sUSD` bisa dipakai dari dalam kontrak Soroban, dia harus diekspos lewat
**Stellar Asset Contract**-nya. SAC ini yang mengimplementasikan interface token **SEP-41**
(CAP-46-6), dan alamat inilah yang akan dipegang RaceRecord untuk memanggil
`transfer(runner, organiser, price)` secara cross-contract.

| Item | Nilai |
| --- | --- |
| SAC contract address | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| Asset yang di-wrap | `sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW` |
| Network | testnet |
| Deploy tx | [`92ffd8e2…`](https://stellar.expert/explorer/testnet/tx/92ffd8e2fb1b4562834011e5bc97ad73153750d38409e3671ebad5f3574e1f72) (ledger 4431623) |
| Explorer | <https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU> |

SAC **tidak punya wasm hash sendiri** — implementasinya built-in di host Soroban, bukan wasm yang
kita upload. Jadi kolom "wasm hash" memang tidak berlaku untuk baris ini.

Perintah deploy:

```bash
stellar contract asset deploy \
  --asset sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW \
  --source-account sterun-susd-issuer \
  --network testnet
# => CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
```

Alamat SAC ini **deterministik** dari `(asset, network passphrase)`: siapa pun yang menjalankan
`stellar contract id asset --asset sUSD:<ISSUER> --network testnet` akan mendapat alamat yang sama.
Deploy hanya perlu sekali; kalau nanti ada yang menjalankan ulang perintah di atas, hasilnya alamat
yang sama (atau error "sudah ter-deploy"), bukan kontrak baru.

---

## Cara dapat trustline + sUSD buat testing (buat James & Ancung)

Untuk bisa memegang sUSD, sebuah akun **wajib** punya trustline dulu. Tanpa trustline `transfer`
lewat SAC gagal — dan karena `enter` atomik, seluruh pendaftaran ikut ter-rollback.

**Sejak STE-6, ini satu perintah** (dari root repo):

```bash
pnpm install     # sekali
pnpm faucet --new
```

```
generated a new testnet keypair — the secret is printed once and saved nowhere:
  public  GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE
  secret  S…

account GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE
  1/3 XLM       account created and funded by Friendbot
  2/3 trustline opened for sUSD
  3/3 payout    12.5 sUSD sent, tx 3688fa62…
  balance seen by contracts (SAC): 12.5 sUSD
```

Baris terakhir dibaca lewat **SAC**, bukan Horizon. Itu disengaja: `RaceRecord.enter` memanggil
`balance` di SAC waktu menagih biaya, jadi angka itulah yang menentukan runner bisa bayar atau
tidak. Saldo yang kelihatan di explorer tapi tidak kelihatan dari kontrak tidak ada gunanya.

| Kondisi kamu | Perintah |
| --- | --- |
| belum punya akun | `pnpm faucet --new` |
| sudah punya akun | `pnpm faucet --secret S...` |
| **tidak** pegang kunci distributor | `pnpm faucet --new --no-payout` → akun + trustline beres, tinggal minta sUSD ke PM |
| butuh jumlah lain | `pnpm faucet --secret S... --amount 25` |

Tiap langkah aman diulang: jalankan dua kali, yang kedua cuma membaca dan melaporkan `already
present`. Membayar sUSD butuh `SUSD_DISTRIBUTOR_SECRET` di `be/.env`; tanpa itu dua langkah pertama
tetap jalan dan tool-nya menyebutkan apa yang kurang.

Alamat issuer, distributor, dan SAC **tidak di-hardcode** di backend — dibaca dari file ini.
Kalau nanti ada redeploy, ubah tabel di dokumen ini dan faucet ikut pindah dengan sendirinya.

### Bukti: akun hasil faucet benar-benar bisa `enter`

Ini yang membuat faucet-nya bukan sekadar "kelihatan berhasil". Akun
`GD7DHD3F…YVCE` di atas — yang lima menit sebelumnya belum ada di jaringan — memanggil `enter` di
RaceRecord yang live:

Tx: [`60948206…`](https://stellar.expert/explorer/testnet/tx/609482066aa04f3147e11c5cbdc3a2a88025ad83e31e459f4cac56c22e232c97)

```
slot_reserved   CDL6A734…  event_id 0, category_id 0, seq 1
transfer        CBQ6444…   GD7DHD3F… → GBGUI5MP…, 50000000 (5 sUSD)
mint            CDWFNF42…  to GD7DHD3F…, token_id 1
record_entered  CDWFNF42…  event_id 0, token_id 1, bib_no 1
```

Nol sampai pegang record: satu perintah faucet, satu panggilan `enter`.

### Cara manual (kalau tidak mau pakai Node)

```bash
ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW

# 1. punya akun testnet yang sudah di-fund
stellar keys generate <nama-kamu> --network testnet --fund

# 2. buka trustline ke sUSD (limit default = maksimum i64, aman untuk testing)
stellar tx new change-trust \
  --source-account <nama-kamu> \
  --line "sUSD:$ISSUER" \
  --network testnet
```

Setelah trustline aktif, minta saldo sUSD ke pemegang alias `sterun-susd-distributor` (PM).

Dari sisi frontend/wallet (Freighter, Stellar Wallets Kit) trustline ini adalah operasi
`changeTrust` klasik dengan asset `sUSD` + issuer di atas — bukan panggilan kontrak.

---

## Catatan penting: testnet vs mainnet

- **sUSD adalah asset testnet saja.** Dibuat supaya tim tidak bergantung pada faucet USDC pihak
  ketiga dan supaya alur pembayaran bisa dites end-to-end sekarang juga.
- **Mainnet akan memakai USDC (Circle)**, bukan sUSD. sUSD **di luar scope mainnet** dan tidak boleh
  ikut ke deployment produksi.
- Karena keduanya sama-sama classic Stellar asset dengan **7 desimal** dan sama-sama diekspos ke
  kontrak lewat SAC (SEP-41), pergantian sUSD → USDC hanya mengganti **alamat SAC** yang dipegang
  RaceRecord. Tidak ada perubahan logika kontrak.

---

## Verifikasi SEP-41 lewat SAC

Semua perintah di bawah ini **benar-benar dijalankan** dan output-nya disalin apa adanya.
Reviewer bisa menjalankan ulang yang read-only (`decimals`, `name`, `symbol`, `balance`) kapan saja —
tidak butuh secret key apa pun, cukup `--source-account` berupa akun testnet mana saja.

```bash
SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
DIST=GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO
A=GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF
B=GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS
```

### 1. Metadata token

```bash
$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- decimals
7

$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- name
"sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW"

$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- symbol
"sUSD"
```

| Fungsi | Nilai yang dikembalikan | Catatan |
| --- | --- | --- |
| `decimals` | `7` | ✅ sesuai `SYSTEM_DESIGN.md` §3.3 — harga `i128` dalam representasi 7 desimal |
| `name` | `"sUSD:GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW"` | format bawaan SAC: `CODE:ISSUER`, bukan "Sterun USD" |
| `symbol` | `"sUSD"` | ✅ persis asset code |

> Catatan buat frontend: `name` dari SAC **bukan** nama yang layak ditampilkan ke user (isinya
> `CODE:ISSUER`). Untuk UI pakai label "sUSD (Sterun USD)" dari sisi aplikasi, bukan hasil `name`.

### 2. Supply awal terlihat lewat SAC

```bash
$ stellar contract invoke --id $SAC --source-account sterun-susd-issuer --network testnet -- balance --id $DIST
"10000000000000"
```

`10000000000000` = 1.000.000 sUSD × 10^7. ✅ cocok dengan supply awal.

### 3. Positive case — `transfer` benar-benar memindahkan saldo

Pendanaan `sterun-test-a` sengaja dilakukan **lewat SAC** (`transfer`), bukan `payment` klasik,
supaya jalur kontrak yang persis dipakai RaceRecord ikut teruji.

```bash
# distributor -> A, 250 sUSD
$ stellar contract invoke --id $SAC --source-account sterun-susd-distributor --network testnet --send=yes \
    -- transfer --from $DIST --to $A --amount 2500000000
✅ Transaction submitted successfully!
📅 CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU - Success - Event: TransferWithAmountOnly (transfer),
   from: "GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO",
   to: "GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF", amount: "2500000000"

# A -> B, 100 sUSD, ditandatangani oleh A sendiri
$ stellar contract invoke --id $SAC --source-account sterun-test-a --network testnet --send=yes \
    -- transfer --from $A --to $B --amount 1000000000
✅ Transaction submitted successfully!
📅 CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU - Success - Event: TransferWithAmountOnly (transfer),
   from: "GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF",
   to: "GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS", amount: "1000000000"
```

Saldo lewat `balance` (unit mentah, 7 desimal) — sebelum dan sesudah `transfer` A → B sebesar
100 sUSD (`1000000000`):

| Akun | Sebelum | Sesudah | Selisih |
| --- | ---: | ---: | ---: |
| `sterun-test-a` | `2500000000` (250 sUSD) | `1500000000` (150 sUSD) | −`1000000000` |
| `sterun-test-b` | `0` | `1000000000` (100 sUSD) | +`1000000000` |
| `sterun-susd-distributor` | `10000000000000` | `9997500000000` | −`2500000000` (pendanaan A) |

✅ Saldo benar-benar berpindah, jumlahnya kekal, dan tidak ada sUSD yang tercipta/hilang.

Tx hash:

| Aksi | Tx hash | Ledger |
| --- | --- | --- |
| SAC `transfer` distributor → A, 250 sUSD | [`18a4a517…`](https://stellar.expert/explorer/testnet/tx/18a4a5178194ad597218b184ba0687879ce862248dc22049f961867f803b37a7) | 4431631 |
| SAC `transfer` A → B, 100 sUSD | [`3c94cf52…`](https://stellar.expert/explorer/testnet/tx/3c94cf524d8760f73ab33f71e6fa9222b343dbfe33af6be9dccf7ce551dfb3d0) | 4431635 |

### 4. Negative case — `transfer` yang seharusnya gagal, memang gagal

```bash
# B (saldo 100 sUSD) coba kirim 999 sUSD
$ stellar contract invoke --id $SAC --source-account sterun-test-b --network testnet --send=yes \
    -- transfer --from $B --to $A --amount 9990000000
❌ error: transaction simulation failed: HostError: Error(Contract, #10)
   [Diagnostic Event] ... data:["resulting balance is not within the allowed range", 0, -8990000000, 9223372036854775807]

# A coba transfer amount negatif
$ stellar contract invoke --id $SAC --source-account sterun-test-a --network testnet --send=yes \
    -- transfer --from $A --to $B --amount -1
❌ error: transaction simulation failed: HostError: Error(Contract, #8)
   [Diagnostic Event] ... data:["negative amount is not allowed", -1]
```

✅ Keduanya ditolak di tahap simulasi, jadi tidak ada tx yang masuk ledger dan saldo tidak berubah.
Ini penting untuk STE-9: RaceRecord tidak perlu menulis guard saldo sendiri — SAC sudah revert,
dan karena `enter` bersifat atomik, kegagalan `transfer` otomatis membatalkan reservasi kuota dan mint.

Selain itu, akun **tanpa trustline sUSD** tidak bisa menerima sUSD sama sekali. Ini konsekuensi
classic asset, bukan bug — karena itu STE-6 (faucet / trustline helper) harus memastikan runner punya
trustline **sebelum** dia mencoba `enter`.

---

## Handoff — siapa yang memakai alamat ini

Alamat SAC `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` adalah **satu-satunya**
alamat token yang dipakai di testnet. Yang mengonsumsinya:

- **STE-9 — RaceRecord contract.** `enter` melakukan cross-contract call `transfer(runner, organiser, price)`
  ke SAC ini. Alamat SAC disimpan sebagai config kontrak (di-set saat init/deploy), **jangan** di-hardcode
  di dalam kode kontrak, supaya penggantian ke USDC di mainnet cukup ganti nilai config.
- **STE-6 — faucet / trustline helper (James).** Butuh: issuer `G...` (untuk membangun operasi
  `changeTrust` di frontend/backend) dan alias distributor sebagai sumber saldo faucet. Perhatikan
  urutannya: fund akun → trustline → baru kirim sUSD.
- **STE-33 — deploy testnet + wiring.** Saat men-deploy EventRegistry & RaceRecord, alamat SAC ini
  yang dipasang sebagai token pembayaran, lalu hasil deploy-nya dicatat di section
  **Kontrak Soroban** di bawah.

---

## Kontrak Soroban — LIVE di testnet (STE-33, 2026-09-01)

Kedua kontrak Sterun sudah hidup di Stellar testnet dan sudah di-wiring satu sama lain.
Deploy-nya dilakukan oleh [`sc/scripts/deploy-testnet.sh`](../sc/scripts/deploy-testnet.sh),
bukan diketik manual, jadi bisa diaudit dan diulang.

| Kontrak | Contract address (`C...`) | Wasm hash (on-chain) | Link explorer |
| --- | --- | --- | --- |
| **EventRegistry** (C1, STE-5) | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` | `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` | <https://stellar.expert/explorer/testnet/contract/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64> |
| **RaceRecord** (C2, STE-9) | `CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4` | `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` | <https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4> |
| **SAC sUSD** (STE-30) | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` | — (built-in host, bukan wasm) | <https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU> |

### Wasm hash-nya dibaca dari chain, bukan dari file lokal

Kolom "Wasm hash" di atas **bukan** hasil `shasum` di laptop siapa pun — itu output
`stellar contract info hash --contract-id <C...> --network testnet`, jadi yang dilaporkan adalah
kode yang benar-benar dieksekusi kontraknya. Siapa pun bisa mengulangnya:

```bash
stellar contract info hash --contract-id CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64 --network testnet
# 61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474
```

Dan **keduanya sama persis** dengan hash artefak beku di `docs/specs/INTERFACE.md` §0 dan
`sc/README.md`. Jadi kontrak yang live di testnet ini adalah wasm yang sama yang menghasilkan TS
bindings di `sc/bindings/` — bukan build lain yang mirip.

> Ini kebetulan yang menyenangkan, bukan janji. `sc/README.md` mencatat bahwa build Rust tidak
> bit-for-bit reproducible lintas mesin (CI Linux menghasilkan hash `event_registry.wasm` yang
> berbeda dari macOS). Yang membuat baris di atas cocok adalah karena deploy dijalankan dari mesin
> yang sama dengan yang membekukan spec, **dan** karena `deploy-testnet.sh` memakai
> `stellar contract upload --optimize=false` lalu `deploy --wasm-hash` — bukan `deploy --wasm`
> yang akan mengoptimasi ulang dan mengubah byte-nya.

### Parameter deploy

| Item | Nilai |
| --- | --- |
| Network | Stellar **testnet** (`Test SDF Network ; September 2015`) |
| Admin / deployer | `GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` (alias `sterun-admin`) |
| EventRegistry constructor | `admin` = address di atas |
| RaceRecord constructor | `admin` = address di atas · `registry` = `CDL6A734…GTA64` · `token` = `CBQ6444…MOOU` (SAC sUSD) · `name` = `Sterun Race Record` · `symbol` = `STERUN` · `base_uri` = `https://sterun.xyz/record/` |
| Upgradeability | **tidak ada** — v1 non-upgradeable sesuai `docs/SYSTEM_DESIGN.md` §11 |

`token` sengaja parameter constructor, bukan konstanta: pindah ke USDC Circle di mainnet cukup
mengganti nilai ini, tanpa satu baris pun perubahan kode kontrak.

### Transaksi deploy

| Langkah | Tx |
| --- | --- |
| `upload` wasm EventRegistry | [`1f088e37…`](https://stellar.expert/explorer/testnet/tx/1f088e37c97e246bbe11aee484bd35d14864cbac1c855e41781ccefdb3d3ba9c) |
| `upload` wasm RaceRecord | [`295000e0…`](https://stellar.expert/explorer/testnet/tx/295000e0defa1b995bd72572c41a881819b7663aa3cba0c8f2a3076f3e0fd825) |
| `deploy` EventRegistry (+ `__constructor`) | [`0d50c6f0…`](https://stellar.expert/explorer/testnet/tx/0d50c6f008ac15ff34431b74690d0cfcfe1a8fc529ff93de5df35824ce2d8751) |
| `deploy` RaceRecord (+ `__constructor`) | [`ab95f07c…`](https://stellar.expert/explorer/testnet/tx/ab95f07cf49dba9fc3cd35d5a6a06fed48118c3fa2a2c6064572b0968e1abd5f) |
| `set_race_record` (wiring, sekali seumur hidup) | [`25e6c16d…`](https://stellar.expert/explorer/testnet/tx/25e6c16d41e7445940be05d6b99a2775ab7a477ca990c3dc314ebf571bead30d) |

### Wiring terverifikasi (read-only, siapa pun bisa ulang)

```bash
ER=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RR=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4

$ stellar contract invoke --id $ER --source-account <akun-testnet-apa-saja> --network testnet -- get_race_record
"CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4"

$ stellar contract invoke --id $RR --source-account <akun-testnet-apa-saja> --network testnet -- get_registry
"CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64"

$ stellar contract invoke --id $RR --source-account <akun-testnet-apa-saja> --network testnet -- get_token
"CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU"

$ stellar contract invoke --id $ER --source-account <akun-testnet-apa-saja> --network testnet -- event_count
1
```

`set_race_record` **one-shot**: panggilan kedua ditolak `Error(Contract, #7)` (`RaceRecordAlreadySet`)
— dibuktikan di bawah. Jadi caller tepercaya `reserve_slot` tidak bisa ditukar oleh siapa pun,
termasuk admin.

---

## Sanity check on-chain — rehearsal penuh di testnet nyata

Bukan simulasi, bukan unit test: semua di bawah ini transaksi yang benar-benar masuk ledger testnet.

### Akun yang dipakai

| Peran | Alias | Address |
| --- | --- | --- |
| Admin / deployer | `sterun-admin` | `GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` |
| Organiser | `sterun-organiser` | `GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN` |
| Runner | `sterun-runner-a` | `GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR` |

### 1. Setup event (organiser)

| Langkah | Hasil | Tx |
| --- | --- | --- |
| `create_event` | `event_id = 0`, event `EventCreated` ter-emit | [`4d1590cb…`](https://stellar.expert/explorer/testnet/tx/4d1590cbe9f34624b181d45d467392ea7648b48843db6fe2449465a5f114ac2a) |
| `add_category` `10K`, quota 5, harga 5 sUSD | `category_id = 0`, `CategoryAdded` ter-emit | [`fe0cc483…`](https://stellar.expert/explorer/testnet/tx/fe0cc48398ddb5519095130fe7be672cb74966749f7be56a96d98a49d8db5106) |
| `set_event_status` → `Open` | `EventStatusChanged` ter-emit | [`a4f3a72a…`](https://stellar.expert/explorer/testnet/tx/a4f3a72adb3e09ee7bbd836d9774dcdf88c054c64fcdfdf9094e599755b11f03) |

### 2. `enter` — satu transaksi, dan urutan event beku terbukti di chain

Runner memanggil `enter` sekali; harga 5 sUSD (`50000000` stroop). Yang menarik bukan cuma
berhasilnya, tapi **event log-nya**: empat event dari **tiga emitter berbeda**, persis urutan yang
dibekukan di `docs/specs/INTERFACE.md` §2.3 dan yang dijaga test
`enter_emits_four_events_from_three_emitters_in_the_frozen_order`.

Tx: [`3947eae3…`](https://stellar.expert/explorer/testnet/tx/3947eae36c104a6f880d09216ca83d75a08cacbb6db24180d057a1e71cedb85a)

| # | Event | Emitter | Isi |
| --- | --- | --- | --- |
| 1 | `slot_reserved` | `CDL6A734…` EventRegistry | `event_id: 0, category_id: 0, seq: 0` |
| 2 | `transfer` | `CBQ6444…` SAC sUSD | runner → organiser, `50000000` |
| 3 | `mint` | `CDWFNF42…` RaceRecord | `to: runner, token_id: 0` |
| 4 | `record_entered` | `CDWFNF42…` RaceRecord | `runner, event_id: 0, token_id: 0, bib_no: 0` |

Inilah alasan indexer (STE-16) harus key ke **contract id**, bukan ke posisi: kategori gratis
(`price_usdc == 0`) tidak memancarkan event nomor 2 sama sekali.

Saldo benar-benar berpindah, dicek lewat SAC:

| Akun | Sebelum | Sesudah |
| --- | ---: | ---: |
| Runner | `500000000` (50 sUSD) | `450000000` (45 sUSD) |
| Organiser | `0` | `50000000` (5 sUSD) |

### 3. Record yang lahir bisa diverifikasi siapa pun

```bash
$ stellar contract invoke --id $RR --source-account <akun-testnet> --network testnet -- record_of --token_id 0
{"bib_no":0,"category_id":0,"claimed_at":null,"entered_at":1788252277,"event_id":0,
 "finish_time_s":null,
 "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
 "result_at":null,"state":"Entered"}

$ ... -- verify --token_id 0 --participant_hash feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29
true
$ ... -- verify --token_id 0 --participant_hash 0000000000000000000000000000000000000000000000000000000000000000
false

$ ... -- owner_of --token_id 0      => "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR"
$ ... -- records_of --runner GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR   => [0]
$ ... -- total_supply               => 1
```

`participant_hash` yang dipakai **bukan angka karangan**: itu `expected_hash_hex` dari vector
`ph-04-messy-whitespace` di [`docs/specs/vectors/participant_hash.json`](specs/vectors/participant_hash.json).
Jadi siapa pun bisa menurunkan sendiri hash itu dari input mentahnya lewat
`bash docs/specs/verify.sh`, lalu mencocokkannya dengan yang tersimpan di chain.

### 4. Lifecycle penuh: Entered → RacepackClaimed → Finished

| Langkah | Hasil | Tx |
| --- | --- | --- |
| `claim_racepack` oleh organiser | `RacepackClaimed` ter-emit, `claimed_at` terisi | [`d3d4b5b3…`](https://stellar.expert/explorer/testnet/tx/d3d4b5b39f25db4ebc5a356d9f3cae34ec3a30ea0526f5adfec4ad3819df8156) |
| `record_finish` 3161 detik (00:52:41) | `RecordFinished` ter-emit | [`bb03229e…`](https://stellar.expert/explorer/testnet/tx/bb03229e880230defac4d1dab73bd5e7e550eb87d5f78b93fd3779a7d78ae52a) |

State akhir:

```json
{"bib_no":0,"category_id":0,"claimed_at":1788252342,"entered_at":1788252277,"event_id":0,
 "finish_time_s":3161,
 "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
 "result_at":1788252352,"state":"Finished"}
```

### 5. Kasus negatif — guard-nya terbukti hidup di chain, bukan cuma di test

Tiga panggilan berikut **sengaja** dijalankan dan **sengaja gagal**. Tidak ada yang masuk ledger
sebagai perubahan state.

| Panggilan | Hasil | Artinya |
| --- | --- | --- |
| `record_finish` saat state masih `Entered` | `Error(Contract, #103)` | `InvalidState` — tidak bisa mencatat finish untuk racepack yang belum diambil |
| `claim_racepack` kedua kali | `Error(Contract, #102)` | `AlreadyClaimed` — **guard anti-double-racepack**, satu pack per entry dijamin chain, bukan kedisiplinan volunteer |
| `set_race_record` kedua kali (oleh admin sendiri) | `Error(Contract, #7)` | `RaceRecordAlreadySet` — caller tepercaya `reserve_slot` tidak bisa ditukar, admin sekalipun |
| `reserve_slot` dipanggil langsung dari EOA | CLI menuntut tanda tangan dari address kontrak `CDWFNF42…` | gate invoker-contract: hanya RaceRecord yang bisa memesan slot; EOA tidak akan pernah punya kunci itu |

Perhatikan dua angka pertama vs yang ketiga: `#103` dan `#102` di band `100..=199` (RaceRecord),
`#7` di band `1..=99` (EventRegistry). Tooling cuma menampilkan angka telanjang tanpa identitas
kontrak — **band inilah** yang membuat SDK (STE-15) tahu peta error mana yang benar. Ini demonstrasi
langsung kenapa band itu ada.

### 6. Non-transferable, dicek pada kontrak yang live

```bash
$ stellar contract info interface \
    --contract-id CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4 \
    --network testnet \
  | grep -cE '^[[:space:]]*fn (transfer|transfer_from|approve|approve_for_all|burn|burn_from)\('
0
```

Nol. Kontrak yang benar-benar dipanggil orang mengekspor **18 fungsi**, dan tidak satu pun di
antaranya bisa memindahkan record. Bukan karena ada guard yang menolak — karena fungsinya memang
tidak ada. (EventRegistry: 16 fungsi.)

---

## Bukti e2e STE-11 — hash dari backend diterima kontrak yang live

Rehearsal di atas memakai `participant_hash` dari file vector. Ini yang membuktikan **backend
sungguhan** menghasilkan nilai yang diterima kontrak: PII masuk lewat API, hash-nya keluar, dan
hash itu yang dipakai `enter`.

| # | Langkah | Hasil |
| --- | --- | --- |
| 1 | `pnpm faucet` untuk akun yang baru dibuat | akun `GCYYG7CP…GIEE` pegang 50 sUSD |
| 2 | `POST /auth/challenge` + tanda tangan nonce | nonce sekali pakai, terverifikasi |
| 3 | `POST /participants` dengan PII berantakan (NBSP, TAB, LF, NIK ber-strip) | `participant_hash = dc86cb0d…15d1`, salt + `totp_secret` dikirim **sekali**; response tidak memuat satu pun potongan PII |
| 4 | `enter` di RaceRecord **live** dengan hash itu | `token_id = 2`, `bib_no = 2` — [`54c24055…`](https://stellar.expert/explorer/testnet/tx/54c24055a7bdc36e86531bbf686f8eebfd27f59be596258e8cbc89e90914630e) |
| 5 | `verify(2, dc86cb0d…15d1)` di kontrak | **`true`** |
| 6 | `POST /participants/2/confirm` | baris vault tertaut ke `token_id 2` + tx hash-nya |
| 7 | `GET /participants/:id` | metadata saja — nol PII di body |
| 8 | roster handoff (STE-16) | `totp_secret` ketemu dari `token_id`, menghasilkan kode check-in 6 digit |
| 9 | `SELECT name_enc` langsung dari Postgres | 62 byte ciphertext; `includes("Siti")` → **false** |

Yang dibuktikan langkah 4–5 dan tidak bisa dibuktikan test lokal mana pun: normalisasi backend
(NFC, collapse whitespace, strip separator NIK) menghasilkan **byte yang sama persis** dengan yang
di-hash `env.crypto().sha256()` di dalam host Soroban. Kalau backend dan spec pernah berpisah jalan
satu byte pun, langkah 5 mengembalikan `false`.

Record `token_id 2` di RaceRecord: <https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4>

---

## Handoff dari STE-33 — siapa yang memakai alamat ini

| Tiket | Butuh apa |
| --- | --- |
| **STE-15** `SterunClient` (James) | `EVENT_REGISTRY` + `RACE_RECORD` + `SUSD_SAC`; bindings-nya sudah ada di `sc/bindings/` (di-generate dari wasm yang sama dengan yang live di atas) |
| **STE-16** indexer (James) | contract id kedua kontrak untuk filter `getEvents`; bentuk topic/data beku di `INTERFACE.md` §1.3 & §2.3 |
| **STE-11** PII vault (James) | `participant_hash` dari `HASH_AND_TOTP.md`; contoh nyata tersimpan di `record_of(0)` |
| **STE-17/18/21/22** apps (Ancung) | contract id + SAC untuk flow entry, QR pass, dan scanner |
| **STE-31/32** deploy backend & web | ketiga address di atas sebagai env var |

```bash
STELLAR_NETWORK=testnet
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
SUSD_ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
```

> **Runner wajib punya trustline sUSD sebelum `enter`** kalau kategorinya berbayar. Tanpa
> trustline, `transfer` di dalam `enter` gagal dan seluruh `enter` ter-rollback (kuota tidak
> terpakai, tidak ada mint). Kategori **gratis** (`price_usdc == 0`) melewatkan `transfer`
> sepenuhnya, jadi tidak butuh trustline sama sekali.

### Re-deploy? Baca ini dulu

Kontrak v1 **non-upgradeable**. Menjalankan ulang `deploy-testnet.sh` tidak meng-upgrade apa pun —
dia menghasilkan **pasangan contract address baru** (deploy memakai salt acak), dan alamat lama
tetap hidup dengan datanya sendiri. Kalau itu memang yang diinginkan, ganti tabel di section ini
dan beri tahu semua konsumen di tabel handoff; jangan biarkan dua pasang alamat beredar diam-diam.
