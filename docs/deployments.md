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

## Indeks alamat — semuanya, dengan link yang bisa diklik

Satu tabel supaya tidak perlu men-scroll: **setiap** contract address dan account address yang
dipakai Sterun di testnet, apa perannya, dan tiket yang menghasilkannya. Detail masing-masing ada
di section-section di bawah.

### Kontrak

| Kontrak | Peran | Address (klik = explorer) | Tiket |
| --- | --- | --- | --- |
| **EventRegistry v1** (C1) | event, kategori, kuota, harga, scanner allowlist, `reserve_slot` | [`CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64`](https://stellar.expert/explorer/testnet/contract/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64) | STE-33 |
| **RaceRecord v1** (C2) | record lari non-transferable + lifecycle, `enter` atomik | [`CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4`](https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4) | STE-33 |
| **SAC sUSD** | token biaya pendaftaran (SEP-41) yang dipanggil `enter` | [`CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`](https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU) | STE-30 |
| **EventRegistry** (C1) | v1 + add-on berbayar, status `Cancelled`, `upgrade` | [`CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`](https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) | STE-35 |
| **RaceRecord** (C2) | v1 + `enter(addon_ids)` tagih atomik, `upgrade` | [`CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW`](https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) | STE-35 |

> **Dua pasang alamat hidup berdampingan, dan itu disengaja.** v1 non-upgradeable, jadi add-on tidak
> bisa dipasang di tempat — v2 adalah pasangan baru. Baris **EventRegistry**/**RaceRecord** tanpa
> "v2" tetap menunjuk v1 karena `be/` masih dijalankan terhadap alamat itu (parser-nya membaca baris
> ini; lihat `be/src/deployments.ts`). Migrasi client-nya belum dikerjakan — checklist-nya di
> `docs/specs/INTERFACE.md` §8. Kalau kamu memulai integrasi **baru**, pakai yang v2.

### Account

| Account | Peran | Address (klik = explorer) | Tiket |
| --- | --- | --- | --- |
| `sterun-susd-issuer` | menerbitkan asset `sUSD` | [`GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW`](https://stellar.expert/explorer/testnet/account/GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW) | STE-30 |
| `sterun-susd-distributor` | memegang supply awal; sumber faucet | [`GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO`](https://stellar.expert/explorer/testnet/account/GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO) | STE-30 |
| `sterun-admin` | deployer + admin kedua kontrak | [`GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP`](https://stellar.expert/explorer/testnet/account/GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP) | STE-33 |
| `sterun-organiser` | organiser event rehearsal; penerima biaya pendaftaran | [`GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN`](https://stellar.expert/explorer/testnet/account/GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN) | STE-33 |
| `sterun-runner-a` | runner rehearsal — `token_id 0`, lifecycle penuh sampai `Finished` | [`GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR`](https://stellar.expert/explorer/testnet/account/GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR) | STE-33 |
| `sterun-runner-b` | runner hasil `pnpm faucet` — `token_id 1` | [`GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE`](https://stellar.expert/explorer/testnet/account/GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE) | STE-6 |
| runner e2e STE-11 | akun yang PII-nya lewat API — `token_id 2` | [`GCYYG7CP3RCOSRSAFPQGY6MTAT2DVF5HTSLNCWRIR2PF626CHZMVGIEE`](https://stellar.expert/explorer/testnet/account/GCYYG7CP3RCOSRSAFPQGY6MTAT2DVF5HTSLNCWRIR2PF626CHZMVGIEE) | STE-11 |
| `sterun-test-a` | uji `transfer` SEP-41 | [`GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF`](https://stellar.expert/explorer/testnet/account/GDHETLPDEWV4KLGNY6GZ4OWMP2I23EMX3SEBBHCQTFWFKR3SOP45PADF) | STE-30 |
| `sterun-test-b` | uji `transfer` SEP-41 | [`GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS`](https://stellar.expert/explorer/testnet/account/GD22GHP4CCK2JWXQMPA7GLOMCYIYTL52UUND5NJGHKNSBRPDIRYZ23LS) | STE-30 |

Asset `sUSD` sendiri:
<https://stellar.expert/explorer/testnet/asset/sUSD-GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW>

> **Semua di sini TESTNET.** Tidak ada nilai riil. Yang di-commit hanya public address (`G...`),
> contract address (`C...`), dan tx hash — tidak pernah secret key.

Env var untuk client (SDK STE-15, indexer STE-16, apps STE-17/18/21/22):

```bash
STELLAR_NETWORK=testnet
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
# v1 — yang sekarang dipakai be/ dan fe/
EVENT_REGISTRY=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
# v2 — add-on + upgradeable + Cancelled (STE-35). Interface: docs/specs/INTERFACE.md v2.0.0
# EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
# RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW
SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
SUSD_ISSUER=GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW
```

`enter` v2 memakai signature yang berbeda (`addon_ids` argumen ke-4), jadi **jangan** menunjuk
bindings v2 ke alamat v1 atau sebaliknya — panggilannya akan ditolak host, bukan gagal anggun.

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
| **EventRegistry v1** (C1, STE-5) | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` | `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` | <https://stellar.expert/explorer/testnet/contract/CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64> |
| **RaceRecord v1** (C2, STE-9) | `CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4` | `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` | <https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4> |
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

## Kontrak v2 — LIVE di testnet (STE-35, 2026-09-09)

Pasangan **kedua**, bukan pengganti di tempat: v1 tidak punya fungsi `upgrade`, jadi menambahkan
add-on berbayar yang diminta Ancung (STE-35) **harus** lewat alamat baru. Sekalian dipasangi
mekanisme upgrade, supaya ini terakhir kalinya alamat berganti.

| Kontrak | Address | Wasm hash on-chain (sha256) | Explorer |
| --- | --- | --- | --- |
| **EventRegistry** (C1) | `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | <https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU> |
| **RaceRecord** (C2) | `CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW` | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | <https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW> |

> Hash RaceRecord di tabel ini **bukan** hash saat deploy. Alamatnya di-upgrade sekali setelah
> deploy, ke wasm yang benar-benar berbeda — section 7 di bawah. Itu memang gunanya v2: alamat
> tetap, kode berganti.

Interface beku yang berlaku untuk pasangan ini: **`docs/specs/INTERFACE.md` v2.0.0**.
Yang di-deploy adalah `bash sc/scripts/deploy-testnet.sh` apa adanya, dan **seluruh** output di
bawah ini disalin dari satu run script itu.

### Parameter deploy

| Kontrak | Argumen constructor |
| --- | --- |
| EventRegistry v2 | `admin = GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP` |
| RaceRecord v2 | `admin = GA5CC…HNYP`, `registry = CAPB6…SHJU`, `token = CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (SAC sUSD), `name = "Sterun Race Record"`, `symbol = "STERUN"`, `base_uri = "https://sterun.xyz/record/"` |

Wiring `set_race_record` (admin, sekali seumur hidup):
<https://stellar.expert/explorer/testnet/tx/1d518f9d1701d0283605e9a6dcf4e57b43da94d3d995db2d3db5f32fc6ed27b8>

```
EventRegistry.get_admin        "GA5CCSCQ564AZL4RVOWGHVVGCJQNSM73X4T5MKNVCRPXANL3MGXEHNYP"
EventRegistry.get_race_record  "CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW"
RaceRecord.get_registry        "CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU"
RaceRecord.get_token           "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU"
```

### 1. Add-on berbayar, ditagih dalam SATU transfer

Event rehearsal `event_id 0`: kategori `10K` seharga 5 sUSD, plus dua add-on — jersey 5 sUSD kuota
2, tumbler 3 sUSD kuota 1.

```
event_id=0 category_id=0 quota=5 price=5 sUSD
addon jersey=0 (5 sUSD, quota 2)  tumbler=1 (3 sUSD, quota 1)
addon_count=2
```

`enter` dengan kedua add-on:

```
token_id=0
record_of  {"addon_ids":[0,1],"bib_no":0,"category_id":0,"claimed_at":null,
            "entered_at":1788925832,"event_id":0,"finish_time_s":null,
            "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
            "result_at":null,"state":"Entered"}
organiser received 130000000 stroops = category 5 + jersey 5 + tumbler 3 sUSD, in one transfer
jersey  {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":1}
tumbler {"code":"TUMBLER","price_usdc":"30000000","quota":1,"reserved_count":1}
```

Angka `130000000` itu **di-assert script**, bukan cuma dicetak: saldo organiser dibaca sebelum dan
sesudah, dan selisih yang bukan 5+5+3 sUSD menggagalkan deploy. Record-nya membawa `addon_ids`
`[0,1]`, jadi meja merch bisa memverifikasi pembelian dari chain, bukan dari email pesanan.

### 2. Guard add-on menyala di network nyata

```
the same add-on id twice:                       reverted with #107, as designed
more add-on ids than the event has:             reverted with #106, as designed
the tumbler, whose quota of 1 is already gone:  reverted with #15, as designed
```

`#106`/`#107` milik RaceRecord (band `100..=199`), `#15` milik EventRegistry (band `1..=99`) yang
merambat keluar dari `enter` apa adanya — persis gunanya band error.

**All-or-nothing, dibaca balik dari chain** setelah tiga penolakan di atas:

```
category {"code":"10K","distance_m":10000,"entered_count":1,"price_usdc":"50000000","quota":5}
jersey   {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":1}
runner-b sUSD "975000000" (unchanged: nothing was charged)
```

`entered_count` masih 1 (cuma entry pertama), stok jersey masih 1 terpakai, dan saldo runner-b tidak
bergerak sama sekali. Tidak ada slot yang hangus dan tidak ada uang yang diambil.

Stok yang tersisa memang masih bisa dibeli:

```
token_id=1 charged 100000000 stroops = category 5 + jersey 5 sUSD
record {"addon_ids":[0],"bib_no":1,...,"state":"Entered"}
jersey {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2} (sold out now)
a third buyer for the jersey:  reverted with #15, as designed
```

### 3. `Cancelled`

Event `event_id 1` dibuat, dibuka, lalu dibatalkan:

```
{"metadata_hash":"a4ea685c…","name":"Sterun Cancelled Rehearsal",
 "organiser":"GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
 "starts_at":1789000000,"status":"Cancelled","uri":"https://sterun.xyz/events/cancelled.json"}

entering a cancelled event:    reverted with #4, as designed
re-opening a cancelled event:  reverted with #11, as designed
```

`#4` = `EventNotOpen` milik EventRegistry: `reserve_slot` menuntut `Open`, jadi tidak ada guard
tambahan yang perlu ditulis untuk membatalkan pendaftaran. `#11` = `InvalidStatus`: `Cancelled`
terminal.

### 4. Upgrade — dijalankan beneran di testnet, bukan cuma di `cargo test`

Non-admin ditolak sebelum transaksinya bahkan terbentuk (CLI mensimulasikan, simulasi bilang yang
harus tanda tangan adalah admin **yang tersimpan**, bukan pemanggil):

```
a non-admin upgrading EventRegistry:
  rejected: the call requires GA5CCSCQ… (the stored admin) to sign, as designed
```

Lalu admin meng-upgrade **kedua** kontrak. Event `contract_upgraded` terbit di masing-masing:

| Kontrak | Tx upgrade | Event |
| --- | --- | --- |
| EventRegistry v2 | <https://stellar.expert/explorer/testnet/tx/0785274b240b43625abb6270b94d392e2ac234e503e85cffb55c9dfc2f1892a9> | `ContractUpgraded new_wasm_hash: "22bb432e…"` |
| RaceRecord v2 | <https://stellar.expert/explorer/testnet/tx/c89d4f7cde7633ca15fada634ec0fd84e8523156bf2ef383ee6d770f86593280> | `ContractUpgraded new_wasm_hash: "c90a4281…"` |

State yang ditulis **sebelum** upgrade, dibaca **sesudah**:

```
event      {"…","name":"Sterun Testnet Rehearsal","status":"Open",…}
category   {"code":"10K","distance_m":10000,"entered_count":2,"price_usdc":"50000000","quota":5}
jersey     {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2}
record     {"addon_ids":[0,1],"bib_no":0,…,"finish_time_s":3161,"state":"Finished"}
owner_of   "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR"
verify     true
addon_count 2
```

Termasuk key milik OpenZeppelin (`owner_of`) dan record yang sudah `Finished` — utuh, dan `verify`
masih `true` terhadap `participant_hash` yang sama.

Upgrade-nya memasang wasm yang **sama** dengan yang sedang jalan. Itu bukan test yang lebih lemah:
yang diuji adalah mekanismenya, gate admin-nya, dan bertahannya storage. Memasang wasm berbeda
berarti men-deploy artefak kedua yang tidak direview cuma untuk dibuang.

### 5. Non-transferable, dicek pada kontrak yang sudah di-upgrade

```
0 transfer-ish exports on the upgraded RaceRecord
```

Dibaca dari `stellar contract info interface --contract-id` terhadap network live, **sesudah**
upgrade. Perhatikan batas klaimnya sekarang (`docs/specs/INTERFACE.md` §4): yang dibuktikan adalah
wasm yang **terpasang**; bahwa kunci admin tidak akan memasang wasm lain adalah asumsi kepercayaan,
dan itulah sebabnya tiap upgrade meninggalkan `contract_upgraded` di ledger.

### 6. Lifecycle v1 tetap utuh

Guard lama diuji ulang di pasangan baru dan hasilnya sama:

```
record_finish before the racepack is claimed:  reverted with #103, as designed
set_race_record a second time:                 reverted with #7, as designed
claim_racepack a second time:                  reverted with #102, as designed
```

### 7. Upgrade in-place — wasm yang BEDA, alamat yang sama

Bagian 4 di atas meng-upgrade ke wasm yang sama dengan yang sedang jalan. Yang ini beda: satu
optimasi internal di `RaceRecord.enter` (melewati panggilan cross-contract `addon_count` kalau
`addon_ids` kosong, jadi entry tanpa add-on berbiaya persis seperti v1) menghasilkan wasm baru, dan
wasm itu dipasang ke **alamat yang sudah live** dengan `bash sc/scripts/upgrade-testnet.sh`.

```
=== EventRegistry (CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) ===
  live  22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f
  built 22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f
  identical — skipped, so the ledger records no upgrade that did not happen

=== RaceRecord (CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) ===
  live  c90a428152f0d8605cbb7466128b32b6dc821aa4735d930c280fe6fd4b58c0fc
  built 27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b
  uploaded 27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b
  now running 27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b
```

EventRegistry **dilewati** karena wasm-nya tidak berubah. Itu bukan malas-malasan: upgrade ke hash
yang identik tetap memakan satu transaksi dan tetap menulis `contract_upgraded` ke ledger, yang
membuat jejak audit mengklaim perubahan kode yang tidak pernah terjadi.

Tx upgrade RaceRecord:
<https://stellar.expert/explorer/testnet/tx/db3a27434e1e5da9f5eac38b3ca23c7670d0c773137b46fa13e5262697420488>

```
Event: ContractUpgraded (contract_upgraded),
new_wasm_hash: "27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b"
```

State yang ditulis kode lama, dibaca kode baru:

```
event 0     {…,"name":"Sterun Testnet Rehearsal","status":"Open",…}
category 0  {"code":"10K","distance_m":10000,"entered_count":2,"price_usdc":"50000000","quota":5}
addon 0     {"code":"JERSEY","price_usdc":"50000000","quota":2,"reserved_count":2}
addon_count 2
record 0    {"addon_ids":[0,1],"bib_no":0,…,"finish_time_s":3161,"state":"Finished"}
owner_of 0  "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR"
supply      2
0 transfer-ish exports
```

Dan jalur yang justru diubah optimasinya dijalankan **sesudah** upgrade — `enter` dengan
`addon_ids: []` di kontrak yang sudah berganti kode:

```
participant_hash = 764ec34cb935be1954e1205cac16b650d9f4ab100e421c97453ced4bdfb67243
token_id = 2   charged = 50000000 stroops (harga kategori saja, tanpa add-on)
record   {"addon_ids":[],"bib_no":2,"category_id":0,"entered_at":1788926622,"event_id":0,
          "state":"Entered",…}
addon 0  {"code":"JERSEY",…,"quota":2,"reserved_count":2}   ← stok tidak tersentuh
```

Record ke-3 lahir dari kode yang **berbeda** dari kode yang melahirkan record 0 dan 1, di kontrak
dan alamat yang sama, dengan `total_supply` yang menyambung. Itu bukti paling langsung bahwa
janji "ini terakhir kalinya alamat berganti" bisa ditagih.

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

## Bukti e2e STE-16 — indexer, rebuild, dan TTL keeper terhadap testnet yang live

Dijalankan **2026-09-02**, terhadap kontrak yang live di section di atas dan RPC testnet
(`https://soroban-testnet.stellar.org`). Tidak ada mock, tidak ada fixture: semua baris di bawah
diturunkan dari `enter`, `claim_racepack`, dan `record_finish` yang sudah benar-benar terjadi
on-chain di rehearsal STE-33 dan STE-11.

Postgres 17.6 lokal, database kosong. Perintahnya persis yang ada di `be/OPERATIONS.md`.

### 1. Poller: `getEvents` -> Postgres

```
$ pnpm indexer poll        # diulang sampai lastLedger >= latestLedger
poll  1: fetched=0  applied=0  last=4348835  latest=4469782
...
poll  9: fetched=14 applied=14 last=4446532  latest=4469791
poll 12: fetched=0  applied=0  last=4469794  latest=4469794   -> caught up
```

RPC memindai 10.000 ledger per request, jadi menyusuri jendela retensi butuh dua belas request.
Delapan di antaranya kosong, dan **halaman kosong bukan berarti sudah kejar** — itu yang membuat
`last_ledger` dibaca dari cursor, bukan dari `latestLedger` (lihat `be/OPERATIONS.md`).

14 event Sterun yang masuk, dipisah per nama:

| `chain_events.name` | jumlah |
| --- | ---: |
| `event_created` | 1 |
| `category_added` | 1 |
| `event_status_changed` | 1 |
| `slot_reserved` | 3 |
| `mint` | 3 |
| `record_entered` | 3 |
| `racepack_claimed` | 1 |
| `record_finished` | 1 |

Yang ter-materialisasi:

```
events      | 0 | GBGUI5MP…C4TN | Sterun Testnet Rehearsal 2026 | Open | source=event | ledger 4445728
categories  | 0 | 0 | 10K | 10000 m | quota 5 | 50000000 stroop | entered_count 3
records     | 0 | bib 0 | Finished | finish_time_s 3161 | source=event | ledger 4445753
            | 1 | bib 1 | Entered  |                    | source=event | ledger 4446148
            | 2 | bib 2 | Entered  |                    | source=event | ledger 4446532
```

`record_transitions`, dengan ledger dan tx hash sungguhan:

| token | dari | ke | `occurred_at` | ledger |
| ---: | --- | --- | --- | ---: |
| 0 | — | `Entered` | 1788252277 | 4445738 |
| 0 | `Entered` | `RacepackClaimed` | 1788252342 | 4445751 |
| 0 | `RacepackClaimed` | `Finished` | 1788252352 | 4445753 |
| 1 | — | `Entered` | 1788254327 | 4446148 |
| 2 | — | `Entered` | 1788256247 | 4446532 |

**Ini skenario cek yang diminta tiket** ("lakukan `enter` di testnet → row record muncul di Postgres
dengan state `Entered`"): record 1 dan 2 adalah dua `enter` sungguhan, dan keduanya mendarat sebagai
baris ber-state `Entered` dengan bib yang benar. `occurred_at` diambil dari jam kontrak
(`env.ledger().timestamp()`), bukan dari jam indexer.

### 2. `doctor` setelah follow

```
$ pnpm indexer doctor
{ "ok": true,
  "chain": { "events": 1, "records": 3 },
  "index": { "events": 1, "records": 3 },
  "findings": [] }
```

### 3. Drop -> rebuild -> konsisten lagi

Cek skenario kedua dari tiket, dijalankan terhadap chain sungguhan.

```
$ psql -c 'TRUNCATE records, events RESTART IDENTITY CASCADE'
   events=0  records=0  transitions=0  chain_events=14      # log mentah sengaja selamat

$ pnpm indexer rebuild
reading contract state — nothing is written until the walk finishes
rebuilt in 4536ms: 1 events, 1 categories, 3 records, 5 transitions.
Following resumes at ledger 4469811.
doctor: index matches the chain
```

Rebuild tidak membaca satu event pun — semuanya dari `event_count`, `get_event`, `category_count`,
`get_category`, `total_supply`, `record_of`, `owner_of`. Riwayat transisinya direkonstruksi dari
`entered_at`/`claimed_at`/`result_at` di `RecordData` dan ditandai `source = 'state'`,
`ledger IS NULL` — jujur soal apa yang tidak bisa diketahui state.

### 4. Endpoint query cepat, terhadap data hasil rebuild di atas

```
$ curl -s localhost:3011/indexer/status
{"stream":"contracts","last_ledger":4469811,"counts":{"events":1,"categories":1,"records":3,
 "record_transitions":5,"event_scanners":0,"chain_events":14},"cursor":null,...}

$ curl -s localhost:3011/events
{"events":[{"event_id":0,"organiser":"GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
 "event_name":"Sterun Testnet Rehearsal 2026","starts_at":"1789000000","status":"Open",
 "last_ledger":4469811,"metadata_hash":"2d548a2b…3b68",
 "uri":"https://sterun.xyz/events/sanity-2026-09-01.json","source":"state"}],"count":1}

$ curl -s localhost:3011/records/0
{"record":{"token_id":0,"bib_no":0,"runner_address":"GAJVXTF5…PWVR","state":"Finished",
 "participant_hash":"feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29",
 "entered_at":"1788252277","claimed_at":"1788252342","finish_time_s":3161,
 "result_at":"1788252352",…},"transitions":[…3 baris…]}

$ curl -s localhost:3011/runners/GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR/records
{"records":[{"token_id":0,…,"state":"Finished",…}],"count":1}
```

`participant_hash` `feb3cea9…fe29` di baris itu sama persis dengan yang dikembalikan `record_of(0)`
langsung dari kontrak — index-nya cache, bukan sumber kedua yang bisa berbeda pendapat.

### 5. Roster: allowlist dibaca dari chain, bukan dari database

```
$ curl -s localhost:3011/events/0/roster
401 {"error":"missing-credentials",…}

# keypair acak, challenge + tanda tangan yang sah:
/events/0/roster  403 {"error":"forbidden","message":"the authenticated account is neither the
                        organiser of this event nor an allowlisted scanner for it on-chain"}
/events/9/roster  404 {"error":"not_found","message":"no such event on-chain"}
```

403 itu jawaban `is_scanner(0, addr)` + `get_organiser(0)` dari **EventRegistry yang live**; 404-nya
adalah revert `EventNotFound(2)` yang dipetakan lewat band kode error. Jalur positifnya — bundle
lengkap dengan `totp_secret`, bib, dan `state` — dibuktikan di section 7 di bawah, setelah organiser
menjalankan `add_scanner`.

### 6. TTL keeper — sewa dibayar beneran on-chain

```
$ pnpm keeper scan
threshold 2073600 ledgers (~120.0 days), extend to 3110399 (~180.0 days)
run #2 (dry-run) at ledger 4477717: scanned 14 keys, 9 due, 0 extended, 0 not served by RPC

$ pnpm keeper run
run #5 (ok) at ledger 4477738: scanned 14 keys, 9 due, 9 extended, 0 not served by RPC
  SUCCESS 3ced4284f84850d37d2e0928f5bad958bc672c014daefd9e4a2b9e4055dd5a4c (9 keys)

$ pnpm keeper run          # sekali lagi, beberapa detik kemudian
run #6 (ok) at ledger 4477753: scanned 14 keys, 0 due, 0 extended, 0 not served by RPC
```

**Transaksi:**
[`3ced4284…`](https://stellar.expert/explorer/testnet/tx/3ced4284f84850d37d2e0928f5bad958bc672c014daefd9e4a2b9e4055dd5a4c)
— satu `ExtendFootprintTTLOp` atas 9 ledger key.
Akun keeper: [`GCYM7TQB…XV26`](https://stellar.expert/explorer/testnet/account/GCYM7TQBS7U6KSVJCFCYDHREYKO6UFINLSJ3K3EJAL2VHWIYRQLPXV26)
— XLM saja, tidak menguasai record apa pun.

Run #6 yang menemukan **0 due** beberapa detik setelah #5 adalah buktinya: perpanjangannya benar-benar
mendarat, dan sembilan entry itu sekarang di ~180 hari, bukan ~120.

14 ledger key-nya didapat dengan mensimulasikan `record_of`, `owner_of`, dan `records_of` untuk tiap
record dan tiap runner di index, lalu mengambil footprint yang dihitung host — termasuk entry `Owner`
milik OpenZeppelin dan index enumerable per-owner, yang **tidak** disentuh
`RaceRecord::extend_record_ttl`. TTL-nya nyata, dibaca lewat `getLedgerEntries`.

9 dari 14 jatuh tempo di run pertama karena entry persistent yang baru ditulis memang mulai di sekitar
120 hari, sama dengan threshold-nya. `0 not served by RPC` = belum ada yang ter-archive, jadi runbook
restore belum pernah dipakai.

> **Bug yang cuma ketahuan dengan mengirim transaksi sungguhan.** Run #3 dan #4 gagal
> `txFailed {"op_inner":{"extend_footprint_ttl":"malformed"}}`. Penyebabnya: `ExtendFootprintTTLOp`
> memvalidasi `extendTo` **strictly** di bawah `max_entry_ttl`, jadi `3110400` (= 180 hari, angka yang
> sama dengan `BUMP_TO` di kontrak) ditolak dan `3110399` diterima. Konstanta kontraknya tetap benar —
> host function `extend_ttl` **meng-clamp** ke maksimum, sementara operasinya **menolak**. Dua
> validator, satu maksud, beda satu ledger. Sekarang ditulis eksplisit di `be/src/keeper/ttl.ts` biar
> tidak ada yang "membetulkannya" balik.

---

### 7. Rangkaian penuh: PII → `enter` → indexer → roster, semuanya live

Dijalankan **2026-09-03**, setelah Axel mendanai runner dengan 50 sUSD dan menjalankan
`add_scanner(0, GCXOLP4L…ASSJ)`. Ini yang menutup dua lubang terakhir di bukti STE-16 — sebelumnya
`enter` yang di-index adalah `enter` orang lain, dan roster baru terbukti *menolak* orang asing.

| Identitas | Address | Peran |
| --- | --- | --- |
| runner | [`GAGDD5EP…E4SK`](https://stellar.expert/explorer/testnet/account/GAGDD5EPZKCBKCDDM373LDCUT2U5TMQHF675UAJ37CF6CQY3OGPBE4SK) | daftar + bayar 5 sUSD |
| scanner | [`GCXOLP4L…ASSJ`](https://stellar.expert/explorer/testnet/account/GCXOLP4LINZ4VDGFYBGA623YDGLID4Q6UT3T5O6N6LFCCDXK5T7NASSJ) | ter-allowlist on-chain oleh organiser |
| TTL keeper | [`GCYM7TQB…XV26`](https://stellar.expert/explorer/testnet/account/GCYM7TQBS7U6KSVJCFCYDHREYKO6UFINLSJ3K3EJAL2VHWIYRQLPXV26) | bayar sewa, XLM saja |

**Langkah dan hasilnya:**

| # | Langkah | Hasil |
| --- | --- | --- |
| 1 | `POST /participants` dengan PII berantakan (NBSP, TAB, NIK ber-strip, telepon berkurung) | `participant_hash = a8c22e0f…a655`; response tidak memuat satu pun potongan PII |
| 2 | `enter(runner, 0, 0, hash)` di RaceRecord **live**, ditandatangani runner | `token_id = 3`, `bib_no = 3`, ledger 4480668 — [`6d411b39…`](https://stellar.expert/explorer/testnet/tx/6d411b3921ca4b4e76e4c8498e02cfbff7924244b2f66e96f0c48fd2591eec0b) |
| 3 | `POST /participants/3/confirm` | baris vault tertaut ke `token_id 3` + tx hash-nya |
| 4 | `verify(3, a8c22e0f…a655)` di kontrak | **`true`** |
| 5 | `pnpm indexer poll` (2x, mengejar ~11.000 ledger) | `fetched=3 applied=3`, `last_ledger=4480673` |
| 6 | `GET /records/3` | `state: "Entered"`, `source: "event"`, `bib_no: 3`, transisi membawa ledger 4480668 + tx hash-nya |
| 7 | `GET /events/0/roster` sebagai scanner | **200**, `count=1`, `missing_from_index=0` |
| 8 | Kode TOTP dari `totp_secret` di bundle | scanner menghitung ulang → **cocok**; kode 5 menit lalu → **ditolak** |
| 9 | `GET /events/0/roster` sebagai keypair acak | **403** dari `is_scanner` yang live |

**Baris yang muncul di index** (`GET /events/0/records`) — perhatikan kolom `source`:

```
token_id  bib  state       source   last_ledger
       0    0  Finished    state    4469811
       1    1  Entered     state    4469811
       2    2  Entered     state    4480673
       3    3  Entered     event    4480668     <- enter di langkah 2
```

Tiga yang pertama datang dari rebuild (`state`); yang keempat datang dari `getEvents`
(`event`) dan karena itu membawa ledger dan tx hash-nya. Kolom `source` mengatakan mana yang mana,
tanpa perlu ditebak.

**Isi roster bundle:**

```
event_id=0  snapshot_ledger=4480673  count=1  missing_from_index=0
totp = {"digits":6,"step_seconds":30,"tolerance_steps":1}
token 3  bib 3  Entered  fragment="Ulin N. S."  secret=b927f7a6…
```

Nama yang masuk di langkah 1 adalah `"  Ulin Nuha\tSidiki "`. Yang keluar di roster
`"Ulin N. S."` — nama depan utuh, sisanya inisial. Response body-nya dicek tidak memuat
`"Ulin Nuha"`, `"Sidiki"`, potongan NIK, maupun potongan nomor telepon.

Yang dibuktikan langkah 4 dan tidak bisa dibuktikan test lokal mana pun: normalisasi backend (NFC,
collapse whitespace, strip separator NIK) menghasilkan **byte yang sama persis** dengan yang di-hash
`env.crypto().sha256()` di dalam host Soroban. Beda satu byte saja, langkah 4 mengembalikan `false`.

Yang dibuktikan langkah 8: `totp_secret` yang diserahkan ke scanner memang secret yang sama yang
dipakai device runner, jadi verifikasi check-in benar-benar bisa terjadi **offline** di kedua sisi —
dan jendela ±1 step-nya benar-benar menolak kode basi.

---

## Handoff dari STE-33 — siapa yang memakai alamat ini

| Tiket | Butuh apa |
| --- | --- |
| **STE-15** `SterunClient` (James) | **SELESAI** — `EVENT_REGISTRY` + `RACE_RECORD` + `SUSD_SAC`; bindings-nya di `sc/bindings/` (di-generate dari wasm yang sama dengan yang live di atas). Bukti live di section "Bukti e2e STE-15" |
| **STE-19** JSON Schema + publish (James) | **kode SELESAI**, `npm publish` menunggu kredensial npm. Bukti packaging di section "Bukti STE-19" |
| **STE-16** indexer (James) | **SELESAI** — contract id kedua kontrak untuk filter `getEvents`; bentuk topic/data beku di `INTERFACE.md` §1.3 & §2.3. Bukti live di section di atas |
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

---

## Bukti e2e STE-15 — seluruh flow lewat `@sterun/sdk`, nol Rust

Dijalankan **2026-09-05** dengan `pnpm --filter @sterun/sdk e2e` terhadap testnet yang live, memakai
`EVENT_REGISTRY` dan `RACE_RECORD` di tabel paling atas file ini (dibaca dari dokumen ini, bukan
di-hardcode). Semua aktor adalah akun Friendbot baru yang dibuat saat itu juga dan dibuang setelahnya —
jadi run ini tidak memakai secret siapa pun dan **tidak** menumpang event rehearsal STE-33 (kategori
event itu tinggal 1 slot; menghabiskannya berarti mengambil jatah mock race STE-25).

Yang dibuktikan: seluruh rantai `createEvent → addCategory → setEventStatus(Open) → enter →
recordsOf → addScanner → claimRacepack → recordFinish → verify` bisa dijalankan **hanya** lewat
`SterunClient` — tanpa Rust, tanpa Stellar CLI, tanpa merakit XDR sendiri.

### Aktor

| Peran | Address |
| --- | --- |
| organiser | [`GB2V3PI26Y57G2BHK5QRDPELZTKKHSMNA26LRHLAZOXFKVVFTOBYQA5X`](https://stellar.expert/explorer/testnet/account/GB2V3PI26Y57G2BHK5QRDPELZTKKHSMNA26LRHLAZOXFKVVFTOBYQA5X) |
| runner | [`GDIN3Z63PDERDBZMCOTSPRHWUMR5FLRBUOPY3OLYVAMHPSSXGE2PO6JB`](https://stellar.expert/explorer/testnet/account/GDIN3Z63PDERDBZMCOTSPRHWUMR5FLRBUOPY3OLYVAMHPSSXGE2PO6JB) |
| scanner | [`GCQ6S5LVQDMMQHNG3FDLPR7IUZ4MKD6UKGR5Y3EJKFF5Z7QUNHWMCYQR`](https://stellar.expert/explorer/testnet/account/GCQ6S5LVQDMMQHNG3FDLPR7IUZ4MKD6UKGR5Y3EJKFF5Z7QUNHWMCYQR) |

### Transaksi (klik = explorer)

`event_id 1`, `token_id 4`, bib `0`, selesai `3161` detik, state akhir **`Finished`**.

| Langkah | Tx hash |
| --- | --- |
| `createEvent` | [`d099ced765c315b852edb799f5cdf76b5d600bf983b6e9d141d4c2dd4f756120`](https://stellar.expert/explorer/testnet/tx/d099ced765c315b852edb799f5cdf76b5d600bf983b6e9d141d4c2dd4f756120) |
| `setEventStatus(Open)` | [`40c07a20a7760fc601ad4d137be5291f2ed3a206afdc3660bb46b75031c9ee2a`](https://stellar.expert/explorer/testnet/tx/40c07a20a7760fc601ad4d137be5291f2ed3a206afdc3660bb46b75031c9ee2a) |
| `enter` | [`21fd47cd4a4434c96f2011c7bd265b9cd3cebf368552bbd864afc5542bf66f89`](https://stellar.expert/explorer/testnet/tx/21fd47cd4a4434c96f2011c7bd265b9cd3cebf368552bbd864afc5542bf66f89) |
| `claimRacepack` | [`93dd8c71c773b3bb4498c1a719c532aae3d776f76001b2e807a0ff3bec408488`](https://stellar.expert/explorer/testnet/tx/93dd8c71c773b3bb4498c1a719c532aae3d776f76001b2e807a0ff3bec408488) |
| `recordFinish` | [`1551d85420a4ab16285243a9732d4d61a2f8affd6f1c5a1245478499b156c647`](https://stellar.expert/explorer/testnet/tx/1551d85420a4ab16285243a9732d4d61a2f8affd6f1c5a1245478499b156c647) |

### Negative case — dan yang penting, **band**-nya benar

Tiap baris ini bukan sekadar "gagal": SDK menyebut varian **dan** kontrak asalnya. Itu aturan band
`INTERFACE.md` §3 yang terbukti terhadap kontrak yang benar-benar ter-deploy, bukan terhadap fake.

| Yang dicoba | Hasil |
| --- | --- |
| `enter` saat event masih `Draft` | `EventNotOpen` **#4** (event-registry) |
| `setEventStatus(Open)` padahal sudah `Open` | `InvalidStatus` **#11** (event-registry) |
| `enter` ke kategori yang kuotanya habis | `QuotaFull` **#5** (event-registry) |
| `recordFinish` sebelum race pack diambil | `InvalidState` **#103** (race-record) |
| `claimRacepack` dari device yang belum di-allowlist | `NotAuthorized` **#104** (race-record) |
| `claimRacepack` kedua kali | `AlreadyClaimed` **#102** (race-record) |
| `recordDnf` setelah `Finished` | `InvalidState` **#103** (race-record) |

Perhatikan tiga baris pertama: itu revert milik **EventRegistry** yang merambat keluar lewat
`enter`/`set_event_status` di RaceRecord. Tanpa band disjoint, `#4` bisa saja dikira `InvalidState`
milik RaceRecord.

### `verify` dan pembacaan tanpa wallet

`participant_hash` dihitung dengan implementasi referensi beku
(`docs/specs/reference/node/`), jadi hash yang dikirim SDK adalah hash yang sama dengan yang
dipatok test kontrak.

- `verify(token_id, hash_benar)` → **`true`**
- `verify(token_id, hash_salah)` → **`false`**
- `verify(999999, hash)` → **`false`** (token tidak dikenal tidak revert)

Seluruh pembacaan diulang lewat client **tanpa `publicKey` dan tanpa signer sama sekali**
(`sterun.readOnly()`): `recordsOfDetailed`, `verify`, dan `getCategory` semuanya jalan. Ini yang
membuat public profile page (STE-24) bisa benar-benar publik.

### Leg berbayar — SUDAH dijalankan (2026-09-06)

Run pertama melewatkan `enter` berbayar karena `SUSD_DISTRIBUTOR_SECRET` tidak ada di mesin itu.
Secret-nya kemudian tersedia, dan leg-nya dijalankan:

```
▸ Paid entry (5 sUSD), fee moving runner → organiser inside `enter`
  runner-p  GBG2UYH2XOGQ76FLCH4U3FCYMZKXD7GQ4SMMXLUWFCNZGGTNJOLDCCYC
  funded GBG2UYH2XOGQ76FLCH4U3FCYMZKXD7GQ4SMMXLUWFCNZGGTNJOLDCCYC with 10 sUSD
  ✓ token_id 9, organiser received exactly 5 sUSD
  ✓ one transaction did quota + fee + mint
```

| Item | Nilai |
| --- | --- |
| event_id | 3 |
| organiser | [`GCROPABZJK5KDTUYMQAVSCYX5V25ZSQ5MVPGORB5UNEUQ4K6C3IEQ6XH`](https://stellar.expert/explorer/testnet/account/GCROPABZJK5KDTUYMQAVSCYX5V25ZSQ5MVPGORB5UNEUQ4K6C3IEQ6XH) |
| token_id (gratis) | 8 — bib 0, `Finished` 3161s |
| token_id (berbayar) | 9 |
| `enter` (5 sUSD) | [`d379b26958a981a304701c958606f1fa5cb4e4e1c8fcc698b15bd11046058c97`](https://stellar.expert/explorer/testnet/tx/d379b26958a981a304701c958606f1fa5cb4e4e1c8fcc698b15bd11046058c97) |
| fee diterima organiser | **persis 5 sUSD** |

Ini yang membuktikan klaim atomicity `enter` sampai ujung: **satu transaksi**, **satu tanda tangan
runner**, dan di dalamnya ada `transfer` SEP-41 yang tidak pernah ditandatangani terpisah. Saldo
organiser diperiksa sebelum dan sesudah, dan selisihnya persis biaya pendaftaran — bukan kira-kira.

> Kategori **gratis** (`price_usdc == 0`) melewatkan `transfer` sepenuhnya, jadi leg yang sudah
> jalan di atas memang tidak menyentuh SAC — itu perilaku yang benar sesuai `INTERFACE.md` §2.1,
> bukan jalan pintas.

---

## Bukti STE-19 — `@sterun/sdk` dipasang dari tarball di project kosong

Dijalankan **2026-09-05**. Yang dibuktikan: paket yang akan di-`npm publish` benar-benar bisa
dipakai orang di luar tim, tanpa akses ke repo ini.

`npm publish` sendiri **belum** dijalankan — butuh kredensial npm milik James (lihat runbook di
bawah). Semua langkah sebelum upload sudah diverifikasi dengan `npm pack`, yang menghasilkan
tarball **persis** seperti yang akan diunggah.

### Isi tarball

```
$ npm pack
sterun-sdk-0.1.0.tgz    33 files, 55 KB

package/dist/*.js + *.d.ts          SterunClient, errors, schema, document
package/vendor-dist/*.js + *.d.ts   bindings kontrak, ikut dibundel
package/schema/race-record-v1.0.json
package/README.md
package/package.json
```

`dependencies` di tarball: `@stellar/stellar-sdk ^17.0.1` dan `zod ^4.1.13` — **tidak ada `file:`
dependency**, yang memang tidak bisa di-publish. Itu alasan bindings di-vendor ke `sdk/vendor/`.

### Project pihak ketiga

Project TypeScript kosong **di luar repo** (`/tmp/…/thirdparty`), cuma `package.json` +
`tsconfig.json`, lalu:

```bash
npm install ./sterun-sdk-0.1.0.tgz
npx tsc --noEmit     # bersih — nol error dari @sterun/sdk
npx tsx quickstart.ts
```

Quickstart-nya adalah isi README apa adanya; tidak ada satu pun import relatif ke repo ini.

```
getEvent(0)      : Sterun Testnet Rehearsal 2026 | Open
recordsOf        : #0 Finished
verify           : true for the real hash, false for a wrong one
document         : valid against RaceRecord JSON Schema v1.0.0
  event          : Sterun Testnet Rehearsal 2026
  category       : 10K 10000m 50000000 stroops
  state          : Finished | finish 3161s
  link           : https://stellar.expert/explorer/testnet/contract/CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
schema $id       : https://sterun.xyz/schemas/race-record/v1.0.json
typed error      : EventNotFound #2 (event-registry)

✅ third-party quickstart passed from a clean project
```

Empat hal yang dibuktikan sekaligus:

1. **Baca tanpa wallet** — nol `publicKey`, nol signer, dan datanya keluar.
2. **Dokumen valid terhadap schema-nya sendiri** — di-`JSON.stringify` lalu di-`parse` ulang lewat
   `parseRaceRecordDocument`, jadi yang divalidasi adalah JSON sungguhan, bukan object di memori.
3. **Typed error selamat melewati packaging** — `EventNotFound #2` masih membawa band
   `event-registry`, bukan sekadar string.
4. **`price_stroops` tetap string** (`"50000000"`), jadi `i128` tidak pernah lewat double.

### Runbook publish (tinggal dijalankan James)

```bash
npm login                                   # akun yang memiliki scope @sterun
cd sdk
pnpm --filter @sterun/sdk test              # 134 test harus hijau
npm publish --access public                 # prepack menjalankan build otomatis
```

Setelah itu, verifikasi dari mesin bersih:

```bash
mkdir /tmp/verify && cd /tmp/verify && npm init -y
npm install @sterun/sdk
node -e "import('@sterun/sdk').then(m => console.log(m.RACE_RECORD_SCHEMA_VERSION))"   # 1.0.0
```

> Scope `@sterun` di npm belum ada saat catatan ini ditulis (`npm view @sterun/sdk` → 404), jadi
> publish pertama sekaligus membuat scope-nya. Kepemilikan org npm ada di owner tiket, sesuai
> "Left to the owner" di STE-19.

---

## Bukti e2e STE-20 — review hasil CSV terhadap testnet yang live

Dijalankan **2026-09-05** dengan `pnpm --filter be e2e:results`. Bukan simulasi: event-nya dibuat
sungguhan di testnet lewat `@sterun/sdk`, di-index oleh indexer STE-16 dari **state kontrak**, lalu
dibaca ulang lewat route yang sama yang dilayani `pnpm dev`. Semua akun adalah akun Friendbot sekali
pakai, jadi tidak butuh secret siapa pun; kategorinya gratis, jadi jalur `transfer` SEP-41 memang
tidak tersentuh.

```
event_id        2
organiser       GBMAOPRWUEX3DKNESZ2SVQLP2UIZ4A66NQHEOAK6EQCZQ45P5BY75E4S
categories      0 (10km), 1 (5km)   ← dua-duanya menomori bib mulai dari 0
token_ids       5, 6, 7             ← dua RacepackClaimed, satu masih Entered
source_sha256   2d09063479983e69160f269e2164ce48fe91a7f2791aeb592364bdfab3167c27
publishable     2 dari 8 baris
```

### CSV yang diunggah, dan jawabannya per baris

| Baris | Isi | Hasil |
| --- | --- | --- |
| 2 | `0,0,52:41` | **ok** — dan `52:41` dibaca **3161 detik**, bukan 5241 |
| 3 | `1,0,3200` | **ok** |
| 4 | `1,0,3300` | `duplicate_bib` (*wrong*) — "bib 1 already appears on line 3 of this file" |
| 5 | `99,0,3161` | `unknown_bib` (*reverts*) — "no entry with bib 99 in category 0 for this event" |
| 6 | `0,,3161` | `ambiguous_bib` (*wrong*) — "bib 0 exists in categories 0, 1 …" |
| 7 | `2,0,3161` | `unknown_bib` (*reverts*) — terdaftar di kategori 1, bukan 0 |
| 8 | `0,1,120` | `not_claimed` (*reverts*) **dan** `impossible_time` (*wrong*) — "120s over 5000m is 41.7 m/s" |
| 9 | `xx,0,3161` | `malformed_row` (*wrong*) — "bib number \"xx\" is not a whole number" |

Tiap anomali datang dengan **alasan yang bisa ditindaklanjuti**, bukan kode yang harus dicari
artinya. Baris 8 membuktikan satu baris bisa gagal karena lebih dari satu hal sekaligus — organiser
yang cuma diberi tahu masalah pertama akan mengunggah ulang dan diberi tahu masalah berikutnya.

### `ambiguous_bib` terbukti nyata, bukan teoretis

Baris 6 adalah temuan yang tidak ada di daftar anomali tiket. `reserve_slot` mengembalikan
`entered_count` milik **kategori**, jadi di event ini bib 0 benar-benar ada dua: satu di kategori 0
(10km) dan satu di kategori 1 (5km). CSV `(bib_no, finish_time)` polos — persis bentuk yang diminta
tiket — tidak bisa menyebut yang mana. Menebak berarti mem-publish waktu satu pelari ke record
pelari lain, dan `Finished` itu terminal.

### Yang juga dibuktikan

- **`source_sha256`** dihitung dari byte yang persis diunggah, sebelum parsing. Itu nilai yang
  dicatat di event metadata supaya hasil ter-publish tetap tamper-evident (SYSTEM_DESIGN §11 risiko 4).
- **Response tidak membawa address pelari** — dicek eksplisit terhadap payload mentah.
- **Auth-nya organiser, dibaca dari chain.** Scanner yang ter-allowlist pun ditolak 403: dia boleh
  meng-check-in orang, bukan mem-publish hasil.

---

## STE-31 — backend LIVE di jameserver

Deployment nyata, 2026-09-06/07. Backend Sterun berjalan di homelab James, di domain sendiri, lewat
Cloudflare Tunnel.

### Base URL

```
https://api-sterun.jameshub.fun
```

Sertifikat Cloudflare, HTTP/2. Verifikasi eksternal **14 dari 14 lolos**.

> **Bukan `api.sterun.jameshub.fun` seperti bunyi tiket**, dan alasannya bukan konfigurasi:
> Universal SSL Cloudflare cuma menerbitkan sertifikat **satu tingkat**. Detail + buktinya di
> bawah.

### Di mana ia berjalan

| Item | Nilai |
| --- | --- |
| Node Proxmox | `pve02` (cluster `homelab`) |
| Container | LXC **203** `ct-sterun`, Debian 13, unprivileged + `nesting=1` |
| IP LAN | `192.168.18.42` |
| Path | `/opt/sterun` |
| Proses | Postgres 17, API, poller (`indexer follow`), TTL keeper (`keeper run`) |
| Restart | `unless-stopped` + `onboot=1` di LXC — selamat dari reboot dan mati listrik |
| TTL keeper | [`GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4`](https://stellar.expert/explorer/testnet/account/GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4) — akun baru khusus VPS ini |

Konvensi diikuti dari cluster yang sudah ada: vmid `2xx` untuk pve02, prefix `ct-`, IP
`192.168.18.4x`, bridge `vmbr0`.

### Bahwa ia hidup dan benar

Migrasi jalan sendiri sebelum socket dibuka — `001_pii_vault`, `002_indexer`, `003_name_fragment`,
`004_auth_nonces`. Log startup melaporkan `"nonces":"postgres"`, artinya jalur nonce yang aman untuk
lebih dari satu instance memang aktif di produksi, bukan cuma ada kodenya.

Poller menelan event dari testnet yang live sejak menit pertama; keeper memindai record dan
melaporkan `0 due` (benar — belum ada yang mendekati batas TTL).

### Kenapa `api-sterun` dan bukan `api.sterun`

Nama dua tingkat butuh sertifikat `*.sterun.jameshub.fun`. Universal SSL cuma menerbitkan
`jameshub.fun` dan `*.jameshub.fun` — **satu tingkat**. Yang dua tingkat butuh Advanced Certificate
Manager (berbayar) atau Total TLS.

Dibuktikan, bukan ditebak:

| Hostname | Hasil |
| --- | --- |
| `api.sterun.jameshub.fun` | `SSL alert number 40` — handshake ditolak di edge Cloudflare |
| `api-sterun.jameshub.fun` | **14/14 lolos** |

Yang bikin gejalanya menyesatkan: request-nya **tidak pernah sampai** ke tunnel, jadi log cloudflared
bersih dan keempat koneksinya sehat. Persis kelihatan seperti tunnel mati.

Nama dua tingkat itu **tidak lagi terdaftar** di mana pun: CNAME-nya dihapus dari zona, dan
aturan ingress-nya dihapus dari `deploy/cloudflared-config.yml` di perubahan yang sama. Aturan
tanpa DNS cuma kode mati yang menyiratkan URL yang sebenarnya NXDOMAIN. Kalau ACM/Total TLS suatu
saat diaktifkan, keduanya dikembalikan bersamaan.

### Ingress: Cloudflare Tunnel

Tunnel `sterun-api`, **4 koneksi** (Jakarta ×2, Singapura ×2). Dial keluar, jadi router yang tidak
mem-forward apa pun tidak lagi jadi masalah; TLS diurus Cloudflare; record DNS dibuat oleh tunnel
sendiri.

**Locally-managed**: aturan routing di `deploy/cloudflared-config.yml` di dalam repo, bukan di
dashboard — bisa di-review di PR dan ikut ter-rollback. Credentials-nya di `secrets/`, gitignored.

Tailscale Funnel yang sempat dipakai sebagai ingress sementara sudah **dimatikan** — satu pintu
publik, bukan dua yang tidak diurus.

### Kenapa BUKAN Caddy

Router homelab ini **tidak mem-forward port 80/443**. Diuji, bukan diasumsikan: listener sementara
dipasang di port 80 pve01, lalu WAN IP-nya (`182.253.126.14` — IP publik asli, bukan CGNAT) diprobe
dari internet lewat proxy eksternal. Timeout (522).

Konsekuensinya: **ACME HTTP-01 mustahil**, jadi Caddy di dalam `compose.prod.yml` tidak akan pernah
mendapat sertifikat di sini. Profil `caddy` tetap ada untuk host yang mem-forward port; di host ini
ia tidak pernah dinyalakan.

Itulah yang memilih **Cloudflare Tunnel** (bagian di atas): tunnel dial **keluar**, jadi router yang
tidak mem-forward apa pun berhenti jadi masalah, TLS diurus Cloudflare, dan record DNS-nya dibuat
oleh tunnel sendiri — tidak ada A record yang perlu ditambah manual.

**Tailscale Funnel** di pve01 sempat dipakai sebagai ingress sementara sebelum tunnel ter-autentikasi.
Sudah dimatikan (`tailscale funnel --https=443 off`) begitu tunnel hidup — satu pintu publik, bukan
dua yang tidak diurus. Prosedur menyalakannya lagi kalau tunnel bermasalah: `be/OPERATIONS.md`.

### Verifikasi dari luar, tanpa SSH

`./deploy/verify-deployment.sh https://api-sterun.jameshub.fun` — **18 dari 18 lolos**,
2026-09-08T01:33:54Z (14/14 saat STE-31; empat cek file ditambahkan sesudahnya):

```
▸ TLS
  ✓ serves over HTTPS with a certificate curl trusts
  ✓ sends HSTS
▸ Liveness and readiness
  ✓ /health -> {"status":"ok","uptimeSeconds":20138}
  ✓ /ready -> database reachable
▸ Pointing at the right chain
  ✓ EventRegistry CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
  ✓ RaceRecord    CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4
  ✓ network       testnet
  ✓ vault mounted · indexer mounted · results mounted
▸ The sensitive endpoints still say no
  ✓ GET /events/0/roster -> 401 without a signature
  ✓ GET /participants/… -> 401 without a signature
  ✓ POST /events/0/results/preview -> 401 without a signature
▸ Documentation
  ✓ /openapi.json describes the API
```

Baris yang paling penting bukan `/health`, tapi tiga baris terakhir sebelum dokumentasi: endpoint
sensitif **tetap menolak** pemanggil tanpa tanda tangan. Deploy yang salah di situ akan menyajikan
data bersinggungan-identitas ke internet sambil terlihat sehat sempurna di semua cek lain.

### Selamat dari reboot — diuji, bukan diklaim

STE-31 mensyaratkan restart otomatis saat crash/reboot. Container LXC-nya di-`pct reboot`, lalu
didiamkan:

```
sebelum : {"status":"ok","uptimeSeconds":556}
[pct reboot 203]
sesudah : {"status":"ok","uptimeSeconds":14}      ← proses baru
          {"status":"ready","checks":{"database":"ok"}}
          api|Up 19s (healthy)  indexer|Up 20s  keeper|Up 19s  postgres|Up 19s (healthy)
```

**Tanpa satu perintah pun** setelah reboot. `onboot=1` di LXC menyalakan container, dan
`restart: unless-stopped` menyalakan keempat service.

Dua detail yang bagus dari lognya:

- Indexer menerima SIGTERM dan **berhenti dengan rapi** — `finishing the current page, then
  stopping` — bukan dibunuh di tengah halaman.
- Setelah hidup lagi dia **melanjutkan dari cursor**, bukan mengulang dari nol: hitungannya tetap
  4 event / 10 record / 56 chain event, dan `last_ledger` maju. Kalau dia meng-ingest ulang,
  angkanya akan naik.

### File metadata event — LIVE

`POST /events/files` + `GET /files/:sha256`, live di deployment yang sama. Diminta Ancung buat
organiser console (STE-17): wizard butuh `uri` + `metadata_hash` untuk `create_event`, dan sebelum
ini panitia disuruh hosting sendiri.

**Content-addressed**: nama file adalah sha256 isinya, jadi URL dan sidik jarinya satu benda. Itu
yang membuat `metadata_hash` on-chain tidak mungkin berselisih dengan file yang disajikan.

Dijalankan terhadap `https://api-sterun.jameshub.fun` pada 2026-09-08T01:34Z:

```
1. upload            -> 201 https://api-sterun.jameshub.fun/files/40e511e6…678d.json
   sha256 cocok      -> true
2. fetch             -> 200 application/json
   byte identik      -> true
   CSP               -> default-src 'none'; sandbox
   cache-control     -> public, max-age=31536000, immutable
3. upload ulang      -> 201 created: false url sama: true
4. SVG (label PNG)   -> 415 unsupported-file-type
5. tanpa signature   -> 401
```

Baris 3 dan 4 yang paling layak dibaca. **Baris 3**: byte yang sama menghasilkan URL yang sama dan
`created: false` — upload-nya idempoten, jadi retry setelah koneksi putus tidak menggandakan apa
pun. **Baris 4**: file itu SVG yang dikirim dengan header `Content-Type: image/png` dan tetap
ditolak, karena tipe ditentukan dari byte-nya, bukan dari header. SVG bisa membawa `<script>`, dan
origin ini juga menyajikan PII vault.

File yang diunggah di atas masih hidup dan bisa diklik:
[`…40e511e6…678d.json`](https://api-sterun.jameshub.fun/files/40e511e6def7b3bc72da94edc96cd040570704c8faa1e1f79e8a82ef4778678d.json)

**Bukti volume, dijalankan terhadap image yang sudah di-build sebelum deploy** — ini kegagalan yang
paling mungkin lolos sampai produksi:

| Percobaan | Hasil |
| --- | --- |
| container restart, volume terpasang | file **tetap 200** |
| container dibuat ulang **tanpa** volume | **404** — event rusak permanen |
| image **tanpa** `mkdir /app/data/files` di Dockerfile | direktori milik `root`, tulis **ditolak** (`EACCES`) |
| image **dengan** `mkdir` + `chown node` | direktori milik `node`, tulis **berhasil** |

Baris ketiga itu bentuk bug yang sama dengan permission cloudflared: Docker menyemai named volume
kosong dari direktori image, dan kalau path-nya tidak ada di image, volume dibuat milik root.
Hasilnya upload pertama gagal di produksi dan tidak di mana pun sebelumnya.

Verifikasi eksternal naik jadi **18 dari 18 lolos** (empat cek baru: upload menolak tanpa
signature, file store aktif, SVG tidak ada di tipe yang diterima, `/files/<hash tak dikenal>` → 404).

### File metadata event pindah ke Cloudflare R2

Byte file sekarang di **R2**, bukan di disk box. Yang **menyajikan** tetap API ini di
`/files/:sha256` — URL itu di-commit on-chain permanen, jadi dia tidak boleh menunjuk ke penyedia
storage mana pun.

| | |
| --- | --- |
| Bucket | `sterun-files`, lokasi **APAC** |
| Endpoint S3 | `https://<account id>.r2.cloudflarestorage.com` |
| Region SigV4 | `auto` (bukan `us-east-1`, walau itu di-alias) |
| Klien | SigV4 tulis tangan, `be/src/files/sigv4.ts` — **tanpa** `@aws-sdk/client-s3` |

**Migrasi tiga file yang sudah ada dijalankan SEBELUM store-nya berganti**, karena URL yang mati
berarti event rusak permanen. Sesudah pergantian, ketiganya diambil lagi lewat URL publiknya dan
hash-nya dihitung ulang:

```
40e511e6def7…  -> HTTP 200, hash COCOK
420033984720…  -> HTTP 200, hash COCOK
6bf7567756b1…  -> HTTP 200, hash COCOK
```

Tidak ada satu pun URL yang berubah. Itu konsekuensi content-addressing: file yang sama menghasilkan
key yang sama di store mana pun, jadi migrasi ini aman diulang dan tidak bisa menghasilkan URL baru.

**E2E lewat R2**, 2026-09-08T06:08Z terhadap `https://api-sterun.jameshub.fun`:

```
1. upload            -> 201  sha256 cocok: true
2. fetch             -> 200  application/json  | byte identik: true
   CSP               -> default-src 'none'; sandbox
   cache-control     -> public, max-age=31536000, immutable
3. upload ulang      -> 201  created: false
4. SVG (label PNG)   -> 415  unsupported-file-type
5. tanpa signature   -> 401
```

**Baris 2 yang paling penting di sini**: header keamanannya masih milik kita. Kalau byte-nya
disajikan langsung dari bucket, CSP `sandbox` itu hilang — dan bersamanya alasan kenapa file yang
diunggah siapa pun aman disajikan dari origin yang juga melayani PII vault.

**Signature-nya terbukti tiga lapis**, karena SigV4-nya ditulis tangan:

| Lapis | Apa yang dibuktikan | Di mana |
| --- | --- | --- |
| Implementasi pembanding independen | dua pembacaan spesifikasi sepakat | `be/test/files-r2.test.ts` |
| Aturan struktural | urutan header, encoding RFC 3986, payload hash | test yang sama |
| **R2 sendiri menerimanya** | satu-satunya known-answer test sungguhan | run di atas |

Lapis ketiga tidak bisa jalan di CI (butuh kredensial), makanya dicatat di sini. Mode gagalnya keras:
signature meleset satu byte = `403 SignatureDoesNotMatch` di request pertama.

**Konsekuensi arsitektur:** API sekarang **stateless**, jadi blocker di depan replica kedua hilang.
Yang tersisa sebelum benar-benar menyalakannya: backup Postgres terjadwal (duluan — replica itu
ketersediaan, backup itu pemulihan) lalu Redis untuk rate limit. Poller dan keeper **tetap
singleton**.

### Backend pindah ke kontrak v2 — LIVE

2026-09-09. `be/` dan `fe/` sekarang menunjuk pasangan v2. Keputusan James: pindah sekarang, karena
makin lama makin banyak data yang harus dibuang.

**Ongkos perpindahannya kecil justru karena dilakukan cepat** — isinya 3 participants, dan
ketiganya `token_id` NULL, jadi **tidak ada dokumen identitas yang tertaut ke record on-chain
mana pun**. Backup diambil lebih dulu (`/opt/sterun/backups/pre-v2-*.sql.gz`, 11 tabel).

Alamatnya berpindah lewat `docs/deployments.md`, bukan env var: baris tanpa sufiks membawa v2 dan
yang lama dilabeli `v1`. Ada test yang gagal kalau parser me-resolve pasangan v1 — keduanya contract
id yang sah di file yang sama, jadi regex yang terlalu longgar akan mem-parse bersih sambil menunjuk
kontrak mati.

**Index dan vault di-truncate**, karena tidak ada kolom pembeda kontrak: `events.event_id` dan
`records.token_id` primary key telanjang, dan v2 menomori event dari 0 lagi. Prosedur lengkap +
urutannya (poller dihentikan **sebelum** truncate) ada di `be/OPERATIONS.md`.

Hasil rebuild dari state v2:

```
rebuilt in 6361ms: 2 events, 2 categories, 3 records, 5 transitions.
doctor: index matches the chain
```

Verifikasi sesudahnya:

| Cek | Hasil |
| --- | --- |
| `verify-deployment.sh` | **18/18** |
| alamat di `/config` | `CAPB6NQ…` + `CCVW7WV…` (v2) |
| poller mengikuti | `CAPB6NQ…` dan `CCVW7WV…` |
| event v1 lama (`/events/4`) | **404** — sudah tidak ada, seperti seharusnya |
| file R2 lama | **200** — tidak ikut terhapus, file tidak terikat versi kontrak |
| e2e add-ons penuh di v2 | lolos: submit → `enter` → confirm → index → roster |

Dua hal dari daftar itu yang paling layak diperhatikan.

**Index memuat event berstatus `Cancelled`** (`Sterun Cancelled Rehearsal`). Itu status v2-only, dan
kehadirannya membuktikan kerja tiga lapis kemarin benar-benar berfungsi terhadap event sungguhan —
decoder, JSON schema route, dan CHECK constraint database. Lapis ketiga itu yang tidak disebut
`INTERFACE.md` §8 dan satu-satunya yang ditegakkan Postgres.

**Poller-nya, bukan cuma `rebuild`, menangkap event v2 baru.** Event 2 dibuat oleh script e2e
sesudah semuanya menyala, dan muncul di index produksi dalam satu siklus poll. Itu membedakan "bisa
membaca state sekali" dari "mengikuti chain".

### Untuk web app (STE-8/13/21/22/24/32)

```bash
NEXT_PUBLIC_API_URL=https://api-sterun.jameshub.fun
```

CORS-nya **allow-list**, bukan `*` — request ter-autentikasi membawa signature wallet di header, dan
`*` akan membiarkan halaman mana pun yang dikunjungi runner meminta browser-nya mengirimkan itu.
Origin yang sudah diizinkan: `https://sterun.jameshub.fun` dan `http://localhost:3000` (untuk dev).
Tambah origin baru = tambahkan ke `STERUN_WEB_ORIGIN` di `be/.env.production`, dipisah koma.


---

## STE-13 — event demo di testnet, dokumennya benar-benar ada

Empat event yang lebih dulu ada di registry semuanya menunjuk `uri` ke `https://sterun.xyz/...`
yang tidak menyajikan file apa pun, jadi satu-satunya keadaan halaman event yang pernah terlihat
adalah **"the event document could not be read"**. Event ini dibuat supaya jalur satunya —
dokumen yang lolos pengecekan hash — bisa dilihat orang, termasuk reviewer grant.

| Apa | Nilai |
| --- | --- |
| `event_id` | **4** |
| Nama | `Sterun Demo Run 2026` |
| Organiser | `GBQBCEJTUNDAVJ2NQE43AZ7FUBO3OOYJXSYM6RY4WSCXCS3BPZNNO2OR` |
| `starts_at` | `1791068400` (2026-10-04 06:00 +07:00) |
| Status | `Open` |
| `metadata_hash` | `bca56c511de5c61fa5744488a3a6b95a900ba465b040e4cfb9ac6f7a290b96ad` |
| `uri` | https://raw.githubusercontent.com/AncungAulia/sterun/9505ed0478e04c864be085dc096146504436e2a2/docs/events/sterun-demo-run-2026.json |

Transaksi (testnet, 2026-09-07):

| Langkah | Hash |
| --- | --- |
| `create_event` | [`bc40f345…`](https://stellar.expert/explorer/testnet/tx/bc40f3455a66b1973689211ba9ca39e9b07295ebc792ac1de51ae5882af5b87f) |
| `add_category` FUN5K (5 km, kuota 100, gratis) | [`30d47abc…`](https://stellar.expert/explorer/testnet/tx/30d47abcd1ad4ab7b77e756a51a175ddbe15508a87517ca9acc3c1445afb7eca) |
| `add_category` R10K (10 km, kuota 50, 25 sUSD) | [`9719ff5d…`](https://stellar.expert/explorer/testnet/tx/9719ff5dc556db5f6be93d40e14b065fc96c278e87594ff39921563bc2084b7f) |
| `set_event_status` → `Open` | [`bf5ead6d…`](https://stellar.expert/explorer/testnet/tx/bf5ead6d76b22e8cb30843314eee257d912e0f8f7b995ac24a44481d29fb1143) |

### Cara mengeceknya sendiri, tanpa app-nya

```bash
curl -s https://raw.githubusercontent.com/AncungAulia/sterun/9505ed0478e04c864be085dc096146504436e2a2/docs/events/sterun-demo-run-2026.json | sha256sum
# bca56c511de5c61fa5744488a3a6b95a900ba465b040e4cfb9ac6f7a290b96ad
```

Angka itu sama dengan `metadata_hash` yang tersimpan di `EventRegistry` untuk `event_id` 4. Itulah
seluruh klaimnya: poster, lokasi, dan jadwal event ini tidak bisa diganti diam-diam setelah orang
mendaftar.

### Kenapa `uri`-nya menunjuk commit SHA, bukan `main`

Event **beku** (`WEB_APP_IA.md` §2.2) dan `metadata_hash` tidak bisa diubah. URL yang isinya bisa
berubah — mis. `.../main/docs/...` — berarti suatu hari file-nya di-edit, hash-nya berhenti cocok,
dan **tidak ada cara memperbaikinya**. Commit SHA itu immutable, jadi dokumen ini akan menyajikan
byte yang sama selama repo-nya publik. `poster_url` di dalam dokumen dipin dengan aturan yang sama.

Batasnya, dan ini disengaja dicatat: `metadata_hash` mengunci **dokumen JSON-nya**, bukan gambarnya.
Yang ter-hash cuma URL poster, bukan isi poster. Menutup celah itu butuh field `poster_sha256` di
dokumen dan pengecekan di sisi halaman — belum dikerjakan, kandidat untuk STE-17.

> Kunci rahasia organiser event ini **tidak** disimpan di repo. Ia hanya ada di log sesi
> pembuatannya. Kalau event ini perlu diubah (mis. `set_event_status`), dan kuncinya sudah hilang,
> event-nya tidak bisa disentuh siapa pun — termasuk kita. Itu memang bagaimana kontraknya bekerja.
