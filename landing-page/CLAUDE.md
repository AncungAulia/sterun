@AGENTS.md

# `landing-page/` — landing (CLAUDE.md)

Blok `@AGENTS.md` di atas ditulis ulang oleh `next dev` — biarkan, dan commit bersama kerjaanmu.
Isi di bawah ini punya Sterun.

Owner: **Nabil**. Komponen C13 (landing + design system). **Belum ada kode Sterun di sini** — masih
scaffold `create-next-app`, sama persis dengan `fe/`.

Stack terpasang: **Next.js 16.3.3**, React 19.2.8, Tailwind v4, TypeScript 5, ESLint 9. Dua
lockfile hidup berbarengan (`package-lock.json` + `pnpm-lock.yaml`) — pilih satu, hapus yang lain.

```bash
cd landing-page
npm install
npm run dev
npm run build
npm run lint
```

## Ini app terpisah dari `fe/`, dan memang disengaja

`landing-page/` dan `fe/` berdiri sendiri: lockfile sendiri, `node_modules` sendiri, deploy
sendiri. Jangan menyatukan keduanya jadi satu workspace tanpa keputusan eksplisit — itu merombak
cara ketiga app di repo ini di-install, dan bukan porsi tiket landing.

Yang **boleh** dibagi: token design system (warna, tipografi, spacing) dan aset. Cara membaginya
diputuskan bersama Ancung waktu C13 jalan; sampai itu, duplikasi yang jujur lebih baik daripada
abstraksi yang salah.

## Batas isi

Landing menjual protokolnya, jadi klaim di halaman ini harus benar:

- **Non-transferable** boleh disebut sebagai fakta — dibuktikan dari export surface wasm
  (`sc/contracts/race_record/CLAUDE.md`), bukan janji.
- **Belum ada kontrak yang hidup di testnet sampai STE-33 selesai.** Jangan pasang contract
  address, link explorer, atau "live on Stellar testnet" sebelum entrinya ada di
  `docs/deployments.md`. Kalau butuh angka atau alamat, ambil dari file itu.
- Testnet memakai **sUSD**, bukan USDC. USDC baru di mainnet.

## Konvensi

- Copy landing: **Bahasa Indonesia**, kecuali diputuskan lain oleh Axel.
- Aksesibilitas dan performa bukan polish belakangan — ini halaman yang dibuka reviewer grant
  duluan.
- Perbarui file ini begitu design system-nya punya bentuk (token, komponen, cara `fe/` memakainya).
