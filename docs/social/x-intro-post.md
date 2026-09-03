# Post perkenalan pertama — akun X Sterun

Tiket: **STE-7**. Owner: Nabil. Reviewer sebelum tayang: **Axel (PM)**.

Status: **draft, belum tayang.** Isi file ini dulu yang disetujui, baru diposting, lalu URL
post-nya ditambahkan di bagian "Setelah tayang" di bawah.

Handle akun: `@_______` ← **isi setelah dikonfirmasi.**

---

## Yang diminta tiket

> Minimal 1 post perkenalan sudah tayang di akun tersebut (apa itu Sterun, satu kalimat, tanpa
> janji tanggal).

Jadi: satu post, pendek, tanpa tanggal, tanpa roadmap. Thread panjang berisi bukti adalah tiket
lain (**STE-27**) dan baru masuk akal setelah mock race selesai.

---

## Batas klaim

Yang boleh disebut sebagai fakta hari ini:

| Klaim | Kenapa aman | Sumbernya |
| --- | --- | --- |
| Kontrak hidup di **Stellar testnet** | sudah dideploy sejak STE-33 | `docs/deployments.md` |
| Race record **non-transferable** | dibuktikan dari export surface wasm — tidak ada fungsi transfer | `sc/contracts/race_record/CLAUDE.md` |
| Dibangun di **Soroban** | ya | `docs/SYSTEM_DESIGN.md` §3 |

Yang **tidak** boleh disebut:

- Apa pun soal **mainnet**. Belum ada.
- **USDC**. Testnet memakai sUSD; USDC baru relevan di mainnet.
- Tanggal rilis, jumlah pengguna, atau nama event partner yang belum memberi izin.
- Kata **"participation record"** — selalu **"race record"**. Ini menghindari bentrok penamaan
  dengan Stellar Passport, sesuai feedback SOW.

---

## Pilihan draft

Rekomendasi: **Opsi A**. Ia menyebut masalahnya sebelum menyebut solusinya, dan satu-satunya klaim
teknisnya bisa diklik orang lain.

### Opsi A — masalah dulu

```
Race bibs get resold. Results live in one organiser's database until the
organiser disappears.

Sterun issues each entry as a race record on Stellar: bound to the runner who
signed up, and verifiable long after the finish line.

Contracts are live on testnet.
```

### Opsi B — satu kalimat, paling patuh ke tiket

```
Sterun turns a race entry into a verified race record on Stellar — one that
can't be resold, and doesn't disappear when the organiser does.

Live on Stellar testnet.
```

### Opsi C — Bahasa Indonesia

```
Bib lomba diperjualbelikan. Hasil lari tersimpan di database satu panitia,
sampai panitianya bubar.

Sterun mencatat tiap pendaftaran sebagai race record di Stellar: menempel pada
pelari yang mendaftar, dan tetap bisa diverifikasi jauh setelah garis finish.

Kontraknya sudah hidup di testnet.
```

**Rekomendasi bahasa: English.** Pembaca akun ini adalah reviewer Instawards dan ekosistem Stellar
global. Versi Indonesia lebih cocok saat mendekati organiser lokal, dan itu percakapan yang
berbeda.

---

## Visual

Lampirkan **banner X** yang sudah ada, atau `sterun-lockup-black.svg` yang diekspor ke PNG di atas
latar `paper` (`#F8F8F8`). Aturan pemakaian di `docs/brand.md`.

Setelah tayang: **pin post-nya.** Akun ini akan dikunjungi lewat link dari landing dan dari laporan
grant, dan post pertama yang mereka lihat sebaiknya yang menjelaskan produknya.

---

## Setelah tayang

| Yang dicatat | Isi |
| --- | --- |
| URL post | _(isi)_ |
| Tanggal tayang | _(isi)_ |
| Opsi yang dipakai | _(isi)_ |
| Sudah di-pin | _(ya/tidak)_ |
