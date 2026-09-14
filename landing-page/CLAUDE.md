@AGENTS.md

# `landing-page/` — landing (CLAUDE.md)

Blok `@AGENTS.md` di atas ditulis ulang oleh `next dev` — biarkan, dan commit bersama kerjaanmu.
Isi di bawah ini punya Sterun.

Owner: **Nabil**. Komponen C13 (landing + design system).

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
- **"Live on Stellar testnet" sekarang benar** — EventRegistry `CDL6A734…GTA64` dan RaceRecord
  `CDWFNF42…XNB4` sudah hidup sejak STE-33. Tetap ambil alamat dan link explorer dari
  `docs/deployments.md`, jangan diketik ulang; itu satu-satunya sumber yang diperbarui saat
  alamatnya berubah.
- Testnet memakai **sUSD**, bukan USDC. USDC baru di mainnet.

## Konvensi

- Copy landing: **English** (keputusan Nabil, STE-12). Pembacanya reviewer Instawards dan
  ekosistem Stellar global; versi Indonesia untuk organiser lokal adalah percakapan lain, bukan
  halaman ini. Teksnya tinggal di [`docs/landing-copy.md`](../docs/landing-copy.md) berikut
  larangan yang berlaku — kalau teks di kode berbeda dengan file itu, samakan di commit yang sama.
- Aksesibilitas dan performa bukan polish belakangan — ini halaman yang dibuka reviewer grant
  duluan.
- Perbarui file ini begitu design system-nya punya bentuk (token, komponen, cara `fe/` memakainya).

## Section dan header

Header fixed di atas semua section dan warnanya **mengikuti section yang ada di bawahnya**: putih di
atas section gelap (hero, overlay menu), ink di atas section terang. Setiap section selebar layar
**wajib** membawa salah satu:

```tsx
<section data-header-tone="dark">   // hero, section berlatar gelap
<section data-header-tone="light">  // Problem, section berlatar terang
```

Tanpa atribut itu, header mempertahankan warna section terakhir yang dilewatinya, dan di atas latar
yang salah logo, CTA, serta MENU menghilang. Deteksinya di `useHeaderTone` (`Navbar.tsx`): satu
garis 1px di tengah tinggi header, jadi warna berganti saat tepi section melewati header, bukan saat
section baru muncul di bawah layar.

## Motion

### Smooth scroll: Lenis

- **`lenis` dipin persis `1.2.3`** (tanpa `^`). Default-nya berubah antar versi minor, dan rasa scroll
  halaman ini datang dari default itu.
- Init cuma `new Lenis({ autoRaf: true })` di `lib/scroll.ts`. **Jangan** override `lerp`,
  `duration`, atau `easing`.
- **Jangan** pakai `ScrollTrigger.scrollerProxy`, `lenis.on("scroll", ScrollTrigger.update)`, atau
  `gsap.ticker.lagSmoothing(0)`. Lenis menggerakkan posisi scroll window yang asli, jadi browser
  melempar event scroll native dan ScrollTrigger sinkron sendiri. Proxy atau loop update kedua di
  atasnya membuat keduanya berebut. Terukur dengan scroll roda mouse: progres reveal mengikuti
  posisi scroll.
- Kunci scroll lewat `lockScroll()` / `unlockScroll()` dari `lib/scroll.ts` (`lenis.stop()` /
  `lenis.start()`), bukan dengan memegang instance-nya. Overlay menu memanggil keduanya.
- Elemen yang scroll sendiri di dalam halaman (panel menu) diberi `data-lenis-prevent`.
- Di bawah `prefers-reduced-motion` Lenis **tidak dijalankan sama sekali**
  (`components/elements/SmoothScroll.tsx`), dan preferensi itu diikuti langsung.

### GSAP

- **GSAP 3.15** (lisensi standar gratis). Plugin yang di-register: **ScrollTrigger** dan
  **SplitText**. Flip dan InertiaPlugin ada di paket tapi baru di-register kalau benar-benar dipakai.
- GSAP dipakai **hanya** untuk gerakan yang tidak bisa diungkapkan CSS dengan bersih: reveal per
  karakter yang di-scrub ke scroll, dan entrance yang dipicu viewport dengan stagger. Hover,
  underline, roll CTA, dan panel menu tetap CSS / transition (`app/globals.css`,
  `MenuOverlay.tsx`). Jangan tambah library animasi lain.
- Semua setup GSAP ada di dalam `gsap.matchMedia().add("(prefers-reduced-motion: no-preference)")`.
  Reduced motion otomatis berarti tidak ada gerakan, dan `mm.revert()` di cleanup membersihkan inline
  style, ScrollTrigger, serta SplitText saat komponen unmount.
- Pecah teks dengan **SplitText** (`type: "words,chars"`, `aria: "auto"`), bukan span buatan tangan.
  Word wrapper menjaga baris cuma pecah di spasi, dan `aria: "auto"` membuat screen reader membaca
  kalimat, bukan mengeja huruf.
- Warna yang dianimasikan dibaca **dari elemen ber-kelas token** (`getComputedStyle`), bukan ditulis
  sebagai hex. Tailwind v4 cuma meng-emit variabel `--color-*` yang dipakai oleh suatu kelas, jadi
  membaca `var(--color-…)` langsung dari `:root` bisa kosong.
- **Jangan animasikan `font-weight` pada teks yang mengalir.** Bobot yang lebih berat juga lebih
  lebar, jadi setiap karakter setelahnya bergeser dan baris bisa pindah. Untuk efek tebal, pakai
  `-webkit-text-stroke` berwarna sama (lihat `.problem-char` di `globals.css`).
