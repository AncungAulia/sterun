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

Header `fixed` di atas semua section, **selalu terlihat** (tidak pernah disembunyikan saat scroll,
tidak di-fade, tidak di-translate), dan warnanya **mengikuti section di bawahnya**. Saat tepi section
melewati header, header **terbelah horizontal** tepat di garis itu: bagian atas satu warna, bagian
bawah warna lain. Setiap section selebar layar membawa:

```tsx
<section data-nav-theme="dark">   // hero, section berlatar gelap
<section data-nav-theme="light">  // Problem, section berlatar terang (default kalau tidak ditandai)
```

Section tanpa atribut dianggap terang. Blok yang tidak selebar layar dan tidak pernah sampai ke
header (mis. kotak coal di bawah Problem) tidak perlu ditandai.

Cara kerjanya (`components/layouts/Navbar.tsx`, `lib/navTheme.ts`):

- **Empat salinan baris header** dengan geometri identik: `nav__layer--onLight` (ink + CTA teal),
  dua `nav__layer--onDark` (paper), dan `nav__layer--hit` yang **tak terlihat** (`opacity: 0`) tapi
  berisi link dan tombol asli. Layer bercat `aria-hidden`, `inert`, `pointer-events: none`.
  Hit layer dipisah karena `clip-path` ikut memotong hit-testing: tombol yang kepotong setengah
  cuma bisa diklik setengah.
- Tiap frame, script menghitung pita gelap yang menimpa header dan menulis `clip-path` inline:
  onDark `inset()` per pita (pool dua layer), onLight kebalikannya (polygon even-odd). **Jangan
  pernah** memberi `transition` pada `clip-path` layer ini, garisnya akan tertinggal dari tepi
  section.
- Update jalan dari `subscribeScroll` (`lib/scroll.ts`; event scroll Lenis di frame yang sama, atau
  scroll native tanpa Lenis), plus resize, `ScrollTrigger` refresh, `ResizeObserver`, dan
  `document.fonts.ready`. Offset section di-cache; jangan baca layout di loop scroll.
- Panel overlay menu ditandai `data-nav-surface` + `data-nav-theme`; selama menu bergerak, posisinya
  dibaca live per frame, jadi header ikut terbelah di atas panel yang sedang turun.
- Hover dan fokus keyboard disimpan di `<header>` sebagai `data-hover` / `data-focus`
  (`cta` | `menu` | `logo`) dan di-style dari sana, jadi dua belahan CTA ter-wipe bersamaan.
  **Jangan** pakai `:hover` untuk efek header, cuma satu layer yang menerimanya.
- Logo inline SVG `currentColor` (`components/elements/Lockup.tsx`, di-generate dari
  `public/brand/logo/sterun-lockup-black.svg`). Satu `<symbol>`, tiap layer `<use>`.
- **Tidak** memakai `mix-blend-mode` di header.

Permukaan yang digerakkan script, bukan cuma oleh scroll (lapisan biru polos di kotak How it
works), ditandai `data-nav-surface data-nav-live data-nav-theme`: header membaca rect-nya **tiap
update**, dipotong ke ancestor `data-nav-bounds`. Script yang menggerakkannya memanggil
`notifyScroll()` tepat setelah menulis transform, supaya header tidak tertinggal satu frame.

Section yang menahan layar (stage `sticky`, mis. How it works) tidak bisa dibaca header lewat
offset yang di-cache, karena posisinya berubah selama ditahan. Tandai bagian gelapnya dengan
elemen kosong `absolute` di **posisi akhirnya**, saat stage sudah dilepas (lihat marker di
`modules/how-it-works/HowItWorks.tsx`). Selama stage ditahan, bagian gelap itu tetap di bawah
header, jadi satu posisi statis itu benar di kedua fase.

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
- Kunci scroll **hanya** lewat `lockScroll()` / `unlockScroll()` dari `lib/scroll.ts`: `lenis.stop()`
  kalau Lenis jalan, `overflow: hidden` di `<html>` kalau tidak. **Jangan pernah** memasang
  `overflow: hidden` di `<body>`: saat Lenis berhenti `<html>` sudah `overflow: clip`, jadi body
  berubah jadi scroll container sendiri dan semua elemen `sticky` lepas dari layar (stage How it
  works sempat melompat di belakang menu karena ini).
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
