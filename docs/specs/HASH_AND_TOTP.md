# HASH & TOTP — spesifikasi byte-exact (v1.0.0)

> **Status: FROZEN 2026-08-31 (STE-10, komponen C4).**
> Ini *handoff contract* nomor 2 di `docs/SYSTEM_DESIGN.md` §9: definisi byte-exact
> `participant_hash` dan derivasi kode check-in, supaya **backend (James)**, **QR pass** dan
> **scanner PWA (Ancung)** menghitung nilai yang **identik** tanpa perlu saling membaca kode.
>
> Aturan perubahan ada di §8 dan `docs/specs/CHANGELOG.md`. Interface kontraknya ada di
> `docs/specs/INTERFACE.md`.

Yang menemani dokumen ini:

| File | Isi |
| --- | --- |
| `docs/specs/vectors/participant_hash.json` | 5 vector + 4 kasus tolak, lengkap dengan preimage hex |
| `docs/specs/vectors/totp.json` | 4 vector kode + 8 kasus verifikasi |
| `docs/specs/reference/node/verify-vectors.mjs` | implementasi referensi #1 (Node, **nol dependency npm**) |
| `docs/specs/reference/rust/` | implementasi referensi #2 (Rust, crate berdiri sendiri) |
| `docs/specs/verify.sh` | menjalankan keduanya; gagal keras kalau salah satu tidak setuju |

**Kalau dokumen ini dan implementasi referensi berbeda, yang menang adalah dokumen + vector.**
Semua angka di dokumen ini benar-benar dihitung, bukan diketik dari ingatan.

---

## 1. Ringkasan satu layar

```
participant_hash = SHA-256(
      utf8(norm_name(name))                   || 0x00
   || utf8(norm_id(national_id))              || 0x00
   || utf8(norm_contact(emergency_contact))   || 0x00
   || salt                                              // 32 byte MENTAH, bukan teks hex
)                                                       // -> 32 byte = BytesN<32> untuk RaceRecord.enter

time_step     = floor(unix_seconds / 30)                        // u64
mac           = HMAC-SHA-256(key = totp_secret (32 byte mentah),
                             msg = time_step sebagai 8 byte big-endian)
offset        = mac[31] & 0x0F
bin           = ((mac[offset] & 0x7F) << 24) | (mac[offset+1] << 16)
              | (mac[offset+2] << 8) | mac[offset+3]
code          = format 6 digit desimal, PAD KIRI '0', dari (bin % 1_000_000)

qr            = {"t":<token_id>,"s":<time_step>,"c":"<code>"}   // persis, tanpa spasi
```

Aturan rendering yang berlaku di seluruh sistem:

- **Hex selalu huruf kecil, tanpa prefix `0x`.** Salt dan `totp_secret` muncul sebagai 64 karakter
  hex di JSON/API; yang masuk ke hash/HMAC adalah **byte mentahnya**, bukan teks hex-nya.
- **`code` selalu string 6 karakter.** Tidak pernah integer. Lihat §4.4.

---

## 2. Normalisasi input

Formulir pendaftaran menghasilkan teks manusia: spasi ganda, tab hasil copy-paste, NIK ditulis
pakai strip, nomor HP ditulis pakai kurung. Dua orang yang sama bisa mengetik namanya dengan dua
urutan code point Unicode yang berbeda tapi terlihat identik. Kalau kita hash mentah-mentah,
recompute di kemudian hari (petugas medis, asuransi, auditor) akan gagal padahal datanya benar.
Jadi setiap field dinormalisasi dulu, secara deterministik.

### 2.1 Definisi whitespace (baca ini, jangan dilewat)

Spesifikasi ini memakai **daftar eksplisit** 25 code point Unicode `White_Space=Yes`:

