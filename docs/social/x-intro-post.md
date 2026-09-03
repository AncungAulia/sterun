# Post perkenalan pertama — akun X Sterun

Tiket: **STE-7**. Owner: Nabil. Reviewer sebelum tayang: **Axel (PM)**.

Handle akun: **[@sterunxyz](https://x.com/sterunxyz)**

Status: **draft final, menunggu approve Axel.** Setelah tayang, isi bagian
[Setelah tayang](#setelah-tayang) di bawah.

---

## Copy final

```
You ran a 10k in 2019. Prove it. The results page is gone and your certificate
is a jpeg in a folder somewhere.

Sterun makes every entry a race record on Stellar, so it outlives the organiser
and can't be resold.

Live on Stellar testnet.
```

**239 karakter.** Akun belum punya X Premium, jadi batasnya 280 dan copy ini harus
muat sebagai satu post tunggal — bukan thread. Kalau nanti diedit, hitung ulang.

**Kenapa versi ini.** Hook-nya rasa kehilangan, bukan bahaya: "Prove it." memaksa
pembaca ikut memikirkan lombanya sendiri sebelum sadar ini soal blockchain. Versi
sebelumnya membuka dengan pelari tumbang di kilometer 8 dan bib yang dijual ulang —
argumennya lebih kuat, tapi nadanya gelap untuk post pertama sebuah akun.

Yang tetap dibawa versi ini: keawetan catatan (`outlives the organiser`) dan
anti-jual-ulang (`can't be resold`), plus satu klaim yang bisa dicek orang lain
(`live on Stellar testnet`).

### Visual

Banner X yang sudah terpasang, atau `sterun-lockup-black.svg` diekspor ke PNG di atas
latar `paper` (`#F8F8F8`). Aturan pakai di [`docs/brand.md`](../brand.md).

Setelah tayang, **pin post-nya** — akun ini dikunjungi lewat link dari landing dan dari
laporan grant, dan post pertama yang mereka lihat sebaiknya yang menjelaskan produknya.

---

## Verifikasi klaim

### Sumber internal

| Klaim | Sumber |
| --- | --- |
| Kontrak hidup di **Stellar testnet** | [`docs/deployments.md`](../deployments.md), STE-33 |
| Race record **non-transferable** | export surface wasm — tidak ada `transfer`/`approve`/`burn` ([`sc/contracts/race_record/CLAUDE.md`](../../sc/contracts/race_record/CLAUDE.md)) |

### MCP Stellar Raven — 2026-09-03

Empat hal yang diperiksa sebelum copy ini disetujui:

**1. "participation record" memang wilayah orang lain, dan lebih dalam dari sekadar wording.**
Stellar Passport ada di direktori ekosistem (slug `stellar-passport`). Deskripsinya:
*"…transforms event attendance and community activity… With a single QR scan at a booth,
workshop, meetup, or online event… curated challenges, workshops, or learning tracks that
**verify their participation** and track their progress."*

Jadi mereka memegang frasa "verify participation" **dan** mekanisme scan-QR-di-event
sekaligus. Konsekuensinya bukan cuma menghindari istilahnya: **copy Sterun tidak boleh
membuka dengan "scan QR di event"**, karena itu kalimat pembuka mereka. Pembeda kita adalah
catatan yang menempel ke pelari dan tidak bisa dijual ulang.

**2. "race record" aman.** Nol hit di seluruh korpus dokumentasi resmi Stellar (Raven
menandai nol pada indeks itu sebagai negatif yang bisa dipercaya). Pencarian semantik ke
artikel, tweet, dan riset ekosistem juga tidak menemukan pemakaian lain. Batasnya: *tidak
ditemukan di sumber-sumber ini*, bukan *tidak ada di mana pun*.

**3. Tidak ada proyek lari/balapan di ekosistem Stellar.** Terdekat: `stride` (fitness
tracking + reward token) dan `fewticket` (ticketing + kontrol akses event). Ceruk Sterun
kosong — pakai ini untuk positioning di STE-27, jangan diklaim sebagai "pertama di dunia".

**4. "Non-transferable" adalah kosakata yang tepat.** SEP-41 mendefinisikan `transfer`
sebagai fungsi **wajib** dari token interface, dan OpenZeppelin Stellar menyediakan modul
Non-Fungible Token beserta extension-nya. Justru karena transfer adalah default yang
diharapkan, menyebut "non-transferable" itu bermakna, bukan klaim kosong.

---

## Batas klaim (berlaku untuk semua konten publik)

Yang **tidak** boleh disebut sampai benar-benar ada:

- **Mainnet.** Belum ada.
- **USDC.** Testnet memakai sUSD; USDC baru relevan di mainnet.
- Tanggal rilis, jumlah pengguna, atau nama event partner yang belum memberi izin.
- **"participation record"** — selalu **"race record"**. Lihat temuan 1 di atas.

---

## Opsi yang tidak dipakai

Disimpan supaya alasannya tidak hilang, dan supaya STE-27 tidak mengulang pekerjaan ini.

**Sudut medis** (265 kar.) — argumen terkuat, nada paling gelap:

```
Someone goes down at kilometre 8 and the medics pull up the wrong blood type,
because that bib was resold two weeks ago.

Sterun makes every entry a race record on Stellar. The contract has no transfer
function, so the bib can't be resold.

Live on Stellar testnet.
```

**Sudut resale, netral** (280 kar.) — ditolak karena baris *"that matters long before the
data does"* menggantung: menjanjikan ada yang gawat tanpa mengatakan apa, dan pembaca yang
sedang scroll tidak memecahkan teka-teki.

Versi Bahasa Indonesia juga dibuat lalu ditinggalkan. Pembaca akun ini reviewer Instawards
dan ekosistem Stellar global; Bahasa Indonesia lebih pas saat mendekati panitia lomba lokal,
dan itu percakapan yang berbeda.

---

## Setelah tayang

| Yang dicatat | Isi |
| --- | --- |
| URL post | _(isi)_ |
| Tanggal tayang | _(isi)_ |
| Sudah di-pin | _(ya/tidak)_ |
| Diubah dari draft? | _(kalau ya, tulis copy final + hitung ulang karakternya)_ |
