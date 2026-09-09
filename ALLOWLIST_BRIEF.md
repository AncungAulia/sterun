# BRIEF — Organiser allowlist di EventRegistry v2 (via UPGRADE IN-PLACE)

Kamu agent engineering **Opus, effort TINGGI**. Fitur fokus, tapi ini **upgrade IN-PLACE ke kontrak LIVE** — hati-hati storage compat. Commit kecil, English Conventional Commits. **JANGAN pakai fable.**

## Keputusan (dari Axel PM, Linear STE-36 — Opsi A)
Sekarang siapa pun bisa `create_event` dengan nama apa pun → impersonation panitia. Fix: **allowlist organiser di EventRegistry v2**, gerbang keras. Admin = **STERUN_ADMIN** (di `.env`). Organiser minta akses off-chain, admin `add_organiser`. B/KYC = pasca-pilot (BUKAN sekarang).

**PENTING: ini UPGRADE, bukan redeploy.** EventRegistry v2 sudah live + upgradeable di `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`. Tambah fitur → build wasm baru → `upgrade(new_wasm_hash)` → **alamat TETAP**, event lama utuh. RaceRecord v2 TIDAK berubah.

## 0. Baca dulu
`sc/contracts/event_registry/src/lib.rs` (khususnya `add_scanner`/`remove_scanner`/`is_scanner` + `create_event`), `docs/specs/INTERFACE.md` + `docs/specs/CLAUDE.md` (prosedur ubah spec), `sc/scripts/upgrade-testnet.sh`, `docs/deployments.md` (entry v2).

## 1. Scope kontrak (EventRegistry v2 saja)
Cermin persis pola scanner yang sudah ada + teruji:
- Storage: `DataKey::Organiser(Address) -> bool`. **APPEND variant baru di AKHIR enum DataKey** (jangan sisipkan di tengah / jangan ubah variant lama — storage compat upgrade). 
- `add_organiser(env, organiser: Address)` — admin-gated (`read_admin(&env)?.require_auth()`), tulis key, revert kalau sudah ada (`OrganiserAlreadyAdded`). Emit `OrganiserAdded`.
- `remove_organiser(env, organiser: Address)` — admin-gated, hapus key, revert kalau tak ada (`OrganiserNotFound`). Emit `OrganiserRemoved`.
- `is_organiser(env, addr: Address) -> bool` — view (`.unwrap_or(false)`).
- **Gerbang `create_event`**: setelah `organiser.require_auth()`, tolak kalau `!is_organiser(organiser)` → revert error baru `NotAllowlistedOrganiser`. (require_auth tetap ada; allowlist adalah lapis identitas di atasnya.)
- Error baru: kode BEBAS BERIKUTNYA di band EventRegistry (1..=99). Sekarang max 13 (`ScannerNotFound`) → pakai 14, 15, 16. **JANGAN renumber ABI lama.**

## 2. Test (WAJIB, replikasi rigor v1)
- `add_organiser` oleh admin OK; oleh non-admin revert.
- `create_event` oleh wallet TIDAK di-allowlist → revert `NotAllowlistedOrganiser`; oleh yang di-allowlist → sukses.
- `remove_organiser` lalu `create_event` → revert lagi.
- `is_organiser` view benar (true/false/after-remove).
- **Upgrade storage-compat**: event yang ditulis SEBELUM variant Organiser ditambah tetap kebaca benar (pakai pola test upgrade yang sudah ada di `test.rs` mod `upgrade`). Ini bukti in-place upgrade aman.
- `cargo llvm-cov` >80%. Semua jalur revert.

## 3. Spec + docs
- Update `docs/specs/INTERFACE.md` lewat prosedur di `docs/specs/CLAUDE.md` (naikkan versi, mis. v2.1.0 — fungsi baru = minor). Dokumentasikan add/remove/is_organiser + gerbang create_event.
- Update CLAUDE.md relevan (root + sc/contracts/event_registry/).

## 4. Deploy = UPGRADE IN-PLACE (Axel pre-authorize, TANPA gate ACC)
1. Semua test/e2e HIJAU dulu (gate merge).
2. Build wasm baru EventRegistry. Pakai `sc/scripts/upgrade-testnet.sh` (atau `stellar contract invoke ... -- upgrade --new_wasm_hash <hash>`) dengan **STERUN_ADMIN** dari `.env`, target kontrak LIVE `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`. **Alamat TETAP.**
3. **Seed allowlist**: `add_organiser` untuk wallet organiser pilot supaya demo tetap jalan — minimal `STERUN_ORGANISER_ADDRESS` dari `.env`. (Catat di deployments.md wallet mana yang di-allowlist.)
4. Sanity on-chain: (a) `create_event` dari wallet TIDAK di-allowlist (mis. STERUN_TEST_A) → **DITOLAK** `NotAllowlistedOrganiser`; (b) dari STERUN_ORGANISER (allowlisted) → sukses; (c) event lama masih kebaca (`get_event 0`) — bukti storage selamat. Bukti tx.
5. Catat di `docs/deployments.md`: entry UPGRADE (contract CAPB6NQP…, wasm lama→baru hash, tx upgrade, wallet yang di-allowlist, link stellar.expert). Alamat TIDAK berubah.
6. **Merge ke main** (setelah e2e hijau): push branch → PR → merge (terdokumentasi). Kunci deploy baru (kalau ada) simpan di `.env` gitignored.
7. STOP + set worktree comment diawali `ALLOWLIST DEPLOYED:` berisi: alamat (tetap), wasm lama→baru, wallet allowlisted, ringkas bukti sanity.

## 5. Konvensi
- **MCP Stellar Raven wajib** verifikasi keputusan (upgrade storage-compat, allowlist pattern, auth). Load: `ToolSearch "select:mcp__stellar-raven__search,mcp__stellar-raven__execute"`.
- Commit kecil English Conventional Commits, akhiri pesan commit dengan:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- HARAM bertanya — ambil best-practice Raven, putuskan, dokumentasikan di commit.
- Scope guard: HANYA EventRegistry v2 + spec/docs terkait. JANGAN sentuh RaceRecord, be/, fe/, sdk/. JANGAN redeploy alamat baru — WAJIB upgrade in-place.

Mulai: baca file, verifikasi via Raven, bangun fitur (commit kecil), test penuh, upgrade in-place kontrak live, seed allowlist, sanity on-chain, merge, lapor.
