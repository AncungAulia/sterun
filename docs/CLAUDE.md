# `docs/` — dokumen (CLAUDE.md)

| File | Apa itu | Boleh diubah? |
| --- | --- | --- |
| `SYSTEM_DESIGN.md` | desain otoritatif C1–C14: arsitektur, storage model, lifecycle, TOTP, user flow, 30-day plan | ya, tapi lihat di bawah |
| `deployments.md` | **bukti** deploy: contract address, link stellar.expert, wasm hash, tanggal | append-only |
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

## `deployments.md` — aturan bukti

Setiap deploy **wajib** di-commit ke sini. Yang minimal harus ada per entri:

| Kolom | Kenapa |
| --- | --- |
| tanggal + network | membedakan testnet dan mainnet, dan deploy ulang |
| contract address (`C…`) | identitas on-chain-nya |
| link stellar.expert | supaya orang lain bisa cek tanpa CLI |
| **sha256 wasm yang benar-benar di-upload** | bukan hash dari tabel README — build Rust tidak reproducible lintas mesin (buktinya di `sc/README.md`) |
| tiket | STE-# yang menghasilkannya |

Sudah tercatat: **SAC sUSD testnet**
`CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (STE-30).
Belum: EventRegistry + RaceRecord — itu STE-33, dan sampai itu selesai **kontraknya belum hidup
on-chain**.

Klaim "sudah deploy" tanpa entri di file ini dianggap tidak terjadi. Reviewer grant memverifikasi
dari sini.

> `deployments.md` lahir di branch STE-30 (`ops/26-issue-susd-deploy-sac`). Kalau kamu ada di
> branch kontrak yang belum menariknya, file-nya memang belum ada di working tree — itu bukan
> salah tulis, dan jangan di-cherry-pick. Di `main` dia sudah ada.