```
U+0009 U+000A U+000B U+000C U+000D   (TAB LF VT FF CR)
U+0020                                (SPACE)
U+0085                                (NEL)
U+00A0                                (NO-BREAK SPACE)
U+1680                                (OGHAM SPACE MARK)
U+2000 .. U+200A                      (EN QUAD .. HAIR SPACE)
U+2028 U+2029                         (LINE / PARAGRAPH SEPARATOR)
U+202F                                (NARROW NO-BREAK SPACE)
U+205F                                (MEDIUM MATHEMATICAL SPACE)
U+3000                                (IDEOGRAPHIC SPACE)
```

**Jangan pakai `String.prototype.trim()` / `\s` di JavaScript maupun `char::is_whitespace()`
begitu saja sebagai definisi.** Keduanya bukan himpunan yang sama:

| Code point | ECMAScript `WhiteSpace` | Unicode `White_Space` (= Rust) |
| --- | --- | --- |
| `U+0085` NEL | **bukan** whitespace | **whitespace** |
| `U+FEFF` ZWNBSP | **whitespace** | **bukan** whitespace |

Kalau spec cuma bilang "Unicode whitespace" dan tiap bahasa memakai bawaannya, dua implementasi
akan menghasilkan **hash berbeda** untuk input yang sama. Karena itu daftarnya ditulis eksplisit
dan di-hardcode di kedua implementasi referensi. Test
`whitespace_table_equals_unicode_white_space` di crate Rust membuktikan daftar itu sama persis
dengan `char::is_whitespace()` untuk **seluruh** rentang scalar Unicode, jadi daftarnya terikat
pada properti Unicode sungguhan, bukan tebakan.

Catatan: `U+200B` ZERO WIDTH SPACE **bukan** whitespace meskipun namanya begitu, dan `U+FEFF`
juga bukan. Keduanya lolos apa adanya ke dalam hash.

### 2.2 `norm_base(s)` — dipakai semua field

| # | Langkah |
| --- | --- |
| **N1** | Normalisasi Unicode **NFC**. |
| **N2** | Buang whitespace (§2.1) di awal dan akhir. |
| **N3** | Ganti setiap **runtun** whitespace internal menjadi **satu** `U+0020`. |
| **N4** | **TOLAK** (error, jangan pernah di-hash) kalau hasilnya kosong atau mengandung `U+0000`. |

Urutannya wajib persis seperti itu.

### 2.3 Per field

| Field | Aturan |
| --- | --- |
| `norm_name(s)` | `norm_base(s)`. **Tanpa case folding** — kapitalisasi nama orang adalah bagian dari namanya. |
| `norm_id(s)` | **N5:** `norm_base(s)`, lalu buang **semua** whitespace dan setiap ASCII hyphen-minus `-`, lalu **ASCII-uppercase** (`a-z` → `A-Z` saja). **N5b:** tolak kalau hasil akhirnya kosong. |
| `norm_contact(s)` | **N6:** `norm_base(s)`, lalu buang semua whitespace dan setiap `-`, `(`, `)`. `+` di depan dipertahankan (tidak pernah dibuang). **N6b:** tolak kalau hasil akhirnya kosong. |

**ASCII-uppercase, bukan uppercase Unicode.** Jangan pakai `toUpperCase()` (JS) atau
`to_uppercase()` (Rust): keduanya bergantung locale/script dan akan mengubah panjang string
(mis. `ß` → `SS`, `i` Turki → `İ`). Yang benar `toUpperCase` khusus ASCII / `to_ascii_uppercase()`.

**Kenapa N5b/N6b ada** (ini tambahan eksplisit terhadap draft spesifikasi PM, yang hanya menyebut
penolakan di N4): input seperti `" -- - "` lolos N4 (setelah trim masih ada isinya) tapi menjadi
string kosong setelah pembuangan separator di N5. Menghash komponen kosong berarti menerima field
identitas yang tidak berisi apa pun. Lebih aman menolak. Dicakup vector `rj-03` dan `rj-04`.

### 2.4 Kode error normalisasi

Kedua implementasi referensi memakai tag yang sama, dan vector penolakan menyebutkannya:

