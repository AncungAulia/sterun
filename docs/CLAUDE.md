# `docs/` — dokumen (CLAUDE.md)

| File | Apa itu | Boleh diubah? |
| --- | --- | --- |
| `SYSTEM_DESIGN.md` | desain otoritatif C1–C14: arsitektur, storage model, lifecycle, TOTP, user flow, 30-day plan | ya, tapi lihat di bawah |
| `deployments.md` | **bukti** deploy: contract address, link stellar.expert, wasm hash, tanggal | append-only |
| `brand.md` | panduan aset, warna, huruf (C13) — rangkuman yang bisa dibaca tanpa buka kode | ya, tapi lihat di bawah |
| `social/` | draft konten publik sebelum tayang, plus URL-nya sesudah tayang | ya |
| `specs/` | handoff contract **BEKU** (C4) | punya aturannya sendiri → [`specs/CLAUDE.md`](specs/CLAUDE.md) |

## `SYSTEM_DESIGN.md`

Ini yang dibaca duluan siapa pun sebelum kerja, dan yang dirujuk deskripsi tiket Linear. Kalau
implementasi ternyata menyimpang dari dokumen ini, **jangan diam-diam**: perbarui dokumennya di
commit yang sama, atau tulis alasan menyimpangnya. Dokumen desain yang bohong lebih berbahaya
daripada tidak ada dokumen.

Yang sudah dipindah ke tempat yang lebih ketat, jangan diduplikasi di sini:

- signature fungsi, layout event, kode error → `specs/INTERFACE.md` (beku)
- definisi `participant_hash` dan TOTP → `specs/HASH_AND_TOTP.md` (beku)
- konvensi build/test kontrak → `sc/CLAUDE.md` dan `sc/README.md`

Nilai konkret di `SYSTEM_DESIGN.md` (mis. "USDC") boleh tertinggal di belakang keputusan final
(testnet = **sUSD**); `CLAUDE.md` root yang berlaku kalau bentrok.

## `brand.md` — rangkuman, bukan sumber kebenaran

Nilai token yang sebenarnya hidup di `landing-page/app/tokens.css` (dan salinannya di
`fe/app/tokens.css`). `brand.md` menyalin sebagiannya supaya orang yang tidak membuka kode tetap
bisa membacanya. Kalau keduanya bentrok, **token yang menang** — dan `brand.md` yang salah, perbaiki
di commit yang sama.

Aset logo sendiri tidak di sini: `landing-page/public/brand/logo/` + salinan di `fe/`.

## `social/` — draft dulu, tayang belakangan

Konten yang mewakili project di depan publik ditulis sebagai file di sini, direview Axel (PM),
baru diposting. Setelah tayang, URL-nya dicatat balik ke file yang sama.

Alasannya sama dengan `deployments.md`: klaim yang tidak bisa dicek orang lain dianggap tidak
terjadi. Bedanya di sini yang diperiksa adalah **akurasi klaim teknis** — post yang menyebut
mainnet, USDC, atau tanggal rilis, padahal belum ada, lebih mahal daripada tidak posting sama
sekali.

## `deployments.md` — aturan bukti

Setiap deploy **wajib** di-commit ke sini. Yang minimal harus ada per entri:

| Kolom | Kenapa |
| --- | --- |
| tanggal + network | membedakan testnet dan mainnet, dan deploy ulang |
| contract address (`C…`) | identitas on-chain-nya |
| link stellar.expert | supaya orang lain bisa cek tanpa CLI |
| **sha256 wasm yang benar-benar di-upload** | bukan hash dari tabel README — build Rust tidak reproducible lintas mesin (buktinya di `sc/README.md`) |
| tiket | STE-# yang menghasilkannya |

Sudah tercatat, semuanya **live di testnet**:

| Apa | Address | Tiket |
| --- | --- | --- |
| SAC sUSD | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` | STE-30 |
| EventRegistry | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` | STE-33 |
| RaceRecord | `CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4` | STE-33 |

Entri STE-33 juga memuat rehearsal on-chain penuh (`enter` → `claim_racepack` → `record_finish`)
berikut kasus negatifnya. Kalau kamu perlu contoh bentuk bukti yang cukup, itu contohnya.

Klaim "sudah deploy" tanpa entri di file ini dianggap tidak terjadi. Reviewer grant memverifikasi
dari sini.

> `deployments.md` lahir di branch STE-30 (`ops/26-issue-susd-deploy-sac`). Kalau kamu ada di
> branch kontrak yang belum menariknya, file-nya memang belum ada di working tree — itu bukan
> salah tulis, dan jangan di-cherry-pick. Di `main` dia sudah ada.
