# `be/` — backend Node/TS (CLAUDE.md)

**Masih kosong** (`.gitkeep`). Owner: **James**. Komponen C7 (API + PII vault) dan C8 (indexer +
TTL keeper). Tiket: STE-11, STE-12, dan turunannya.

File ini ada supaya orang pertama yang menulis kode di sini tidak perlu menebak.

## Yang WAJIB dibaca sebelum baris pertama

| Dokumen | Kenapa untuk backend |
| --- | --- |
| `docs/specs/HASH_AND_TOTP.md` | `participant_hash`, salt, TOTP — **byte-exact**. Backend menghitung nilai yang harus **identik** dengan yang dihitung scanner PWA dan kontrak. |
| `docs/specs/vectors/` | test vector. Test backend harus lulus vector yang **sama**, bukan vector buatan sendiri. |
| `docs/specs/INTERFACE.md` §1.3, §2.3 | bentuk topic/data event + urutan emisi — itu yang di-filter indexer |
| `docs/SYSTEM_DESIGN.md` §4, §6, §7 | data model, user flow, desain anti-fraud |

## Cara memanggil kontrak: pakai bindings, jangan tulis ulang signature

Bindings TypeScript sudah di-generate dan di-commit di `sc/bindings/`. Konsumsi lewat `file:`
dependency (bukan pnpm workspace — repo ini belum punya workspace root, dan `fe/` +
`landing-page/` masing-masing punya lockfile sendiri):

```json
{
  "dependencies": {
    "event-registry": "file:../sc/bindings/event-registry",
    "race-record": "file:../sc/bindings/race-record"
  }
}
```

Detail lengkap + tiga jebakan pertama (`networks` tidak ada, `__constructor` bukan method, versi
`package.json` sengaja `0.0.0`): [`sc/bindings/README.md`](../sc/bindings/README.md).

## Kode error: baca band-nya, jangan tebak

`enter` cross-call ke EventRegistry **dan** SAC, dan revert mereka merambat apa adanya. Jadi
`Error(Contract, #4)` yang keluar dari `enter` **bukan** error RaceRecord — itu `EventNotOpen`
milik EventRegistry.

| Band | Peta error yang benar |
| --- | --- |
| `1..=99` | `Errors` dari paket `event-registry` |
| `100..=199` | `Errors` dari paket `race-record` |
| `200..=214` | `NonFungibleTokenError` dari paket `race-record` |

## Aturan PII (tidak bisa ditawar)

On-chain **cuma** `participant_hash`. Nama, NIK, dan kontak darurat tidak pernah menyentuh chain,
tidak pernah masuk `uri`, tidak pernah masuk event. PII terenkripsi at rest di Postgres; salt
per-record; `docs/SYSTEM_DESIGN.md` §4 yang mengatur bentuknya.

Kalau kamu tergoda menaruh sesuatu yang bisa mengidentifikasi orang ke dalam field on-chain mana
pun — jangan. Itu tidak bisa dihapus.

## Konvensi

- Node.js + TypeScript, `strict: true`. Bindings sudah dibuktikan lolos `tsc --noEmit` strict.
- Testnet: RPC `https://soroban-testnet.stellar.org`, passphrase
  `Test SDF Network ; September 2015`, asset **sUSD** (SAC
  `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`) — **bukan** USDC. Mainnet baru USDC.
- Contract address diambil dari `docs/deployments.md`, jangan di-hardcode di banyak tempat.
- Test: e2e + edge + positive + negative, sama seperti sisi kontrak (`CLAUDE.md` root).
- Perbarui file ini begitu stack-nya benar-benar dipilih (framework, ORM, runner test).