| Tag | Arti |
| --- | --- |
| `<field>/E_EMPTY` | kosong setelah normalisasi (N4) atau setelah pembuangan separator (N5b/N6b) |
| `<field>/E_NUL` | mengandung `U+0000` (N4) |

`<field>` ∈ `name`, `national_id`, `emergency_contact`, `salt`. Urutan evaluasi:
`name` → `national_id` → `emergency_contact`, jadi input yang salah di dua field melaporkan yang
pertama.

---

## 3. `participant_hash`

### 3.1 Preimage

```
preimage =
      utf8(norm_name(name))                   || 0x00
   || utf8(norm_id(national_id))              || 0x00
   || utf8(norm_contact(emergency_contact))   || 0x00
   || salt                                            // 32 byte mentah

participant_hash = SHA-256(preimage)                  // 32 byte
```

**Tepat tiga separator `0x00`. Tidak ada separator setelah salt.** Salt selalu 32 byte, jadi
posisinya tidak ambigu tanpa penanda tambahan.

### 3.2 Kenapa separator sudah cukup, tanpa length prefix

Ini alasan N4 ada. Encoding "sambung pakai separator" hanya injektif kalau separatornya **tidak
mungkin muncul di dalam komponen**. N4 menolak field apa pun yang mengandung `U+0000`, dan UTF-8
punya sifat: satu-satunya cara byte `0x00` muncul dalam UTF-8 yang valid adalah sebagai encoding
`U+0000` itu sendiri (byte lanjutan multi-byte selalu `0x80..0xBF`, byte awal selalu
`0xC2..0xF4`). Jadi setelah N4, **`0x00` tidak akan pernah muncul di dalam
`utf8(norm_*(...))`**, dan pembacaan preimage dari kiri ke kanan hanya punya satu tafsiran:
potong di `0x00` pertama, kedua, ketiga; sisa 32 byte terakhir adalah salt.

Tanpa N4, penyerang bisa menaruh `U+0000` di dalam nama dan memindahkan batas field — dua orang
berbeda menghasilkan preimage identik. Karena itu **length prefix tidak dibutuhkan**, dan
tidak boleh ditambahkan diam-diam (itu akan mengubah semua hash).

### 3.3 Salt

- **Tepat 32 byte** dari CSPRNG (`crypto.randomBytes(32)` di Node, `getrandom` di Rust), **satu
  per record** — bukan per user, bukan per event.
- Dibuat **backend**, disimpan backend, dan **ditunjukkan sekali** ke runner (supaya runner bisa
  membuktikan record-nya sendiri belakangan tanpa bergantung ke backend).
- Di JSON/API dirender sebagai **64 karakter hex huruf kecil**. Yang masuk ke SHA-256 adalah 32
  byte mentahnya. Meng-hash teks hex-nya adalah bug klasik dan menghasilkan hash yang salah
  total.
- Salt **tidak pernah** masuk on-chain. Yang on-chain hanya `participant_hash`.

### 3.4 Contoh byte-level (vector `ph-01-ascii-plain`)

Input:

| Field | Nilai mentah |
| --- | --- |
| `name` | `Budi Santoso` |
| `national_id` | `3174012509900001` |
| `emergency_contact` | `+6281234567890` |
| `salt` (hex) | `a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e` |

Semuanya sudah ASCII dan sudah rapi, jadi normalisasi di sini adalah identitas — vector ini
sengaja mengunci **konkatenasi dan SHA-256-nya**, bukan normalisasinya.

Preimage, dipecah per bagian (total **77 byte**):

```
  4275646920 53616e746f736f    "Budi Santoso"                    12 byte
  00                           separator #1                       1 byte
  33313734303132353039393030303031
                               "3174012509900001"                16 byte
  00                           separator #2                       1 byte
  2b3632383132333435363738 3930  "+6281234567890"                14 byte
  00                           separator #3                       1 byte
  a3f1c0d5e7b249168a0c4f2d9e6b8135
  c7a2049fbe31d68075c4e9a1b2f3d40e
                               salt (32 byte MENTAH)             32 byte
                                                                 -------
                                                                 77 byte
```

