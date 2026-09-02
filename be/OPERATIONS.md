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

Sama persis dengan konstanta di kontrak (`sc/contracts/race_record/src/lib.rs`): perpanjang saat
tersisa di bawah **~120 hari**, perpanjang sampai **~180 hari** (1 ledger sekitar 5 detik, jadi
2.073.600 dan 3.110.400 ledger). Angka berbeda akan membuat "kapan ini kedaluwarsa" bergantung pada
siapa yang terakhir menyentuh entry-nya. Override: `TTL_THRESHOLD_LEDGERS`, `TTL_EXTEND_TO_LEDGERS`.

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

## Roster bundle (handoff contract #3)

`GET /events/:eventId/roster` — dikonsumsi scanner PWA (STE-18, Ancung).

**Auth:** signature wallet Stellar, sama seperti route vault (`POST /auth/challenge`, tanda tangani
nonce, kirim `x-sterun-address` / `x-sterun-nonce` / `x-sterun-signature`). Nonce sekali pakai,
kedaluwarsa 2 menit.

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
  membaca `ttl_keeper_runs` (`pnpm keeper report`). STE-31 yang memasang cron + notifikasinya.
- **Keeper memindai per record.** Biayanya `2 x jumlah record + jumlah runner` simulasi per run.
  Cukup untuk skala MVP (satu event, ratusan entry, mingguan) dan tidak cukup untuk puluhan ribu.
  Perbaikan yang jujur saat itu tiba adalah memperpanjang **per kategori**, dan itu butuh perubahan
  kontrak — bukan sekadar batch size yang lebih besar.
- **Backfill `name_fragment` tidak mungkin** untuk baris yang dibuat sebelum migrasi 003: fragmennya
  cuma bisa diturunkan dari plaintext saat submit. Roster melaporkannya `null`.
- **Indexer belum di-deploy sebagai service.** `pnpm indexer follow` masih dijalankan tangan; systemd
  unit + restart otomatis adalah STE-31.
