# V2 BUILD BRIEF — Sterun contracts v2 (upgradeable + paid add-ons + Cancelled)

Kamu agent engineering **Opus, effort TINGGI**. Bangun kontrak Sterun **v2** di worktree INI. Metodis, commit kecil-kecil, test penuh. **JANGAN pakai fable.**

## 0. Baca dulu (WAJIB, kode live bukan ingatan)
- `CLAUDE.md` (root) + `docs/SYSTEM_DESIGN.md` + `docs/specs/INTERFACE.md`
- `sc/contracts/event_registry/src/lib.rs` + `sc/contracts/race_record/src/lib.rs` (v1, sudah live testnet)
- `sc/scripts/deploy-testnet.sh` + `docs/deployments.md` (pola deploy v1 + alamat sUSD SAC)

## 1. Konteks & keputusan (dari Axel PM, Linear STE-35 + STE-34)
Kontrak v1 live tapi **NON-UPGRADEABLE** (tak ada fungsi upgrade — sudah diverifikasi: nol match `upgrade`/`update_current_contract_wasm`/`Upgradeable`). `enter` v1 tagih **persis satu** `category.price_usdc`, jadi tak bisa jual add-on berbayar (jersey +50, tumbler +30). Ancung minta add-on di STE-35. Karena v1 immutable → **v2 = alamat baru**, DAN kita pasangi mekanisme upgrade biar **ini terakhir kali ganti alamat**.

## 2. SCOPE v2 (persis ini — tak lebih, tak kurang)
1. **Upgradeability (KEDUA kontrak):** fungsi `upgrade(new_wasm_hash: BytesN<32>)` admin-gated → `env.deployer().update_current_contract_wasm(&new_wasm_hash)`. Verifikasi pola + aturan storage-compat via **MCP Stellar Raven** (Soroban native upgrade / OZ Upgradeable model). Storage key **append-only selamanya** (jangan hapus/rename/ganti-tipe key lama).
2. **Add-on on-chain (EventRegistry):**
   - `AddOnData { code: Symbol, price_usdc: i128, quota: u32, reserved_count: u32 }`; storage `AddOn(event_id, addon_id)` + `AddOnCount(event_id)`.
   - `add_addon(event_id, code, price_usdc, quota)` — organiser-auth (seperti `add_category`), validasi `price>=0` & `quota>0`.
   - views `get_addon`, `addon_count`.
   - `reserve_addon(event_id, addon_id)` — **RaceRecord-auth only** (seperti `reserve_slot`), quota-enforced, increment `reserved_count`, revert `AddOnQuotaFull` kalau habis.
3. **enter v2 (RaceRecord):** `enter(runner, event_id, category_id, addon_ids: Vec<u32>, participant_hash)`:
   - reserve category slot + untuk tiap `addon_id` panggil `reserve_addon` (quota-enforced)
   - tagih `category.price_usdc + Σ addon.price_usdc` dalam **SATU transfer atomik** runner→organiser (skip transfer kalau total==0)
   - mint record; **simpan `addon_ids` yang dipilih di RecordData** (biar apa yang dibeli runner terverifikasi)
   - **ALL-OR-NOTHING** (satu auth tree / satu invocation). Batasi jumlah add-on per enter (mis. `<= addon_count`) biar loop bounded + tolak duplikat addon_id.
4. **Status `Cancelled` (EventRegistry):** tambah `Cancelled` ke `EventStatus`. Transisi legal: `Open→Cancelled`, `Closed→Cancelled`, `Draft→Cancelled`. `Cancelled` terminal. `reserve_slot` sudah tolak non-Open. `Closed` tetap berarti "pendaftaran ditutup" — beda dari `Cancelled`.
5. **TANPA escrow** (refund tetap off-chain jujur). Karena v2 upgradeable, escrow bisa ditambah in-place nanti — **JANGAN bangun sekarang.**

## 3. Keputusan desain (putuskan DENGAN Raven, jangan nebak)
- Evolusi crate `event_registry` + `race_record` yang ADA jadi v2 in-place (wasm v1 sudah terarsip by-hash di `docs/deployments.md`, jadi source maju ke v2 aman). Update artefak spec (`docs/specs/`) jadi v2 + tandai v1 historis. **Pertahankan:** band kode error disjoint (jangan renumber ABI publik; error baru = kode bebas berikutnya di band-nya), properti non-transferable-by-absence (RaceRecord tetap tak ekspor transfer/approve/burn), pola TTL.
- Verifikasi tiap keputusan Stellar/Soroban via Raven + skill `stellar-dev:smart-contracts`.

## 4. Konvensi (WAJIB)
- **Commit kecil-kecil, English Conventional Commits** (`feat:`,`fix:`,`test:`,`chore:`,`docs:`,`refactor:`) — scope sebut v2, mis. `feat(registry-v2): add on-chain paid add-ons`.
- **MCP Stellar Raven wajib** (load: `ToolSearch "select:mcp__stellar-raven__search,mcp__stellar-raven__execute"`).
- **Update CLAUDE.md relevan**: root + `sc/` + `sc/contracts/event_registry/` + `sc/contracts/race_record/` + `docs/specs/` (dokumentasikan model upgrade + add-on + Cancelled).
- **Test penuh** (replikasi rigor v1): unit + e2e (edge/positif/negatif), `cargo llvm-cov` **>80%**, semua jalur revert/guard. WAJIB test: **jalur upgrade** (tulis state → upgrade → state kebaca benar), **add-on quota** + **tagih atomik** + **rollback all-or-nothing** (transfer gagal → slot & addon TIDAK terpakai), **transisi Cancelled**, properti non-transferable (`check-exports`). Build wasm reproducible + catat hash.

## 5. Alur (OTONOM — Axel sudah pre-authorize, TANPA gate ACC kali ini)
1. Bangun v2 di branch ini (`v2-addons-upgradeable`). Commit kecil.
2. **SEMUA test/e2e HIJAU** (ini gate yang Axel set).
3. **Deploy ke testnet** (alamat EventRegistry + RaceRecord BARU): pakai pola `sc/scripts/deploy-testnet.sh`. Key ada di `.env` (STERUN_ADMIN deployer, sUSD issuer/distributor buat fund test sUSD). Wiring: `set_race_record` + set alamat **sUSD SAC** `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (asset bayar). Sanity on-chain: `create_event → add_category → add_addon → set Open → enter(dengan add-on, bayar sUSD) → record Entered + saldo organiser naik sebesar category+addon`. Catat CA + wasm hash + tx + link stellar.expert di `docs/deployments.md`. Key deploy baru (kalau ada) simpan di `.env` gitignored.
4. **Merge ke main** (HANYA setelah semua e2e hijau): push branch → PR → merge (terdokumentasi sebagai PR).
5. **STOP + lapor**: update worktree comment diawali `V2 DEPLOYED:` berisi alamat EventRegistry v2 + RaceRecord v2 + wasm hash, biar orchestrator (sesi utama Axel) comment ke Ancung di Linear.

## 6. Scope guard
- Ini kerja kontrak Axel (C1/C2). JANGAN sentuh kode teammate (`be/`,`fe/`,`landing-page/`) kecuali catat alamat baru di docs. JANGAN utak-atik state kontrak v1 yang live.
- HARAM bertanya — ambil best-practice rekomendasi Raven, putuskan, dokumentasikan alasan di commit.

Mulai: baca file, verifikasi pola upgrade + add-on via Raven, desain v2, bangun commit kecil, test penuh, deploy, merge, lapor.