Preimage utuh:

```
427564692053616e746f736f0033313734303132353039393030303031002b36323831323334353637383930\
00a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e
```

SHA-256:

```
11b4bbdb068b470aa79124846c6684b70ad0e5d7b5f7d74fe88cdc9fafdec8fe
```

Itulah 32 byte yang dikirim sebagai `BytesN<32>` ke `RaceRecord.enter`, dan yang diterima
`RaceRecord.verify`.

Cek sendiri tanpa dependency apa pun:

```bash
printf 'Budi Santoso\0003174012509900001\0+6281234567890\0' > /tmp/p.bin
printf 'a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e' \
  | xxd -r -p >> /tmp/p.bin
wc -c < /tmp/p.bin        # 77
shasum -a 256 /tmp/p.bin  # 11b4bbdb068b470aa79124846c6684b70ad0e5d7b5f7d74fe88cdc9fafdec8fe
```

### 3.5 Contoh normalisasi (vector `ph-04-messy-whitespace`)

Bagaimana input formulir yang berantakan menjadi field yang bersih:

| Field | Mentah (escape Unicode) | Ternormalisasi |
| --- | --- | --- |
| `name` | `"  Siti\u00a0 Aminah   binti\u0009Rahman\u000a"` | `Siti Aminah binti Rahman` |
"` | `Siti Aminah binti Rahman` |
| `national_id` | `" a1-2345 6789-0b "` | `A1234567890B` |
| `emergency_contact` | `" +62 (812) 3456-7890 "` | `+6281234567890` |

Perhatikan: NBSP + spasi menjadi **satu** spasi (N3), TAB juga menjadi satu spasi, LF di ujung
ikut ter-trim (N2), strip dan spasi di NIK hilang lalu huruf jadi kapital (N5), tanda kurung dan
strip di nomor HP hilang sementara `+` di depan tetap (N6). Hash-nya:
`feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29`.

### 3.6 NFC: satu orang, satu hash

Vector `ph-02` dan `ph-03` adalah **orang yang sama** dengan ejaan Unicode berbeda:

| Vector | Nama (escape) | Bentuk |
| --- | --- | --- |
| `ph-02-nfc-precomposed` | `"Jos\u00e9 Nu\u00f1ez Wijaya"` | precomposed (`\u00e9`, `\u00f1`) |
| `ph-03-nfc-decomposed` | `"Jose\u0301 Nun\u0303ez Wijaya"` | decomposed (`e`+`\u0301`, `n`+`\u0303`) |

Keduanya **wajib** menghasilkan preimage dan hash yang identik:

```
f5f43fc590b0edfbdf7a7b9c8c0751fa9c69329fec716b64afbd829962293f95
```

Kalau implementasimu membuat keduanya berbeda, **langkah N1 (NFC) yang salah, bukan vector-nya.**
Ini bukan kasus teoretis: keyboard macOS dan beberapa IME menghasilkan bentuk decomposed, sementara
Windows dan kebanyakan database menyimpan precomposed. Runner mendaftar dari satu perangkat dan
diverifikasi dari perangkat lain.

Node dan Rust sudah dibuktikan sepakat di sini secara empiris (bukan diasumsikan):
`String.prototype.normalize('NFC')` dan `unicode-normalization` menghasilkan hash yang sama pada
vector ini, dan `bash docs/specs/verify.sh` menjalankan keduanya setiap kali.

### 3.7 Salt yang berbeda = hash yang berbeda

`ph-05-salt-only-differs` identik byte-per-byte dengan `ph-01` kecuali salt-nya, dan hash-nya
`4799814afd98d8cccb1db3f9cd395adc6527fdcb1d3df7a48407f62ef27ab15b` — sama sekali lain. Ini yang
membuat dua record milik orang yang sama di dua event **tidak bisa dikaitkan** hanya dari data
on-chain.

