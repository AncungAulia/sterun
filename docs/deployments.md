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

Untuk bisa memegang sUSD, sebuah akun **wajib** punya trustline dulu. Tanpa trustline, `transfer`
lewat SAC akan gagal. Langkahnya:

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

Setelah trustline aktif, minta saldo sUSD ke pemegang distributor (PM) — atau, kalau kamu yang pegang
alias `sterun-susd-distributor`, kirim sendiri lewat SAC (lihat section verifikasi di bawah untuk
bentuk perintah `transfer`-nya). Alur faucet yang rapi akan dibungkus di **STE-6**.

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

## Kontrak Soroban

> **Belum diisi.** Section ini diisi oleh **STE-33** (deploy testnet) setelah EventRegistry (STE-5)
> dan RaceRecord (STE-9) ter-deploy. Jangan isi dengan nilai karangan — kosongkan sampai deploy
> benar-benar terjadi.

| Kontrak | Contract address (`C...`) | Wasm hash | Link explorer |
| --- | --- | --- | --- |
| EventRegistry | _(TBD — STE-33)_ | _(TBD — STE-33)_ | _(TBD — STE-33)_ |
| RaceRecord | _(TBD — STE-33)_ | _(TBD — STE-33)_ | _(TBD — STE-33)_ |

Format link explorer yang dipakai: `https://stellar.expert/explorer/testnet/contract/<C...>`
