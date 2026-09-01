@AGENTS.md

# `fe/` — web app (CLAUDE.md)

Blok `@AGENTS.md` di atas ditulis ulang oleh `next dev` — biarkan, dan commit bersama kerjaanmu.
Isi di bawah ini punya Sterun.

Owner: **Ancung** (flow) + **Nabil** (design system). Komponen C9/C10/C11/C12. Tiket STE-17
(organiser console), STE-18/21/22 (QR pass + scanner PWA), dst. **Belum ada kode Sterun di sini** —
masih scaffold `create-next-app`.

Stack terpasang: **Next.js 16.3.3**, React 19.2.8, Tailwind v4 (`@tailwindcss/postcss`),
TypeScript 5, ESLint 9. Dua lockfile ada (`package-lock.json` + `pnpm-lock.yaml`) — pilih satu dan
hapus yang lain saat mulai kerja serius, jangan biarkan dua-duanya hidup.

```bash
cd fe
npm install      # atau pnpm install — konsisten dengan lockfile yang kamu pilih
npm run dev
npm run build
npm run lint
```

## Yang WAJIB dibaca sebelum bikin flow

| Dokumen | Untuk apa |
| --- | --- |
| `docs/SYSTEM_DESIGN.md` §6 | user flow lengkap: entry, race day, finish, verify |
| `docs/SYSTEM_DESIGN.md` §7 | desain rotating QR / anti-fraud |
| `docs/specs/HASH_AND_TOTP.md` §4–§5 | payload QR + derivasi kode TOTP, **byte-exact** |
| `docs/specs/INTERFACE.md` | signature fungsi + kode error |
| `sc/bindings/README.md` | cara memakai client TS hasil generate |

## Kontrak: pakai bindings yang sudah di-generate

```json
{
  "dependencies": {
    "event-registry": "file:../sc/bindings/event-registry",
    "race-record": "file:../sc/bindings/race-record"
  }
}
```

Jangan mengetik ulang signature kontrak, dan jangan mengedit apa pun di `sc/bindings/*/` — itu
output generator, edit tangan hilang tanpa jejak pada regenerate berikutnya.

## Yang bikin salah di sisi frontend

- **QR pass + scanner harus menghitung TOTP persis seperti backend.** Bukan "mirip". Uji terhadap
  `docs/specs/vectors/totp.json`, bukan terhadap implementasi sendiri. Kode 6 digit,
  step 30 detik, toleransi ±1 step, perbandingan constant-time.
- **Scanner PWA jalan offline.** Roster + antrian tx harus tahan device kehilangan sinyal di garis
  start. Guard anti-double-racepack ada di kontrak (`AlreadyClaimed` 102), jadi antrian yang drain
  belakangan aman — tapi UI-nya harus menjelaskan itu ke volunteer, bukan menampilkan error mentah.
- **Kode error itu angka `u32` tanpa identitas kontrak.** Pilih peta error dari band-nya:
  `1..=99` → `event-registry`, `100..=199` → `race-record`, `200+` → `NonFungibleTokenError`.
  `Error(Contract, #4)` dari `enter` = `EventNotOpen` milik EventRegistry, bukan error RaceRecord.
- **Asset testnet = sUSD, bukan USDC.** SAC `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`.
- **PII tidak pernah dikirim ke chain.** Form PII → backend; yang ke kontrak cuma
  `participant_hash`.
- **Wallet: Stellar Wallets Kit** (Freighter, xBull, Albedo, WalletConnect, Ledger) — keputusan
  `docs/SYSTEM_DESIGN.md` §8. Passkey smart account bukan scope v1.

## Konvensi

- Contract address dari `docs/deployments.md`, lewat env var, bukan hardcode tersebar.
- Testnet RPC `https://soroban-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`.
- Test: e2e + edge + positive + negative (`CLAUDE.md` root). Untuk flow bayar dan scan, kasus
  negatifnya justru yang paling penting: kuota penuh, event tutup, scan kedua, offline.
- Perbarui file ini begitu ada keputusan struktur app (router, state, komponen bersama).