---

## 4. TOTP untuk check-in

Design naratifnya di `docs/SYSTEM_DESIGN.md` §7. Bagian ini definisi mekanisnya.

### 4.1 Secret

- **Tepat 32 byte** dari CSPRNG, **satu per record**.
- Dibuat backend saat entry, dikirim **sekali** ke perangkat runner (disimpan di PWA QR pass) dan
  disimpan server-side untuk roster bundle scanner.
- Di JSON/roster bundle dirender sebagai **64 karakter hex huruf kecil**; HMAC memakai **byte
  mentahnya**.
- **Tidak pernah on-chain**, dan **tidak pernah masuk QR** — yang masuk QR hanya keluaran
  per-langkah-waktunya.

### 4.2 Derivasi kode

| # | Langkah |
| --- | --- |
| T1 | `time_step = floor(unix_seconds / 30)`, unsigned 64-bit. Pakai UTC epoch detik, bukan milidetik. |
| T2 | `counter_bytes` = `time_step` sebagai **8 byte big-endian**. |
| T3 | `mac = HMAC-SHA-256(key = totp_secret (32 byte mentah), msg = counter_bytes)` → 32 byte. |
| T4 | `offset = mac[mac.len() - 1] & 0x0F` (untuk SHA-256: `mac[31]`). |
| T5 | `bin = ((mac[offset] & 0x7F) << 24) \| (mac[offset+1] << 16) \| (mac[offset+2] << 8) \| mac[offset+3]` |
| T6 | `code = (bin % 1_000_000)` dirender sebagai **string 6 karakter, pad kiri dengan `'0'`**. |

T4/T5 adalah *dynamic truncation* RFC 4226 §5.3, diterapkan ke MAC 32 byte (RFC aslinya memakai
HMAC-SHA-1 20 byte; kita memakai SHA-256, jadi `offset` diambil dari byte terakhir MAC 32 byte).

Masking `& 0x7F` pada byte pertama membuang bit tanda supaya hasilnya tidak bergantung pada
bagaimana bahasa memperlakukan integer bertanda.

### 4.3 Contoh byte-level (vector `tp-02-leading-zero`)

```
totp_secret (hex) 4d7b1e93a05c26f8d3407e91b6c258aa0f31d74e69b2085c1a3f6d904e7c2b15
unix_seconds      1772103330
T1 time_step      1772103330 / 30 = 59070111
T2 counter_bytes  000000000385569f
T3 mac            964f65de7c6f03add381f2203be56c75caae12bf048ff3bb1e61b9de127b02e2
T4 mac[31] = 0xe2, 0xe2 & 0x0f = 2                      -> offset = 2
T5 mac[2..6] = 65 de 7c 6f
     ((0x65 & 0x7f) << 24) | (0xde << 16) | (0x7c << 8) | 0x6f
   = 0x65de7c6f = 1709079663
T6 1709079663 % 1000000 = 79663      -> "079663"   <-- ENAM karakter, nol di depan
```

QR payload-nya:

```json
{"t":7,"s":59070111,"c":"079663"}
```

### 4.4 Nol di depan itu SIGNIFIKAN (baca dua kali)

**Ini bug implementasi TOTP yang paling sering terjadi.** `bin % 1_000_000` di atas menghasilkan
`79663` — lima digit. Kodenya adalah **`"079663"`**, enam karakter. Kalau kode disimpan,
dikirim, atau dibandingkan sebagai **integer**, nol di depan hilang, dan:

- runner menampilkan `79663`, scanner menghitung `079663` → **setiap scan gagal**, dan hanya
  untuk ~10% runner (yang kebetulan dapat kode berawalan nol). Bug seperti ini lolos testing
  manual dan meledak di hari lomba.
- fallback manual juga rusak: runner membaca lima angka, volunteer mengetik lima angka.

Aturannya, tanpa pengecualian:

1. `code` **selalu** string 6 karakter. Pad kiri dengan `'0'` (`String(n).padStart(6,'0')`,
   `format!("{:06}", n)`).
