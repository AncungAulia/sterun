# Brand Sterun — aset, warna, huruf

Owner: **Nabil** (C13, STE-7). Ini panduan, bukan peraturan. Kalau sebuah aturan di bawah membuat
sebuah halaman jadi lebih jelek, halamannya yang menang — tapi tulis alasannya di PR.

Yang **tidak** fleksibel cuma tiga, dan ketiganya bukan soal selera:

1. Warna diambil dari token, tidak pernah diketik sebagai hex di komponen.
2. Istilahnya **"race record"**, tidak pernah "participation record".
3. Warna tidak pernah jadi satu-satunya penanda arti — selalu ada ikon atau teks.

---

## File aset

Semua ada di `landing-page/public/brand/logo/` dan salinan identik di `fe/public/brand/logo/`.
Dua salinan memang disengaja: kedua app punya lockfile, `node_modules`, dan deploy sendiri
(lihat `landing-page/CLAUDE.md`). Ubah satu, ubah yang lain di commit yang sama.

| File | Bentuk | Dipakai di mana |
| --- | --- | --- |
| `sterun-logo-black.svg` | mark saja, 400×400 | slot persegi di atas latar terang: favicon, avatar, header app |
| `sterun-logo-white.svg` | mark saja, 400×400 | slot persegi di atas latar gelap |
| `sterun-lockup-black.svg` | mark + wordmark, 1245×400 | slot lebar di atas latar terang: header situs, banner, slide |
| `sterun-lockup-white.svg` | mark + wordmark, 1245×400 | slot lebar di atas latar gelap |
| `sterun-background.png` | mark di atas kotak `#F8F8F8`, 400×400 | sumber favicon; avatar X |

Keempat SVG **transparan** — tidak ada kotak putih di belakangnya, jadi masing-masing mengambil
warna apa pun yang ada di bawahnya.

### Pilih file, jangan pakai filter CSS

Versi terang bukan versi gelap yang di-`invert()`. Kalau latarnya gelap, pakai file `-white`.
`filter: invert()` juga membalik warna lain di dalam gambar dan hasilnya tidak pernah persis.

---

## Ukuran dan jarak

**Minimum mark: 32px.** Runner-nya digambar dengan garis tipis terbuka, dan garis tipis adalah hal
pertama yang hancur saat diperkecil. Di 32px — yang memang dipakai tab browser modern — masih
terbaca. Di 24px ke bawah garisnya mulai menyatu jadi gumpalan.

Kalau suatu saat butuh mark di bawah 32px, jawabannya bukan memaksa file ini, tapi menggambar
varian sederhana khusus ukuran kecil. Itu hal normal yang dimiliki hampir semua logo.

**Lockup:** minimum lebar 160px. Di bawah itu wordmark-nya tidak terbaca; pakai mark saja.

**Clear space:** `viewBox` tiap file sudah memuat jarak amannya. Selama file dipakai apa adanya
tanpa dipotong, jaraknya sudah benar. Patokan kasar kalau harus mengukur manual: sisakan ruang
kosong selebar tinggi kepala runner di setiap sisi.

---

## Warna

Sumber kebenarannya `landing-page/app/tokens.css` (dan salinannya di `fe/`), bukan dokumen ini.
Yang di bawah ini rangkuman supaya bisa dibaca tanpa membuka kode.

### Brand — tiga warna

| Token | Hex | Peran |
| --- | --- | --- |
| `paper` | `#F8F8F8` | latar halaman |
| `ink` | `#1E232B` | teks utama, permukaan gelap |
| `teal` | `#016985` | satu-satunya aksen — kalau teal, berarti bisa diklik |

Turunannya: `n-50`…`n-950` (sepuluh tingkat abu-abu yang dicondongkan ke arah ink) dan
`teal-50`…`teal-800` (tombol punya empat state yang harus terlihat berbeda).

### Status — berpasangan

| Arti | Gelap (teks) | Terang (layar penuh) |
| --- | --- | --- |
| sukses | `#067A38` | `#0FA047` |
| bahaya | `#A31C11` | `#E23B22` |
| peringatan | `#8F5200` | `#D18700` |

Yang gelap untuk teks di atas latar terang; yang terang untuk panel penuh layar di hari lomba,
selalu dengan huruf 32px ke atas. Hijau digeser ke arah kuning menjauh dari teal, dan peringatan
digeser ke amber menjauh dari merah, supaya tiap pasangan tetap bisa dibedakan oleh mata yang buta
warna merah-hijau.

Semua warna teks di atas lolos 4.5:1 terhadap `paper`. Yang `-strong` lolos 3:1 terhadap putih, dan
itu cukup karena cuma dipakai di bawah huruf besar.

---

## Huruf

| Kelas | Font | Untuk apa |
| --- | --- | --- |
| `.heading-hero` | Big Shoulders 700 | hero landing, vonis scanner — satu per layar |
| `.heading-strong` | Poppins italic 600 | wordmark, judul section |
| `.heading` | Poppins italic 500 | judul kartu |
| (default) | Poppins roman 400–500 | body, form, tabel, angka |
| `.numeric` | Poppins + tabular figures | nomor bib, kode 6 digit, alamat kontrak |

**Poppins tidak pernah melewati 600.** Bukan sekadar imbauan: `layout.tsx` cuma memuat weight
400/500/600, jadi `font-bold` akan menghasilkan tebal palsu buatan browser yang kelihatan jelek —
pelanggarannya ketahuan sendiri. Penekanan datang dari ukuran, italic, dan warna.

`.numeric` menyalakan *tabular figures* dan *slashed zero*: semua angka jadi selebar, sehingga kode
yang berganti tiap 30 detik tidak bergoyang, dan `0` tidak terbaca sebagai `O` oleh volunteer yang
membacanya keras-keras.

---

## Favicon

`app/icon.png` (256px), `app/apple-icon.png` (180px), dan `app/favicon.ico` (16/32/48) di **kedua**
app. Ketiganya di-generate dari `sterun-background.png` dengan cara memotong kanvas 400×400 ke
kotak pembatas mark-nya lalu menambah margin 14%, supaya runner-nya mengisi ruang alih-alih
mengambang di tengah padding.

Next.js memasang ketiganya otomatis lewat konvensi nama file di `app/` — tidak ada `<link>` yang
perlu ditulis tangan. Kalau mark-nya berubah, generate ulang ketiganya, jangan edit satu-satu.

---

## Melihat semuanya sekaligus

```bash
cd landing-page && npx next dev --port 4311   # lalu buka /tokens
```

Route `/tokens` menampilkan setiap token di situasi tempat ia dipilih: logo di empat ukuran, lockup
di tiga latar, tujuh warna status berdampingan, tangga berat huruf, dan dua layar scanner. Halaman
itu ada supaya ketidaksetujuan muncul sebelum Ancung membangun di atasnya, bukan sesudah. Hapus
atau kunci di balik flag begitu tokennya disepakati.
