@AGENTS.md

# `landing-page/` — the landing page (CLAUDE.md)

The `@AGENTS.md` block above is rewritten by `next dev` — leave it, and commit it with your work.
What follows belongs to Sterun.

Owner: **Nabil**. Komponen C13 (landing + design system).

The stack: **Next.js 16.3.3**, React 19.2.8, Tailwind v4, TypeScript 5, ESLint 9.

**This folder is a pnpm workspace member** (`pnpm-workspace.yaml` at the root), so the only lockfile
that applies is the root `pnpm-lock.yaml`:

```bash
pnpm install                       # from the repository ROOT
pnpm --filter landing-page dev
pnpm --filter landing-page build
pnpm --filter landing-page lint
```

> **There is a stray `landing-page/pnpm-lock.yaml` in the repo, and it should be deleted.** It is
> what a `pnpm install` run from inside this folder leaves behind: nothing reads it (CI installs the
> root lockfile with `--frozen-lockfile`), but it gets committed and it drifts. Do not run an install
> from inside this folder.

## What is already here

The design system landed with STE-7: `app/tokens.css` holds the brand, greyscale and status tokens,
and the `app/tokens` route renders every one of them in the situation it was chosen for. The usage
rules — asset files, minimum sizes, the type ladder, the contrast reasoning — are in
[`../docs/brand.md`](../docs/brand.md).

`app/tokens.css` is duplicated into `fe/`, deliberately: the two apps deploy separately. Change one,
change the other in the same commit. That duplication is the agreed answer until a shared package is
worth its cost; an honest duplicate beats a wrong abstraction.

## The limits of what the copy may claim

The landing page sells the protocol, so a claim on it has to be true:

- **Non-transferable** may be stated as fact — it is proven from the wasm export surface
  (`sc/contracts/race_record/CLAUDE.md`), not promised. Since v2 that claim has a boundary worth
  keeping: it is about the deployed wasm plus the admin key, not about an address forever
  (`docs/specs/INTERFACE.md` §4).
- **"Live on Stellar testnet" is true.** Take the addresses and explorer links from
  `docs/deployments.md` rather than retyping them; that is the only source updated when an address
  changes, and the addresses did change when v2 landed.
- Testnet uses **sUSD**, not USDC. USDC only applies on mainnet.

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
- **Menahan section di layar pakai CSS `sticky`, bukan `pin` ScrollTrigger.** Tidak ada pin
  spacer yang menggeser layout saat refresh, dan offset section tetap statis untuk header. Ancestor
  stage harus `overflow-x-clip`, bukan `overflow-hidden`: `hidden` menjadikannya scroll container
  dan stage tidak pernah menempel.
- **Scrub hanya `transform`** (`x`, `y`, `yPercent`) supaya compositor yang mengerjakan dan tidak
  ada frame yang repaint. Wipe yang membuka isi pakai mask dua lapis (kotak bergerak ke satu arah,
  isinya ke arah sebaliknya), bukan `width` atau `clip-path`.
- **Hati-hati `invalidateOnRefresh` di timeline ber-stagger.** Tween yang di-invalidate lupa nilai
  awalnya sampai playhead mencapainya, jadi panel yang belum gilirannya terukur sudah turun penuh.
  Nilai fungsi (px hasil ukur) cuma untuk tween yang mulai di waktu 0; sisanya pakai persen.
- **Track horizontal How it works** (`modules/how-it-works/HowItWorksTrack.tsx`, model di
  `lib/hiwMotion.ts`). Gerakannya **diukur dari akaru.fr**, bukan dikarang: halaman mereka
  di-sample di Chrome headless (1440x900, tiap 50px scroll) dan tiap kurva di `hiwMotion.ts` adalah
  fit ke data itu. Jangan "merapikan" angkanya tanpa mengukur ulang.
  - Track berada **di dalam kotak biru**. Kotak itu panel pour terakhir, sekaligus container
    yang meng-clip track, dan tingginya satu layar penuh. Isinya di-counter-translate selama pour,
    jadi diam saat tepi kotak turun. **Tidak ada jeda**: wipe coal/runway, lalu pour sambil halaman
    terus scroll (judul naik keluar), dan pour mendarat tepat saat kotak sampai di atas layar, lalu
    kotak ditahan. Pour-nya **satu lapisan** (kotak biru), selesai saat section sampai di atas
    layar. Kotak membawa penutup `data-hiw-cover` (5 lapisan warna di atas track) yang di-wipe
    turun **berlapis** (biru pergi duluan, ink terakhir) mulai dari tengah pour sampai kotak
    menyentuh atas layar, jadi konten sudah terbuka selagi judul masih terlihat. Titik serah
    wipe coal → pour: `HANDOVER_SCREEN` di `lib/hiwMotion.ts`. Satu-satunya penahan adalah stage sticky ber-`top` negatif (tinggi
    judul). Titik serah wipe → pour ada di `HANDOVER`. Semua ukuran relatif ke **lebar kotak**
    (`--bw`, di-update `ResizeObserver`), dan panjang scroll track = `3450/900 ×` tinggi kotak.
  - Panel yang menunggu: jendela di-scale dari kiri-tengah dan turun sedikit, gambar di dalamnya
    `2 - scale`. Tarikan ke kanan dilepas oleh progres **panel sebelumnya**, bukan posisinya
    sendiri. Judul, pill, detail, dan tombol dimainkan dengan timer saat kiri panel melewati
    ambangnya, dan mundur (lebih cepat, tanpa stagger) saat di-scroll balik.
  - Enter menempati slot intro akaru, jadi mulai tergeser `0.5 - 0.666` ke kiri.
  - Tombol panah membuka langkah itu jadi dialog penuh kotak (`StepDetail.tsx`, data di
    `steps.ts`): kartu mengembang dari posisinya (clip-path), gambar mulai persis seperti di kartu
    lalu jadi crop selebar kotak, judul meluncur ke kolom kiri, deskripsi + link muncul di kanan.
    Selama terbuka: scroll dikunci (`lockScroll` + wheel/touch/tombol scroll dicegah), track
    `inert`, Tab terkunci di dialog, Escape menutup, fokus kembali ke panah **setelah** render
    berikutnya (sebelum itu track masih inert dan `focus()` diabaikan).
  - Scroll lengths akaru mengikuti **tinggi** viewport, bukan lebar (diukur di 1440x700).
  - **`gsap.quickSetter(el, "scale")` diam-diam tidak menulis apa pun** (`scale` alias). Tulis
    `style.transform` langsung untuk elemen yang transform-nya milik sendiri.
- **Jangan animasikan `font-weight` pada teks yang mengalir.** Bobot yang lebih berat juga lebih
  lebar, jadi setiap karakter setelahnya bergeser dan baris bisa pindah. Untuk efek tebal, pakai
  `-webkit-text-stroke` berwarna sama (lihat `.problem-char` di `globals.css`).