2. Di payload QR, `c` adalah **JSON string** (`"079663"`), **tidak pernah** JSON number.
3. Perbandingan dilakukan **antar string**, bukan antar angka.
4. Kode yang dipresentasikan divalidasi bentuknya dulu: harus **tepat 6 digit ASCII**. Kode 5
   karakter ditolak sebagai *malformed*, bukan cuma "salah".

Dua vector khusus menjaga ini: `tp-02-leading-zero` (kodenya `079663`) dan
`vf-08-five-digit-code-rejected` (mempresentasikan `79663` pada langkah waktu yang benar →
**ditolak**).

### 4.5 Verifikasi + toleransi jam

Kode `presented` **diterima jika dan hanya jika** dia sama dengan kode yang dihitung untuk
`time_step - 1`, `time_step`, atau `time_step + 1` — jendela hingga **90 detik**.

```
verify(secret, now, presented):
    if presented bukan tepat 6 digit ASCII: return false
    step = floor(now / 30)
    ok = false
    for d in [-1, 0, +1]:
        ok |= constant_time_eq(code_at_step(secret, step + d), presented)   # tanpa short-circuit
    return ok
```

Dua hal yang wajib:

- **Bandingkan constant-time.** Node: `crypto.timingSafeEqual` (cek panjang dulu — panjang bukan
  rahasia). Rust: akumulasi `diff |= a[i] ^ b[i]` lalu bandingkan sekali. Jangan pakai `==` biasa
  pada string.
- **Jangan short-circuit di loop.** Pakai `|=`, bukan `||`/`or else`, supaya waktu penerimaan
  tidak membocorkan langkah mana yang cocok.

Vector yang menjaga jendela ini:

| Vector | Kode dari langkah | Diverifikasi pada langkah | Hasil |
| --- | ---: | ---: | --- |
| `vf-01-same-step` | 59070000 | 59070000 | **diterima** |
| `vf-02-previous-step` | 59069999 | 59070000 | **diterima** (jam runner ~30 dtk lambat) |
| `vf-03-next-step` | 59070001 | 59070000 | **diterima** (jam runner ~30 dtk cepat) |
| `vf-04-two-steps-old-rejected` | 59069998 | 59070000 | **ditolak** (60 dtk basi) |
| `vf-05-two-steps-ahead-rejected` | 59070002 | 59070000 | **ditolak** |
| `vf-06-leading-zero-roundtrip` | 59070111 | 59070111 | **diterima** (kode `079663`) |
| `vf-07-wrong-code-rejected` | — | 59070000 | **ditolak** (`000000`) |
| `vf-08-five-digit-code-rejected` | — | 59070111 | **ditolak** (`79663`, malformed) |

Jam yang meleset lebih dari 90 detik akan menolak scan yang sebenarnya sah. Itu risiko yang
diakui (`SYSTEM_DESIGN.md` §11 poin 11); mitigasinya banner "clock sanity" di scanner PWA plus
fallback manual.

---

## 5. Payload QR

```json
{"t":<token_id>,"s":<time_step>,"c":"<kode 6 karakter>"}
```

**Persis tiga key, dalam urutan itu, tanpa spasi sama sekali.** Contoh nyata dari vector:

```
{"t":1,"s":59070000,"c":"911070"}
{"t":7,"s":59070111,"c":"079663"}
{"t":4242,"s":59072879,"c":"844761"}
```

| Key | Tipe | Isi |
| --- | --- | --- |
| `t` | JSON number (`u32`) | `token_id` record-nya (dari `RaceRecord.enter`) |
| `s` | JSON number (`u64`) | `time_step` saat kode dibuat |
| `c` | **JSON string** | kode 6 karakter, nol di depan dipertahankan |

