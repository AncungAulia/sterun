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
