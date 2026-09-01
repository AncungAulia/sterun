# `be/` — catatan operasional PII vault (STE-11)

Dokumen ini bagian dari **STE-11**, bukan pelengkap: tiketnya meminta secara eksplisit siapa yang
memegang kunci enkripsi, bagaimana rotasinya, dan apa dampaknya kalau database bocor. Kalau kamu
mengoperasikan backend Sterun, ini yang wajib kamu tahu sebelum menyalakannya.

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