**Kenapa `s` boleh berupa number biasa.** JSON number aman sampai `2^53 - 1`
(≈ 9,007 × 10^15). `time_step` hari ini ≈ 5,9 × 10^7 dan naik sekitar 1,05 juta per tahun, jadi
batas itu baru tersentuh dalam ratusan juta tahun. Tidak perlu string, tidak perlu BigInt.

**Kenapa `c` harus string.** Lihat §4.4. Ini satu-satunya alasan aturan urutan/tipe ini ditulis
sedetail ini.

**Fallback manual** ketika kamera gagal (layar retak, lensa kotor, QR terlalu redup): runner
membacakan **6 digit `c`** dan volunteer mengetik keenam digit itu plus **nomor bib**. Nomor bib
menggantikan `t`, dan `s` diambil dari jam scanner sendiri — yang persis alasan toleransi ±1
langkah ada. Alur ini wajib ada di scanner PWA (STE-22): kamera bukan jalur satu-satunya.

---

## 6. Catatan keamanan (dari `SYSTEM_DESIGN.md` §7 dan §11)

1. **Hash adalah komitmen, bukan enkripsi.** `participant_hash` tidak menyembunyikan PII dalam
   arti kriptografis. Dia hanya memungkinkan siapa pun yang **sudah** punya plaintext + salt
   membuktikan bahwa record ini milik orang tersebut. Dia tidak memungkinkan siapa pun membaca
   PII dari chain.
2. **Keamanannya bergantung sepenuhnya pada salt yang tetap rahasia dan acak.** NIK itu
   **entropi rendah** — ruang tebakannya kecil dan berstruktur (kode wilayah + tanggal lahir +
   nomor urut). Tanpa salt, siapa pun bisa brute-force nama+NIK terhadap hash on-chain dalam
   waktu sepele. Salt 32 byte acak per record yang menutup itu. Karena itu: salt tidak pernah
   masuk QR, tidak pernah masuk log, tidak pernah masuk chain.
3. **Backend yang bocor = PII bocor.** PII vault adalah database Web2 biasa dengan kewajiban Web2
   biasa (enkripsi at rest, kontrol akses, audit). Chain tidak menolong di sini, dan tidak
   berpura-pura menolong.
4. **Screenshot yang diteruskan gagal karena langkah waktunya bergerak.** Screenshot membekukan
   satu kode 30 detik. Saat gambarnya sampai ke orang lain lewat grup chat, `time_step` sudah
   lewat toleransi ±1 dan HMAC-nya tidak cocok lagi (persis kasus `vf-04`). Penyerang butuh
   `totp_secret`-nya sendiri, yang tidak pernah muncul di QR — hanya keluaran per-langkahnya.
5. **Roster yang bocor tetap dibatasi chain.** Scanner PWA memegang secret seluruh roster supaya
   bisa verifikasi offline. Roster yang bocor memungkinkan orang membuat kode valid — tapi
   kerusakannya tetap dibatasi: hanya address scanner yang ter-allowlist yang boleh
   `claim_racepack`, dan tetap **satu pack per record**.
6. **Yang menjadi arbiter sesungguhnya adalah guard `state == Entered` on-chain.** Cek roster
   lokal di desk hanya optimasi UX. Dua desk offline bisa sama-sama menyetujui runner yang sama;
   keduanya mengantre transaksi, dan chain menerima **tepat satu** — yang kedua dapat
   `AlreadyClaimed(102)` untuk direkonsiliasi organiser. Invarian "satu pack per entry" ditegakkan
   konsensus, bukan disiplin volunteer.
7. **Impersonasi fisik tetap mungkin.** Runner bisa menyerahkan HP + race pack ke temannya.
   Sterun membuat **record**-nya jujur (chain tetap mencatat siapa yang mendaftar, dan organiser
   punya hash untuk spot-check identitas); Sterun tidak menaruh marshal di lintasan. Ini harus
   dinyatakan apa adanya di materi organiser.
8. **Hak penghapusan vs hash yang immutable** masih terbuka (`SYSTEM_DESIGN.md` §11 poin 2).
   Hash sendirian tidak mengidentifikasi siapa pun, tapi pembacaan hukumnya di yurisdiksi kita
   perlu dicek sebelum mainnet.

