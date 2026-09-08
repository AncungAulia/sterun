# `be/` — catatan operasional (STE-11 + STE-16)

Dokumen ini bagian dari tiketnya, bukan pelengkap. **STE-11** meminta secara eksplisit siapa yang
memegang kunci enkripsi, bagaimana rotasinya, dan apa dampaknya kalau database bocor. **STE-16**
meminta prosedur rebuild indexer dan runbook restore untuk entry yang ter-archive. Kalau kamu
mengoperasikan backend Sterun, ini yang wajib kamu tahu sebelum menyalakannya.

| Bagian | Tiket |
| --- | --- |
| Kunci enkripsi, rotasi, dampak kebocoran database | STE-11 |
| Indexer, prosedur rebuild | STE-16 |
| TTL keeper, runbook restore entry ter-archive | STE-16 |
| Format roster bundle (handoff contract #3) | STE-16 -> STE-18 (Ancung) |

## Apa yang disimpan, dan apa yang tidak

| Data | Di mana | Bentuk |
| --- | --- | --- |
| Nama, NIK, kontak darurat | Postgres, tabel `participants` | **terenkripsi** AES-256-GCM (`bytea`) |
| `salt` (32 byte) | Postgres | mentah — bukan PII, tapi rahasia (dia yang membuktikan hash) |
| `totp_secret` (32 byte) | Postgres | mentah — rahasia, dipakai roster bundle STE-16 |
| `participant_hash` | Postgres **dan on-chain** | 32 byte, satu-satunya yang publik |
| `runner_address`, `token_id`, `enter_tx_hash` | Postgres | publik (ada di chain) |

**Yang menyentuh chain cuma `participant_hash`.** Tidak ada nama, NIK, atau nomor telepon yang
pernah masuk transaksi, event, atau `uri`. Sesuatu yang terlanjur masuk chain tidak bisa dihapus —
itu alasan aturannya sekaku ini.

## Kunci enkripsi

### Siapa yang memegang

| Lingkungan | Pemegang | Di mana |
| --- | --- | --- |
| Dev lokal | tiap developer, kunci sendiri-sendiri | `be/.env` (di-gitignore) |
| Testnet (STE-31) | **Axel (PM)** | secret manager VPS / env unit systemd, bukan file di repo |
| Mainnet | belum ada — di luar scope Instawards | — |

Kunci **tidak pernah** masuk repo, tiket, chat, atau log. `parseKeyring` sengaja tidak pernah
menyertakan entri yang ditolaknya ke dalam pesan error, karena entri itu adalah kunci.

### Bentuknya

```bash
PII_KEYS="1:<64 hex>,2:<64 hex>"   # semua kunci yang mungkin masih dibutuhkan
PII_ACTIVE_KEY_ID="2"              # yang dipakai mengenkripsi baris baru
```

Bikin kunci baru:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rotasi

Tiap ciphertext membawa **id kunci**-nya di header (2 byte), jadi rotasi tidak butuh downtime dan
tidak butuh re-encrypt serentak:

1. Tambah kunci baru ke `PII_KEYS` (jangan hapus yang lama).
2. Arahkan `PII_ACTIVE_KEY_ID` ke id baru. Restart. Baris **baru** memakai kunci baru; baris lama
   tetap terbaca dengan kunci lama.
3. Jalankan re-encrypt bertahap: baca baris yang `keyIdOf(blob) != activeKeyId`, decrypt, encrypt
   ulang, tulis. (Job-nya belum ada — tulis saat pertama kali benar-benar rotasi; `keyIdOf()`
   sudah tersedia justru supaya job itu bisa menemukan pekerjaannya tanpa mendekripsi apa pun.)
4. Setelah nol baris memakai kunci lama, **baru** hapus id lama dari `PII_KEYS`.

Menghapus kunci sebelum langkah 4 membuat baris yang masih memakainya **tidak bisa dibaca
selamanya**. `decrypt` akan gagal dengan `no key with id N in PII_KEYS`, dan itu memang satu-satunya
jawaban yang jujur.

Kapan harus rotasi: kunci dicurigai bocor, orang yang pernah memegangnya keluar dari tim, atau
rutin (saran: tiap 90 hari kalau ini pernah jadi produksi sungguhan).

## Kalau database bocor

**Yang didapat penyerang:**

- Ciphertext PII — tidak bisa dibaca tanpa kunci. AES-256-GCM, IV acak per enkripsi, jadi dua baris
  dengan nama yang sama pun **tidak** bisa dikenali sama hanya dari ciphertext-nya.
- `salt` dan `totp_secret` mentah. Ini yang berdampak nyata:
  - Dengan `salt` + tebakan PII, penyerang bisa **memverifikasi tebakan** (`sha256(preimage)` vs
    `participant_hash` on-chain). Jadi salt bukan pelindung terhadap penyerang yang sudah menebak
    data seseorang dengan benar — dia pelindung terhadap **rainbow table** dan terhadap korelasi
    antar-event untuk orang yang sama.
  - Dengan `totp_secret`, penyerang bisa membuat kode check-in yang valid untuk record itu. Artinya
    dia bisa mengklaim racepack orang lain **kalau** dia juga bisa hadir secara fisik dan record-nya
    belum diklaim. Guard `AlreadyClaimed` di kontrak tetap membatasi kerusakannya ke satu pack.
- `runner_address`, `event_id`, `token_id` — semuanya sudah publik di chain.

**Yang TIDAK didapat:** PII dalam bentuk terbaca, selama kunci tidak ikut bocor. Itulah sebabnya
kunci tidak boleh tinggal di mesin yang sama dengan dump database, dan tidak boleh ikut masuk backup
database.

**Kalau kunci ikut bocor**, anggap seluruh PII yang pernah disimpan sudah terbaca. Rotasi kunci
**tidak** memperbaiki itu — data lama sudah terlanjur dibaca. Yang harus dilakukan: beri tahu
peserta yang terdampak, dan (kalau ini pernah jadi produksi) ikuti kewajiban notifikasi yang
berlaku. Rotasi tetap dilakukan supaya kebocoran berikutnya tidak menambah korban.

**Yang tidak bisa diperbaiki oleh apa pun:** `participant_hash` sudah permanen di chain. Kalau
seseorang tahu PII asli sebuah record, dia bisa membuktikan tautan itu selamanya. Ini konsekuensi
desain yang disadari (`docs/SYSTEM_DESIGN.md` §11) dan alasan kenapa yang di-hash disalt per-record.

## Menyalakan backend

```bash
docker compose up -d postgres                        # dari root repo
cp be/.env.example be/.env                           # lalu isi DATABASE_URL + PII_KEYS
pnpm dev
```

Migrasi jalan otomatis sebelum socket dibuka, jadi service tidak pernah sempat menerima pendaftaran
di atas skema yang belum ada.

Tiga keadaan konfigurasi, dan hanya dua yang boleh jalan:

| `DATABASE_URL` | `PII_KEYS` | Hasil |
| --- | --- | --- |
| kosong | kosong | jalan **tanpa** vault — `/health` + `/config` saja. Ini yang didapat clone baru. |
| ada | ada | jalan dengan vault |
| ada | kosong | **menolak start.** Service yang bisa menjangkau database tapi tidak bisa mengenkripsi akan menyimpan dokumen identitas dalam bentuk terbaca. |

`/config` melaporkan `vault.enabled` dan **id** kunci yang ada (bukan kuncinya), supaya "kenapa
decrypt gagal setelah rotasi" bisa dijawab dalam satu request.

## Indexer (STE-16)

Tiga proses, sengaja dipisah. API **melayani** index; dia tidak mengisinya.

```bash
pnpm indexer follow     # poller: getEvents -> Postgres, terus-menerus
pnpm indexer poll       # satu halaman lalu keluar (cron/CI)
pnpm indexer rebuild    # truncate + replay dari STATE kontrak, lalu verifikasi
pnpm indexer doctor     # bandingkan index dengan chain, field demi field
pnpm indexer status     # cursor + jumlah baris, tanpa menyentuh network
pnpm dev                # API — /events, /records, /runners/..., /events/:id/roster
```

Env yang relevan (semua punya default, lihat `be/.env.example`):
`INDEXER_POLL_INTERVAL_MS` (7000), `INDEXER_PAGE_LIMIT` (200), `INDEXER_START_LEDGER`,
`INDEXER_SOURCE_ACCOUNT`.

### Dua sumber, dan bedanya penting

Tiap baris membawa kolom `source`:

| `source` | Dari mana | Tahu apa |
| --- | --- | --- |
| `event` | `getEvents` (poller) | **kapan** — ledger, tx hash, urutan lifecycle |
| `state` | view call ke kontrak (rebuild) | **apa yang benar sekarang** — semuanya kecuali provenance |

Rebuild tetap menghasilkan riwayat transisi, direkonstruksi dari `entered_at` / `claimed_at` /
`result_at` di `RecordData` — itu jam kontrak sendiri, jadi riwayatnya jujur. Yang hilang cuma ledger
dan tx hash-nya, dan barisnya mengatakan begitu (`ledger IS NULL`), bukan mengarang angka.

### Yang membuat poller aman dimatikan kapan saja

- **Cursor disimpan setelah halamannya commit.** Mati di tengah = halaman itu diulang, bukan
  dilewati. Mengulang gratis: `chain_events` ber-primary key id event dari RPC, jadi lintasan kedua
  mengenali semuanya dan tidak mengerjakan apa pun.
- **Halaman kosong bukan berarti sudah kejar.** RPC memindai jendela ledger terbatas per request
  (10.000 di testnet) dan menjawab halaman kosong + cursor kalau jendela itu tidak berisi apa-apa.
  `last_ledger` dibaca dari cursor-nya, bukan dari `latestLedger`. Ini bukan teori: versi pertama
  memakai `latestLedger`, dan `/indexer/status` melaporkan sudah kejar padahal masih dua belas
  request di belakang. Ketahuan saat dijalankan ke testnet sungguhan.
- **Event untuk sesuatu yang belum ter-index dihitung sebagai `orphans`, bukan error.** Index yang
  mulai di tengah balapan punya lubang yang sah; menyandera poller di lubang itu tidak menolong
  siapa pun. Yang membetulkan lubang adalah `rebuild`.

### Rebuild: prosedur yang wajib ada

**Kenapa ada.** RPC testnet cuma menyimpan jendela `getEvents` terbatas (saat tulisan ini dibuat
~120.960 ledger, sekitar tujuh hari). Lewat dari itu, "putar ulang event"-nya tidak tersedia lagi.
State kontrak selalu tersedia. Karena itu jalur pemulihan Sterun berjalan dari **state**, bukan dari
event — `docs/SYSTEM_DESIGN.md` §11 poin 10.

```bash
pnpm indexer rebuild
```

Tiga fase, urutannya disengaja:

1. **Catat ledger awal sebelum membaca apa pun.** Poller melanjutkan dari situ, jadi perubahan yang
   mendarat di tengah walk **diulang**, bukan terlewat. Mengulang idempoten; terlewat tidak.
2. **Baca semuanya lewat RPC ke memori.** Tidak ada transaksi yang terbuka, jadi walk yang lambat
   tidak mengunci siapa pun.
3. **Truncate + insert dalam SATU transaksi.** Pembaca tidak pernah melihat index setengah kosong —
   mereka melihat index lama, lalu index baru.

Setelah itu `rebuild` otomatis menjalankan `doctor`. Rebuild yang tidak diperiksa adalah rebuild yang
tidak bisa dipercaya.

`chain_events` **tidak** ikut di-truncate: itu satu-satunya bukti lokal tentang apa yang chain
katakan saat itu, dan RPC tidak akan mengembalikannya setelah jendela retensinya lewat.

Kapan menjalankannya: setelah gap yang tidak bisa ditutup event (poller mati lebih lama dari jendela
retensi), setelah `doctor` melaporkan mismatch, setelah restore entry yang ter-archive, atau setelah
migrasi skema yang mengubah cara sebuah kolom diisi.

---

## TTL keeper (STE-16)

```bash
pnpm keeper scan        # laporkan yang jatuh tempo; tidak mengirim apa pun (tanpa kunci)
pnpm keeper run         # perpanjang semua yang di bawah threshold
pnpm keeper report      # riwayat run dari tabel ttl_keeper_runs
pnpm keeper restore     # pulihkan entry yang tidak lagi dilayani RPC
```

Dimaksudkan sebagai **cron mingguan** (`docs/SYSTEM_DESIGN.md` §3.4 poin 4). Menjalankannya lebih
sering tidak merusak apa-apa: `ExtendFootprintTTLOp` itu lantai, tidak pernah memperpendek, dan entry
yang masih di atas threshold dilewati tanpa transaksi.

`run` dan `restore` butuh `TTL_KEEPER_SECRET`: akun berisi XLM dan **tidak lebih**. Memperpanjang TTL
tidak butuh otorisasi siapa pun — itulah kenapa sewa boleh dibayar orang asing — jadi kunci ini tidak
menguasai record apa pun dan tidak bisa membelanjakan apa pun selain fee-nya sendiri.

### Kenapa keeper tidak memanggil `extend_record_ttl`

`RaceRecord::extend_record_ttl(token_id)` memperpanjang dua hal: instance kontrak dan
`DataKey::Record(token_id)`. Dia **tidak** menyentuh `NFTStorageKey::Owner(token_id)` milik
OpenZeppelin maupun index `Enumerable` per-owner, karena keduanya hidup di key crate lain dan fungsi
itu memang tidak pernah menyentuhnya. Record yang entry `Record`-nya hidup tapi entry `Owner`-nya
ter-archive tetap mematahkan `verify` dan `records_of` — dan itu sebagian besar dari gunanya sebuah
race record.

Jadi keeper bekerja di level **ledger key** dan memakai `ExtendFootprintTTLOp`. Key-nya didapat
dengan **mensimulasikan** `record_of`, `owner_of`, dan `records_of` lalu mengambil footprint yang
dihitung host — bukan dengan menyusun ulang layout key OZ dengan tangan. Keeper yang memperpanjang
key salah akan melaporkan sukses tiap minggu sementara record-nya tetap ter-archive, dan kegagalan
itu diam selama berbulan-bulan.

### Angka

Threshold-nya sama persis dengan konstanta di kontrak (`sc/contracts/race_record/src/lib.rs`):
perpanjang saat tersisa di bawah **~120 hari** (2.073.600 ledger, 1 ledger sekitar 5 detik). Angka
berbeda akan membuat "kapan ini kedaluwarsa" bergantung pada siapa yang terakhir menyentuh entry-nya.

Target perpanjangannya **3.110.399**, yaitu satu ledger **di bawah** `max_entry_ttl` — dan `-1` itu
bukan salah ketik. `ExtendFootprintTTLOp` memvalidasi `extendTo` strictly di bawah maksimum dan
menolak angka batasnya dengan `EXTEND_FOOTPRINT_TTL_MALFORMED`, yang di permukaan cuma kelihatan
sebagai `txFailed`. `BUMP_TO` di kontrak tetap 180 hari penuh dan itu benar di sana: host function
`extend_ttl` meng-**clamp** ke maksimum, bukan menolak. Dua validator, satu maksud, beda satu ledger.
Menaikkan angka ini biar "cocok" dengan kontrak akan mematahkan semua run keeper.

Override: `TTL_THRESHOLD_LEDGERS`, `TTL_EXTEND_TO_LEDGERS`.

> Konsekuensi yang perlu diketahui sekali: entry persistent yang baru ditulis **mulai** di sekitar
> 120 hari, jadi run pertama menemukan hampir semuanya jatuh tempo. Itu normal. Setelah satu run yang
> sukses semuanya ada di 180 hari, dan keeper diam sekitar 60 hari.

### Membaca hasilnya

```sql
SELECT id, started_at, status, scanned_keys, below_threshold, extended_keys, missing_keys
  FROM ttl_keeper_runs ORDER BY started_at DESC LIMIT 5;
```

Barisnya ditulis **sebelum** pekerjaannya mulai, dengan status `running`. Keeper yang mati di tengah
meninggalkan bukti bahwa dia jalan dan tidak selesai — itu justru kasus yang perlu terlihat. Hanya
transaksi ber-status `SUCCESS` yang dihitung di `extended_keys`: job yang melaporkan sewa yang tidak
pernah dibayar lebih buruk daripada job yang tidak melaporkan apa-apa.

`missing_keys > 0` berarti ada entry yang **tidak dilayani RPC** — ter-archive, atau tidak pernah
ditulis. Perpanjangan tidak bisa menolongnya (`ExtendFootprintTTLOp` melewati apa yang tidak dia
lihat). Lanjut ke runbook di bawah.

### Restoring an archived entry

Gejalanya salah satu dari ini:

- `pnpm keeper scan` melaporkan `missing_keys > 0`;
- indexer gagal dengan `a ledger entry this call reads has been ARCHIVED`;
- `record_of` / `verify` di client mengembalikan error alih-alih nilai.

Prosedurnya:

1. **Pastikan dulu ini archival, bukan RPC yang salah.** Jalankan `pnpm keeper scan` sekali lagi, dan
   cek `pnpm indexer status` — kalau RPC baru saja di-restart, `oldest_ledger`-nya ikut bergeser.
2. **Kumpulkan key-nya lagi, jangan pakai daftar lama.** `pnpm keeper restore` sengaja melakukan scan
   ulang: himpunan yang perlu dipulihkan adalah apa pun yang RPC tidak layani **sekarang**, dan
   daftar yang di-copy dari run kemarin akan memulihkan entry yang salah.
3. **Jalankan `pnpm keeper restore`.** Dia mengirim `RestoreFootprintOp` dengan key di footprint
   **read-write** (kebalikan dari extend, yang memakai read-only). Ini jauh lebih mahal daripada
   memperpanjang — itu sebabnya `run` tidak pernah memanggilnya sendiri; ada manusia yang memutuskan.
4. **Segera perpanjang.** Restore mengembalikan entry dengan TTL minimum. `pnpm keeper run`.
5. **Rebuild index-nya.** `pnpm indexer rebuild`. Selama ter-archive, poller mungkin sudah menghitung
   event terkait sebagai `orphans`.
6. **Catat di `docs/deployments.md`**: apa yang ter-archive, kapan, dan hash transaksi restore-nya.

Pencegahannya bukan runbook ini, melainkan cron mingguan yang tidak pernah dilewatkan.

---

## Daftar scanner (ditambahkan STE-17, Ancung)

`GET /events/:eventId/scanners` — dikonsumsi organiser console.

**Kenapa endpoint ini ada, dan kenapa di sini:** kontraknya tidak bisa menjawabnya. EventRegistry
punya `is_scanner(event_id, addr)` dan **tidak punya** cara meng-enumerasi — itu disengaja, karena
view yang mengembalikan vector tak terbatas makin mahal seiring event membesar. Jadi satu-satunya
tempat yang bisa menyusun daftarnya adalah index, yang memang sudah mencatat `scanner_added` /
`scanner_removed` ke tabel `event_scanners`. Datanya sudah ada sejak STE-16; yang belum ada cuma
pintu keluarnya.

Tanpa auth: yang dikembalikan cuma address yang sudah publik di chain (event `scanner_added`
terbaca siapa pun), jadi tidak ada yang bocor dengan membukanya.

```jsonc
{
  "scanners": [{ "address": "GA…", "added_ledger": 4469750 }],
  "last_ledger": 4469811   // sejauh mana index sudah mengejar, BUKAN sejauh mana event ini
}
```

`last_ledger` sengaja diambil dari cursor ingestion, bukan dari baris event-nya: daftar kosong
adalah klaim tentang apa yang **tidak** ada, dan ukuran kesegaran yang jujur untuk klaim seperti itu
cuma seberapa jauh index sudah membaca.

**Ini fast path, bukan otoritas.** Console memakainya untuk tahu address mana yang perlu ditanyakan,
lalu mengonfirmasi tiap satu ke chain lewat `is_scanner`. Siapa yang boleh nge-scan itu keputusan
otorisasi, dan keputusan otorisasi dibaca dari salinan yang otoritatif — aturan yang sama dipakai
route hasil waktu membaca organiser.

---

## Roster bundle (handoff contract #3)

`GET /events/:eventId/roster` — dikonsumsi scanner PWA (STE-18, Ancung).

**Auth:** signature wallet Stellar, sama seperti route vault (`POST /auth/challenge`, tanda tangani
nonce, kirim `x-sterun-address` / `x-sterun-nonce` / `x-sterun-signature`). Nonce sekali pakai,
kedaluwarsa 2 menit. Tanda tangannya boleh atas byte nonce langsung (script yang pegang keypair)
**atau** SEP-53 (yang dipakai wallet browser lewat Stellar Wallets Kit); server mencoba keduanya.

**Siapa yang boleh:** organiser event itu, atau address yang **chain** sebut scanner
(`is_scanner(event_id, addr)`). Dibaca ulang dari chain **tiap request** — scanner yang dicabut
on-chain langsung kehilangan akses, tanpa cache yang perlu di-invalidate.

```jsonc
{
  "event_id": 0,
  "snapshot_ledger": 4469811,          // seberapa segar state di dalamnya
  "generated_at": "2026-09-02T18:10:47.702Z",
  "totp": { "digits": 6, "step_seconds": 30, "tolerance_steps": 1 },
  "entries": [
    {
      "token_id": 0,
      "bib_no": 1,
      "category_id": 0,
      "state": "Entered",              // Entered | RacepackClaimed | Finished | Dnf
      "name_fragment": "Budi S.",      // nama depan + inisial; null untuk baris pra-migrasi 003
      "totp_secret": "…64 hex…"        // 32 byte, dipakai HMAC lokal di scanner
    }
  ],
  "count": 1,
  "missing_from_index": 0              // baris vault yang token_id-nya belum ter-index
}
```

Catatan untuk yang memakainya:

- **`totp` dikirim, jangan di-hardcode.** Parameternya beku di `docs/specs/HASH_AND_TOTP.md`; scanner
  yang menyalin angkanya akan diam-diam tidak setuju kalau suatu saat berubah.
- **`snapshot_ledger` bukan hiasan.** Bundle yang jauh tertinggal berisi `state` basi, dan `Entered`
  yang basi persis yang membuat racepack kedua keluar. Ambil ulang sebelum start.
- **`missing_from_index` > 0 artinya bundle-nya belum lengkap** — ada peserta yang sudah `enter` tapi
  indexer belum menyusul. Jalankan `pnpm indexer poll` lalu ambil ulang.
- **`name_fragment` bukan nama.** Nama depan utuh, sisanya inisial, dihitung sekali saat submit dan
  **itu** yang disimpan (terenkripsi, sama seperti kolom PII lain). Tidak ada jalur kode yang bisa
  mengembalikannya jadi nama lengkap, karena informasinya memang sudah tidak ada di sana. Gunanya cek
  akal sehat petugas, bukan verifikasi identitas — yang memverifikasi identitas adalah
  `verify(token_id, participant_hash)`.
- **Yang menegakkan "satu pack per entry" tetap kontrak.** Cek roster lokal itu optimasi UX;
  `claim_racepack` revert `AlreadyClaimed` kalau state bukan `Entered`.

**Risikonya diakui terbuka** di `docs/SYSTEM_DESIGN.md` §11 poin 3: siapa pun yang memegang roster
bisa membuat kode check-in yang valid untuk tiap peserta di dalamnya. Yang membatasi kerusakannya:
guard on-chain, allowlist scanner, dan cakupan satu event per request.

---

---

## Deploy ke VPS (STE-31)

Lima container: Postgres, API, poller, TTL keeper, dan Caddy di depan mengurus TLS. Tiga service
Node-nya adalah **image yang sama dengan perintah berbeda** — memang begitu bentuknya, dan satu
image berarti satu build, satu versi, dan tidak mungkin poller menjalankan kode yang tidak dimiliki
API.

Deploy-nya **manual dan terdokumentasi**, bukan CD. Itu keputusan tiket ("deploy manual
terdokumentasi cukup untuk v1"), dan setiap bagian pipeline otomatis akan menambah komponen yang
butuh runbook-nya sendiri.

### Sebelum mulai

| Kebutuhan | Kenapa |
| --- | --- |
| VPS, Docker + compose plugin | tempat semuanya jalan |
| Domain yang **DNS-nya sudah menunjuk ke VPS** | Caddy mengambil sertifikat lewat ACME HTTP challenge; tanpa DNS yang benar, challenge-nya gagal dan Caddy retry dengan backoff |
| Port 80 dan 443 terbuka | 80 dipakai ACME, bukan cuma redirect |
| Akun keeper testnet yang **baru** | jangan menyalin akun dari bukti STE-16; itu akun laptop sekali pakai |

### Langkah

```bash
git clone https://github.com/AncungAulia/sterun.git && cd sterun

cp be/.env.production.example be/.env.production
$EDITOR be/.env.production      # STERUN_DOMAIN, POSTGRES_PASSWORD, PII_KEYS, TTL_KEEPER_SECRET

# compose membaca STERUN_DOMAIN dan POSTGRES_PASSWORD dari .env di root
ln -s be/.env.production .env

docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml ps
```

Migrasi jalan sendiri saat API start, **sebelum** socket-nya dibuka — jadi service tidak pernah
sempat menerima pendaftaran terhadap schema yang belum ada. Container `indexer` dan `keeper` menunggu
API start persis karena itu.

### Deployment nyata: jameserver (pve02 / ct-sterun)

Ini deployment yang benar-benar berjalan, dan bentuknya **berbeda** dari langkah generik di atas
karena satu fakta yang baru ketahuan setelah masuk ke servernya.

| Item | Nilai |
| --- | --- |
| Node Proxmox | `pve02` (cluster `homelab`, 2 node) |
| Container | LXC **203**, hostname `ct-sterun`, Debian 13 |
| Sumber daya | 2 core, 2 GiB RAM, 512 MiB swap, 20 GiB rootfs (`local-lvm`) |
| IP LAN | `192.168.18.42/24`, gw `192.168.18.1` |
| Fitur LXC | `unprivileged=1`, `nesting=1,keyctl=1` (Docker butuh nesting), `onboot=1` |
| Path repo | `/opt/sterun` |

Konvensi diikuti dari container yang sudah ada di cluster ini: vmid `2xx` untuk pve02, prefix
hostname `ct-`, IP `192.168.18.4x`, bridge `vmbr0`, nameserver `1.1.1.1`.

#### Kenapa ingress-nya BUKAN Caddy di sini

Router homelab ini **tidak mem-forward port 80/443**. Ini diuji, bukan diasumsikan: sebuah listener
sementara dipasang di port 80 pve01, lalu WAN IP-nya (`182.253.126.14` — IP publik asli, bukan
CGNAT) diprobe dari internet lewat proxy eksternal. Hasilnya timeout (522). Artinya:

- **ACME HTTP-01 tidak mungkin.** Caddy di dalam `compose.prod.yml` tidak akan pernah dapat
  sertifikat, dan membiarkannya mencoba hanya membakar rate limit Let's Encrypt.
- Ingress harus datang dari **luar** container.

#### Ingress: Cloudflare Tunnel (yang dipakai sekarang)

`jameshub.fun` DNS-nya di Cloudflare. Tunnel menyelesaikan ketiganya sekaligus — tanpa port
forward, TLS diurus Cloudflare, dan record DNS-nya dibuat sendiri oleh tunnel.

**Locally-managed, bukan token.** Aturan routing ada di `deploy/cloudflared-config.yml` di dalam
repo, bukan di dashboard. Alasannya: aturan yang hidup di UI tidak bisa di-review di PR, tidak ikut
ter-rollback, dan `git log` tidak bisa menjawab pertanyaan tentangnya.

Prosedur (sekali seumur deployment):

```bash
# 1. di pve01 — satu login browser, pilih zona jameshub.fun
cloudflared tunnel login

# 2. bikin tunnel + record DNS-nya
cloudflared tunnel create sterun-api
cloudflared tunnel route dns sterun-api api-sterun.jameshub.fun

# 3. pindahkan credentials ke host deployment TANPA melewati clipboard/chat
ssh root@100.111.186.114 "cat ~/.cloudflared/<TUNNEL_ID>.json" \
  | ssh root@192.168.18.42 "mkdir -p /opt/sterun/secrets \
      && cat > /opt/sterun/secrets/cloudflared-credentials.json \
      && chmod 600 /opt/sterun/secrets/cloudflared-credentials.json"

# 4. image cloudflared jalan sebagai uid 65532, bukan root. File 600 milik root
#    TIDAK terbaca olehnya — gejalanya `permission denied` yang berulang tiap
#    detik. Perbaikannya chown, BUKAN chmod 644: rahasianya tetap 600.
ssh root@192.168.18.42 "chown 65532:65532 /opt/sterun/secrets/cloudflared-credentials.json"

# 5. nyalakan
ssh root@192.168.18.42 "cd /opt/sterun && \
  docker compose -f compose.prod.yml -f compose.homelab.yml --profile tunnel up -d cloudflared"
```

Sehat kalau lognya menunjukkan **empat** `Registered tunnel connection` (Cloudflare menyambung ke
dua region, dua koneksi masing-masing).

#### Kenapa `api-sterun` dan BUKAN `api.sterun`

Nama yang diminta tiket awalnya `api.sterun.jameshub.fun`. Itu **tidak bisa dilayani** di plan
Cloudflare sekarang, dan alasannya bukan konfigurasi:

**Universal SSL cuma menerbitkan sertifikat satu tingkat** — `jameshub.fun` dan `*.jameshub.fun`.
Nama dua tingkat butuh `*.sterun.jameshub.fun`, yang cuma ada lewat **Advanced Certificate
Manager** (berbayar) atau Total TLS.

Dibuktikan, bukan ditebak:

| Hostname | Hasil |
| --- | --- |
| `api.sterun.jameshub.fun` | `SSL alert number 40` — handshake ditolak di edge |
| `api-sterun.jameshub.fun` | **14/14 lolos** |

Yang bikin ini menyesatkan: request-nya **tidak pernah sampai** ke tunnel, jadi log cloudflared
bersih dan keempat koneksinya sehat. Gejalanya persis seperti tunnel mati, padahal Cloudflare
menolak sebelum meneruskan. Kalau suatu saat gejala ini muncul lagi untuk nama baru, cek dulu
berapa tingkat sub-domainnya sebelum membongkar tunnel.

> CNAME `api.sterun.jameshub.fun` sudah **dihapus** dari zona (lewat dashboard — `cloudflared`
> tidak punya perintah untuk menghapus route DNS), dan aturan ingress-nya ikut dihapus dari
> `deploy/cloudflared-config.yml`. Dua-duanya, sengaja: aturan tanpa DNS adalah kode mati yang
> menyiratkan URL yang sebenarnya NXDOMAIN, dan DNS tanpa aturan adalah URL yang gagal dengan cara
> yang membingungkan. Kalau ACM/Total TLS diaktifkan nanti, kembalikan keduanya dalam satu
> perubahan — jangan salah satu saja.

### `indexer rebuild` dan daftar scanner

`rebuild` membangun ulang seluruh index dari state kontrak. Satu tabel tidak bisa ikut dibangun
begitu: **`event_scanners`**. EventRegistry cuma punya `is_scanner(event_id, address)` — tanya satu
address, jawab ya/tidak — dan tidak ada fungsi yang meng-enumerate isinya.

Jadi `rebuild` memperlakukan tabel itu khusus:

1. kumpulkan kandidat dari `event_scanners` **dan** dari replay `scanner_added`/`scanner_removed`
   di `chain_events` (log mentah itu memang diselamatkan lewat rebuild),
2. verifikasi tiap address ke chain dengan `is_scanner`,
3. tulis balik yang masih diakui chain.

Efeknya: `pnpm indexer rebuild` — termasuk sesudah tabelnya di-`TRUNCATE` tangan — mengembalikan
daftar scanner, dan scanner yang dicabut saat index mati ikut hilang karena langkah 2.

**Yang tetap tidak bisa dipulihkan**: scanner yang ditambahkan **sebelum** index ini pernah poll
sama sekali. Tidak ada barisnya, tidak ada event-nya di log, dan chain tidak bisa ditanya "siapa
saja". `/events/:eventId/scanners` akan under-report tanpa bisa tahu bahwa dia under-report.

Kalau ragu daftarnya lengkap, jangan tebak — konfirmasi tiap address ke chain:

```bash
# organiser console memang sudah melakukan ini per address sebelum mempercayainya
stellar contract invoke --id $EVENT_REGISTRY --network testnet \
  -- is_scanner --event_id 0 --address G...
```

Dan ingat pembagian tugasnya: **otorisasi tidak pernah lewat tabel ini.** Roster bundle membaca
allowlist dari chain (`reader.isScanner`) tiap request, jadi index yang under-report tidak pernah
bisa memberi akses ke orang yang salah — paling buruk dia bikin console tidak menampilkan seseorang
yang sebenarnya berhak.

### R2: object storage untuk file metadata

Byte file event disimpan di **Cloudflare R2** kalau keempat variabel ini ada; kalau kosong, jatuh ke
disk lokal.

```bash
STERUN_R2_ACCOUNT_ID=<32 hex, dari dashboard Cloudflare>
STERUN_R2_BUCKET=sterun-files
STERUN_R2_ACCESS_KEY_ID=<R2 API token: Access Key ID>
STERUN_R2_SECRET_ACCESS_KEY=<R2 API token: Secret Access Key>
```

**Keempatnya atau tidak sama sekali.** Tiga dari empat = proses start normal lalu gagal di upload
pertama dengan 403 yang mirip secret salah. Startup menolak konfigurasi separuh.

Endpoint S3-nya dibentuk dari account id (`https://<id>.r2.cloudflarestorage.com`) dan region SigV4
selalu **`auto`** — bukan `us-east-1`, walau itu di-alias.

> `R2_TOKEN_VALUE` di `.env` adalah **API token Cloudflare**, bukan kredensial S3. Aplikasi tidak
> memakainya; dia untuk mengelola bucket lewat `api.cloudflare.com` (membuat, melihat daftar).
> Access Key ID + Secret Access Key yang di atas itu yang dipakai untuk baca/tulis objek.

**URL publiknya tidak berubah.** File tetap disajikan API ini di `/files/:sha256`. Jangan
menyalakan public bucket atau custom domain R2 lalu memindahkan URL ke sana: URL itu sudah
di-commit on-chain permanen, dan header keamanan (CSP `sandbox`, `nosniff`) hilang begitu bucket
yang menyajikan.

Cek isi bucket tanpa SSH ke box:

```bash
# butuh R2_TOKEN_VALUE (API token, bukan kredensial S3)
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACC/r2/buckets" \
  -H "Authorization: Bearer $R2_TOKEN_VALUE" | jq '.result'
```

**Pindah dari disk ke R2 (atau sebaliknya) tidak otomatis.** Objek yang sudah ada di volume tidak
ikut berpindah, dan URL-nya akan 404 begitu store-nya berganti. Prosedurnya: unggah ulang tiap file
dari volume ke bucket dengan key `files/<sha256>` dan content type yang benar, **sebelum** mengganti
konfigurasi. Karena file-nya content-addressed, mengunggah ulang file yang sama tidak pernah
menghasilkan URL berbeda — jadi migrasi ini aman diulang.

### File metadata event

Poster dan dokumen JSON tiap event disimpan **content-addressed**: nama file-nya adalah sha256
isinya, dan itu juga angka yang masuk `create_event` sebagai `metadata_hash`.

```bash
# Yang harus ada di be/.env.production pada box publik:
STERUN_PUBLIC_BASE_URL=https://api-sterun.jameshub.fun
```

Kalau variabel itu kosong, API menyusun URL dari header `Host` request. Header itu dikendalikan
pemanggil, dan URL yang dikembalikan endpoint ini adalah URL yang organiser commit **permanen** ke
ledger. Jadi di box yang bisa dijangkau internet, ini bukan opsional.

**Volume `sterun-files` bukan cache — jangan pernah dihapus untuk "membersihkan".**

Ini beda dengan `sterun-caddy-data` atau image yang bisa dibangun ulang. Hash file sudah ada di
ledger dan tidak bisa dicabut; kalau byte-nya hilang, `uri` event itu menunjuk 404 selamanya dan
halaman event menolak menampilkannya. Backup-nya barengan Postgres, bukan terpisah: satu baris event
dan poster-nya itu satu fakta.

```bash
# Cek isinya dan berapa besarnya
docker exec sterun-api-1 du -sh /app/data/files
docker exec sterun-api-1 find /app/data/files -type f | wc -l

# Backup (bareng dump database, dalam satu jendela waktu)
docker run --rm -v sterun_sterun-files:/data -v "$PWD:/out" alpine \
  tar czf /out/sterun-files-$(date -u +%Y%m%d).tar.gz -C /data .
```

**Plafon store.** `STERUN_FILES_MAX_BYTES` (default 512 MiB) adalah satu-satunya hal yang membatasi
pertumbuhan: siapa pun pemegang keypair Stellar boleh upload, dan keypair gratis dibikin, jadi
aturan per-address tidak menahan apa pun. Kalau penuh, endpoint menjawab **507** dengan pesan yang
menyebut variabel ini — naikkan, atau (nanti, kalau sweeper-nya sudah ada) bersihkan file yatim.
Yang **jangan** dilakukan: menghapus file sembarangan, karena tidak ada cara membedakan poster yang
sudah dirujuk on-chain dari yang belum tanpa membaca `uri` tiap event di index.

**Kalau upload gagal `EACCES`.** Artinya volume-nya dibuat sebelum image punya `/app/data/files`
milik uid 1000 — Docker membuat volume kosong milik root kalau path-nya tidak ada di image. Perbaiki
sekali:

```bash
docker run --rm -v sterun_sterun-files:/data alpine chown -R 1000:1000 /data
docker compose -f compose.prod.yml -f compose.homelab.yml up -d api
```

#### Tailscale Funnel: cadangan, sekarang mati

Sebelum tunnel ada, ingress-nya Tailscale Funnel di pve01. Sudah dimatikan
(`tailscale funnel --https=443 off`) supaya tidak ada dua pintu publik yang tidak diurus. Kalau
tunnel bermasalah dan butuh jalan cepat:

```bash
ssh root@100.111.186.114 "tailscale funnel --bg http://192.168.18.42:3001"
```

Itu memberi URL publik ber-TLS di `pve01.<tailnet>.ts.net` dalam hitungan detik, tanpa Cloudflare.

#### Keeper: cadence-nya urusan compose, bukan CLI

`keeper run` **one-shot** — headernya sendiri bilang "intended as a weekly cron" — jadi dia exit 0
begitu selesai. Menjalankannya telanjang dengan `restart: unless-stopped` berarti Docker
menyalakannya lagi seketika, selamanya. Itu benar-benar terjadi di box ini: **37 restart, run
#1766**, scan 42 key tiap beberapa detik, semuanya ke RPC testnet **publik**.

Sekarang loop-nya ada di `command:` service keeper, dan intervalnya
`TTL_KEEPER_INTERVAL_SECONDS` (default 604800 = seminggu). Run pertama tetap langsung, supaya
deploy membuktikan keeper-nya jalan — bukan membuktikannya tujuh hari lagi.

Cara memastikan dia sehat: `docker inspect sterun-keeper-1 --format "{{.RestartCount}}"` harus
**0**, dan lognya berakhir di `keeper sleeping 604800s until the next run`. Kalau angkanya naik
terus, dia balik ke restart storm.

#### Operasional harian

```bash
ssh root@192.168.18.42
cd /opt/sterun
docker compose -f compose.prod.yml -f compose.homelab.yml ps
docker compose -f compose.prod.yml -f compose.homelab.yml logs -f api
```

`compose.homelab.yml` cuma menambahkan satu hal: mem-publish port API **ke IP LAN saja**
(`192.168.18.42:3001`), bukan `0.0.0.0`. Itu perlu karena ingress-nya ada di host lain (pve01);
Postgres tetap tanpa `ports:` sama sekali.

#### Yang berbeda dari `be/.env` laptop

- `PII_KEYS` produksi **berbeda** dari yang di laptop. Deployment baru, vault kosong, tidak ada yang
  perlu didekripsi dengan kunci lama — dan satu kunci di dua tempat berarti bocornya laptop =
  bocornya produksi.
- `TTL_KEEPER_SECRET` adalah akun **baru** yang dibuat khusus untuk VPS ini
  ([`GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4`](https://stellar.expert/explorer/testnet/account/GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4)),
  bukan akun dari bukti STE-16. Cuma butuh XLM: memperpanjang TTL tidak butuh otorisasi siapa pun.
- `SUSD_DISTRIBUTOR_SECRET` sengaja **tidak diisi**. API tidak pernah memakainya — faucet itu CLI,
  bukan endpoint — dan kunci yang bisa memindahkan seluruh supply test tidak punya alasan berada di
  host publik.

### Verifikasi — dari luar, tanpa SSH

```bash
./deploy/verify-deployment.sh https://api.sterun.example
```

13 pemeriksaan. Yang penting bukan cuma `/health`:

- **TLS** benar-benar terminasi, dan `--proto '=https'` menolak redirect dari plaintext — URL yang
  diam-diam turun ke HTTP akan lolos semua cek lain sambil mengirim signature wallet telanjang.
- **`/ready`** membuktikan database-nya kebaca. `/health` sengaja **tidak** menyentuh apa pun:
  liveness probe yang memanggil dependency melaporkan outage orang lain sebagai outage kita, dan
  container-nya di-restart karena itu. Caddy mengawasi `/ready`; Docker mengawasi `/health`.
- **Endpoint sensitif tetap 401** tanpa signature. Deploy yang salah di sini akan menyajikan data
  yang bersinggungan dengan identitas ke internet — dan kelihatan sehat sempurna dari semua cek lain.

Simpan output-nya (ada timestamp UTC) ke `docs/deployments.md` sebagai bukti Working agreement
poin 8.

### Yang bikin dia bertahan reboot

`restart: unless-stopped` di semua service. Bukan `always`: container yang **sengaja** dimatikan
operator harus tetap mati setelah reboot, kalau tidak, mematikan sesuatu untuk maintenance akan
dibatalkan oleh mati listrik berikutnya.

### Postgres tidak punya `ports:`

Disengaja, dan ini satu baris yang menahan kesalahan firewall menaruh database PII di internet
publik. Postgres cuma bisa dicapai dari network compose. Untuk `psql` dari VPS:

```bash
docker compose -f compose.prod.yml exec postgres psql -U sterun sterun
```

### Setelah deploy

```bash
# Index-nya kosong sampai poller menyusul. Ini normal, bukan bug.
docker compose -f compose.prod.yml logs -f indexer

# Kalau RPC sudah melewati jendela getEvents-nya, bangun ulang dari state kontrak:
docker compose -f compose.prod.yml run --rm indexer node dist/cli/indexer.js rebuild
```

### Nonce sekarang di Postgres

Sejak STE-31, nonce auth hidup di tabel `auth_nonces`, bukan di memori proses. Itu yang membuat
**instance kedua mungkin**: nonce yang diterbitkan instance A dan dibelanjakan di instance B dulu
gagal dengan `unknown-nonce` — kebohongan yang cuma muncul saat ramai, cuma kadang-kadang, dan
menyuruh orang memeriksa kode signing-nya.

Sifat sekali-pakainya dijaga `DELETE … RETURNING`, satu statement yang atomik. Dua instance yang
menyodorkan nonce sama pada saat bersamaan menghasilkan **satu** baris di antara mereka.

Menambah replica API sekarang jadi perubahan config, bukan penulisan ulang — tapi tetap belum
dilakukan dan belum diuji di bawah load nyata.

### Rollback

```bash
git checkout <commit sebelumnya>
docker compose -f compose.prod.yml up -d --build
```

Migrasi **maju saja** — tidak ada `down`. Rollback ke commit yang schema-nya lebih tua akan jalan
selama migrasi barunya aditif (sampai sekarang semuanya begitu). Migrasi yang menghapus kolom akan
memutus ini, dan itu harus dibahas sebelum ditulis, bukan sesudah.

## Yang belum ada (jangan diasumsikan sudah)

- **Nonce auth masih in-memory.** Aman untuk satu proses; **tidak** aman untuk dua. STE-31 wajib
  memindahkannya ke Redis/Postgres sebelum ada instance kedua — nonce yang diterbitkan instance A
  lalu dipakai di instance B akan gagal secara acak, dan itu cara terburuk untuk mengetahuinya.
- **Belum ada rate limit** di `/auth/challenge` maupun `/participants`.
- **Belum ada job re-encrypt** untuk rotasi (langkah 3 di atas).
- **Belum ada backup policy.** Kalau backup dibuat: backup database dan kunci **tidak boleh**
  disimpan di tempat yang sama.
- **Belum ada penghapusan data** (right to erasure). Baris vault bisa dihapus; `participant_hash`
  di chain tidak bisa.
- **Belum ada alert otomatis** kalau keeper tidak jalan atau `missing_keys > 0`. Sekarang caranya
  membaca `ttl_keeper_runs` (`pnpm keeper report`). STE-31 menjalankan keeper sebagai container yang
  restart sendiri; **notifikasi kalau dia berhenti masih belum ada**.
- **Keeper memindai per record.** Biayanya `2 x jumlah record + jumlah runner` simulasi per run.
  Cukup untuk skala MVP (satu event, ratusan entry, mingguan) dan tidak cukup untuk puluhan ribu.
  Perbaikan yang jujur saat itu tiba adalah memperpanjang **per kategori**, dan itu butuh perubahan
  kontrak — bukan sekadar batch size yang lebih besar.
- **Backfill `name_fragment` tidak mungkin** untuk baris yang dibuat sebelum migrasi 003: fragmennya
  cuma bisa diturunkan dari plaintext saat submit. Roster melaporkannya `null`.
- ~~**Indexer belum di-deploy sebagai service.**~~ STE-31: container `indexer` di
  `compose.prod.yml`, `restart: unless-stopped`.
- **Akun keeper masih akun testnet sekali pakai.** Yang dipakai di bukti (`GCYM7TQB…XV26`) dibuat
  lewat friendbot dari laptop. Untuk VPS, STE-31 bikin akunnya sendiri dan menaruh secretnya di
  secret manager — bukan menyalin yang ini.