---

## 7. Menjalankan vector

```bash
bash docs/specs/verify.sh
```

Menjalankan **dua implementasi yang ditulis terpisah** terhadap file JSON yang sama:

- **Node** — `docs/specs/reference/node/verify-vectors.mjs`, hanya `node:crypto`, **nol
  dependency npm**. Jangan tambahkan apa pun ke pnpm workspace untuk ini.
- **Rust** — `docs/specs/reference/rust/`, crate berdiri sendiri (punya `[workspace]` sendiri,
  **bukan** member workspace `sc/`), dependency dipin `=`: `sha2 =0.10.9`, `hmac =0.12.1`,
  `unicode-normalization =0.1.25`, `serde_json =1.0.151` (dev).

Kriteria penerimaan STE-10 adalah **keduanya menghasilkan output identik**. Satu implementasi
yang lulus test-nya sendiri tidak membuktikan apa-apa; dua implementasi independen yang sepakat
membuktikan spesifikasinya benar-benar tidak ambigu.

Selain itu, **host Soroban sendiri ikut diuji sepakat**: test
`host_sha256_matches_every_participant_hash_vector` dan
`every_participant_hash_vector_is_accepted_by_enter_and_verify` di
`sc/contracts/race_record/src/test.rs` membaca file
`docs/specs/vectors/participant_hash.json` yang sama, menjalankan preimage-nya lewat
`env.crypto().sha256()`, dan memasukkan hasilnya ke `enter` + `verify`. Jadi nilai yang dihitung
backend memang persis nilai yang diterima chain.

---

## 8. Aturan perubahan

Setelah PR STE-10 ini merged, **setiap** perubahan pada definisi `participant_hash` (termasuk
langkah normalisasi), derivasi TOTP, atau serialisasi payload QR wajib:

1. **PR baru** yang di-approve **Axel (PM) + fable (AI co-PM)**. Tidak ada self-merge.
2. **Entri di `docs/specs/CHANGELOG.md`**: versi baru, tanggal, alasan, dan dampaknya ke data
   yang sudah ada.
3. **`bash docs/specs/verify.sh` tetap hijau** dan **`cd sc && cargo test` tetap hijau**.
4. Vector lama yang berubah nilainya harus disebut **eksplisit** di changelog. Vector adalah
   artefak beku — jangan pernah di-regenerate diam-diam supaya test lewat.
5. Kalau perubahannya menyentuh signature kontrak atau kode error, ikuti juga aturan di
   `docs/specs/INTERFACE.md` §7 (termasuk **regenerate TS bindings**, STE-14).

Perubahan pada definisi hash **membatalkan semua `participant_hash` yang sudah ada on-chain**
(record lama tidak bisa diverifikasi ulang dengan aturan baru). Karena itu perubahan hash bukan
patch — minimal **major version** plus rencana migrasi yang tertulis.

---

## 9. Siapa yang mengonsumsi ini

| Tiket | Komponen | Yang dipakai |
| --- | --- | --- |
| STE-11 | PII vault + salt/secret backend (James) | §2, §3, §4.1 — hitung `participant_hash`, simpan salt + `totp_secret` |
| STE-14 | TS bindings (Axel) | tipe `BytesN<32>` untuk `participant_hash` |
| STE-15 | `SterunClient` (James) | `enter(participant_hash)`, `verify(token_id, participant_hash)` |
| STE-16 | Indexer (James) | tidak langsung — `participant_hash` muncul lewat `record_of` |
| STE-17 | Organiser console (Ancung) | verifikasi identitas via recompute hash |
| STE-18 | QR pass PWA (Ancung) | §4, §5 — hitung kode offline, render payload QR |
| STE-21 / STE-22 | Scanner PWA + TOTP verify (Ancung) | §4.5, §5 — verifikasi ±1 langkah, fallback manual |
