# HASH & TOTP — the byte-exact specification (v1.0.1)

> **Status: FROZEN 2026-08-31 (STE-10, component C4).**
> This is handoff contract number 2 in `docs/SYSTEM_DESIGN.md` §9: the byte-exact definitions of
> `participant_hash` and of check-in code derivation, so that the **backend (James)**, the **QR
> pass** and the **scanner PWA (Ancung)** compute **identical** values without having to read each
> other's code.
>
> The rules for changing it are in §8 and `docs/specs/CHANGELOG.md`. The contract interface is in
> `docs/specs/INTERFACE.md`.

What accompanies this document:

| File | Contents |
| --- | --- |
| `docs/specs/vectors/participant_hash.json` | 5 vectors + 4 rejection cases, with their preimages in hex |
| `docs/specs/vectors/totp.json` | 4 code vectors + 8 verification cases |
| `docs/specs/reference/node/verify-vectors.mjs` | reference implementation #1 (Node, **zero npm dependencies**) |
| `docs/specs/reference/rust/` | reference implementation #2 (Rust, a standalone crate) |
| `docs/specs/verify.sh` | runs both; fails loudly if either disagrees |

**If this document and a reference implementation disagree, the document + vectors win.** Every
number in this document was genuinely computed, not typed from memory.

---

## 1. The whole thing on one screen

```
participant_hash = SHA-256(
      utf8(norm_name(name))                   || 0x00
   || utf8(norm_id(national_id))              || 0x00
   || utf8(norm_contact(emergency_contact))   || 0x00
   || salt                                              // 32 RAW bytes, not hex text
)                                                       // -> 32 bytes = BytesN<32> for RaceRecord.enter

time_step     = floor(unix_seconds / 30)                        // u64
mac           = HMAC-SHA-256(key = totp_secret (32 raw bytes),
                             msg = time_step as 8 big-endian bytes)
offset        = mac[31] & 0x0F
bin           = ((mac[offset] & 0x7F) << 24) | (mac[offset+1] << 16)
              | (mac[offset+2] << 8) | mac[offset+3]
code          = 6 decimal digits, LEFT-PADDED with '0', from (bin % 1_000_000)

qr            = {"t":<token_id>,"s":<time_step>,"c":"<code>"}   // exactly this, no spaces
```

Rendering rules that hold across the whole system:

- **Hex is always lowercase, with no `0x` prefix.** Salts and `totp_secret`s appear as 64 hex
  characters in JSON and the API; what goes into the hash or the HMAC is their **raw bytes**, not
  that hex text.
- **`code` is always a 6-character string.** Never an integer. See §4.4.

---

## 2. Input normalisation

A registration form produces human text: doubled spaces, tabs from copy-paste, national IDs written
with hyphens, phone numbers written with brackets. Two spellings of the same person's name can use
different Unicode code point sequences and look identical. If we hashed that raw, recomputing later
(a medic, an insurer, an auditor) would fail even though the data is correct. So every field is
normalised first, deterministically.

### 2.1 The definition of whitespace (read this, do not skip)

This specification uses an **explicit list** of the 25 Unicode code points with `White_Space=Yes`:

```
U+0009 U+000A U+000B U+000C U+000D   (TAB LF VT FF CR)
U+0020                                (SPACE)
U+0085                                (NEL)
U+00A0                                (NO-BREAK SPACE)
U+1680                                (OGHAM SPACE MARK)
U+2000 .. U+200A                      (EN QUAD .. HAIR SPACE)
U+2028 U+2029                         (LINE / PARAGRAPH SEPARATOR)
U+202F                                (NARROW NO-BREAK SPACE)
U+205F                                (MEDIUM MATHEMATICAL SPACE)
U+3000                                (IDEOGRAPHIC SPACE)
```

**Do not simply use JavaScript's `String.prototype.trim()` / `\s` or Rust's
`char::is_whitespace()` as the definition.** They are not the same set:

| Code point | ECMAScript `WhiteSpace` | Unicode `White_Space` (= Rust) |
| --- | --- | --- |
| `U+0085` NEL | **not** whitespace | **whitespace** |
| `U+FEFF` ZWNBSP | **whitespace** | **not** whitespace |

If the spec only said "Unicode whitespace" and each language used its own built-in, two
implementations would produce **different hashes** for the same input. So the list is written out
explicitly and hardcoded in both reference implementations. The test
`whitespace_table_equals_unicode_white_space` in the Rust crate proves that list is exactly
`char::is_whitespace()` across the **entire** Unicode scalar range, so it is tied to a real Unicode
property rather than to a guess.

Note: `U+200B` ZERO WIDTH SPACE is **not** whitespace despite its name, and neither is `U+FEFF`.
Both pass through into the hash unchanged.

### 2.2 `norm_base(s)` — used by every field

| # | Step |
| --- | --- |
| **N1** | Unicode **NFC** normalisation. |
| **N2** | Strip whitespace (§2.1) from the start and the end. |
| **N3** | Replace every internal **run** of whitespace with a **single** `U+0020`. |
| **N4** | **REJECT** (error; never hash it) if the result is empty or contains `U+0000`. |

The order must be exactly that.

### 2.3 Per field

| Field | Rule |
| --- | --- |
| `norm_name(s)` | `norm_base(s)`. **No case folding** — the capitalisation of a person's name is part of their name. |
| `norm_id(s)` | **N5:** `norm_base(s)`, then remove **all** whitespace and every ASCII hyphen-minus `-`, then **ASCII-uppercase** (`a-z` → `A-Z` only). **N5b:** reject if the final result is empty. |
| `norm_contact(s)` | **N6:** `norm_base(s)`, then remove all whitespace and every `-`, `(`, `)`. A leading `+` is preserved (never removed). **N6b:** reject if the final result is empty. |

**ASCII-uppercase, not Unicode uppercase.** Do not use `toUpperCase()` (JS) or `to_uppercase()`
(Rust): both are locale- and script-dependent and will change the string's length (e.g. `ß` → `SS`,
Turkish `i` → `İ`). The correct tools are an ASCII-only `toUpperCase` / `to_ascii_uppercase()`.

**Why N5b/N6b exist** (an explicit addition to the PM's draft specification, which only mentioned
rejection at N4): an input like `" -- - "` passes N4 (after trimming there is still something) but
becomes an empty string once N5 removes the separators. Hashing an empty component means accepting
an identity field that contains nothing. Refusing is safer. Covered by vectors `rj-03` and `rj-04`.

### 2.4 Normalisation error codes

Both reference implementations use the same tags, and the rejection vectors name them:

| Tag | Meaning |
| --- | --- |
| `<field>/E_EMPTY` | empty after normalisation (N4) or after separator removal (N5b/N6b) |
| `<field>/E_NUL` | contains `U+0000` (N4) |

`<field>` ∈ `name`, `national_id`, `emergency_contact`, `salt`. The evaluation order is
`name` → `national_id` → `emergency_contact`, so an input that is wrong in two fields reports the
first.

---

## 3. `participant_hash`

### 3.1 The preimage

```
preimage =
      utf8(norm_name(name))                   || 0x00
   || utf8(norm_id(national_id))              || 0x00
   || utf8(norm_contact(emergency_contact))   || 0x00
   || salt                                            // 32 raw bytes

participant_hash = SHA-256(preimage)                  // 32 bytes
```

**Exactly three `0x00` separators. No separator after the salt.** The salt is always 32 bytes, so
its position is unambiguous without an extra marker.

### 3.2 Why separators are enough, without length prefixes

This is why N4 exists. A "join with a separator" encoding is only injective when the separator
**cannot appear inside a component**. N4 rejects any field containing `U+0000`, and UTF-8 has the
property that the only way the byte `0x00` appears in valid UTF-8 is as the encoding of `U+0000`
itself (multi-byte continuation bytes are always `0x80..0xBF`, leading bytes always `0xC2..0xF4`).
So after N4, **`0x00` can never appear inside `utf8(norm_*(...))`**, and reading the preimage left
to right has exactly one interpretation: cut at the first, second and third `0x00`; the remaining
32 bytes are the salt.

Without N4, an attacker could put `U+0000` inside a name and move the field boundaries — two
different people producing an identical preimage. That is why **length prefixes are not needed**,
and must not be added quietly (doing so would change every hash).

### 3.3 The salt

- **Exactly 32 bytes** from a CSPRNG (`crypto.randomBytes(32)` in Node, `getrandom` in Rust),
  **one per record** — not per user, not per event.
- Generated by the **backend**, stored by the backend, and **shown once** to the runner (so a runner
  can prove their own record later without depending on the backend).
- Rendered in JSON and the API as **64 lowercase hex characters**. What goes into SHA-256 is the 32
  raw bytes. Hashing the hex text is a classic bug and produces a completely wrong hash.
- The salt **never** goes on chain. What goes on chain is only `participant_hash`.

### 3.4 A byte-level example (vector `ph-01-ascii-plain`)

The input:

| Field | Raw value |
| --- | --- |
| `name` | `Budi Santoso` |
| `national_id` | `3174012509900001` |
| `emergency_contact` | `+6281234567890` |
| `salt` (hex) | `a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e` |

All of it is already ASCII and already tidy, so normalisation here is the identity — this vector
deliberately pins **the concatenation and its SHA-256**, not the normalisation.

The preimage, broken up by part (**77 bytes** in total):

```
  4275646920 53616e746f736f    "Budi Santoso"                    12 bytes
  00                           separator #1                       1 byte
  33313734303132353039393030303031
                               "3174012509900001"                16 bytes
  00                           separator #2                       1 byte
  2b3632383132333435363738 3930  "+6281234567890"                14 bytes
  00                           separator #3                       1 byte
  a3f1c0d5e7b249168a0c4f2d9e6b8135
  c7a2049fbe31d68075c4e9a1b2f3d40e
                               salt (32 RAW bytes)               32 bytes
                                                                 -------
                                                                 77 bytes
```

The whole preimage:

```
427564692053616e746f736f0033313734303132353039393030303031002b36323831323334353637383930\
00a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e
```

Its SHA-256:

```
11b4bbdb068b470aa79124846c6684b70ad0e5d7b5f7d74fe88cdc9fafdec8fe
```

Those are the 32 bytes sent as a `BytesN<32>` to `RaceRecord.enter`, and the ones `RaceRecord.verify`
accepts.

Check it yourself with no dependencies at all:

```bash
printf 'Budi Santoso\0003174012509900001\0+6281234567890\0' > /tmp/p.bin
printf 'a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e' \
  | xxd -r -p >> /tmp/p.bin
wc -c < /tmp/p.bin        # 77
shasum -a 256 /tmp/p.bin  # 11b4bbdb068b470aa79124846c6684b70ad0e5d7b5f7d74fe88cdc9fafdec8fe
```

### 3.5 A normalisation example (vector `ph-04-messy-whitespace`)

How a messy form submission becomes clean fields:

| Field | Raw (Unicode-escaped) | Normalised |
| --- | --- | --- |
| `name` | `"  Siti\u00a0 Aminah   binti\u0009Rahman\u000a"` | `Siti Aminah binti Rahman` |
| `national_id` | `" a1-2345 6789-0b "` | `A1234567890B` |
| `emergency_contact` | `" +62 (812) 3456-7890 "` | `+6281234567890` |

Note: NBSP + space becomes **one** space (N3), the TAB also becomes one space, the trailing LF is
trimmed (N2), the hyphens and spaces vanish from the national ID and its letters are uppercased (N5),
and the brackets and hyphens vanish from the phone number while the leading `+` stays (N6). Its hash:
`feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29`.

### 3.6 NFC: one person, one hash

Vectors `ph-02` and `ph-03` are **the same person** with different Unicode spellings:

| Vector | Name (escaped) | Form |
| --- | --- | --- |
| `ph-02-nfc-precomposed` | `"Jos\u00e9 Nu\u00f1ez Wijaya"` | precomposed (`\u00e9`, `\u00f1`) |
| `ph-03-nfc-decomposed` | `"Jose\u0301 Nun\u0303ez Wijaya"` | decomposed (`e`+`\u0301`, `n`+`\u0303`) |

Both **must** produce an identical preimage and hash:

```
f5f43fc590b0edfbdf7a7b9c8c0751fa9c69329fec716b64afbd829962293f95
```

If your implementation makes them differ, **step N1 (NFC) is wrong, not the vector.** This is not a
theoretical case: macOS keyboards and some IMEs produce the decomposed form, while Windows and most
databases store precomposed. A runner registers on one device and is verified on another.

Node and Rust have been shown to agree here empirically (rather than assumed):
`String.prototype.normalize('NFC')` and `unicode-normalization` produce the same hash on this vector,
and `bash docs/specs/verify.sh` runs both every time.

### 3.7 A different salt means a different hash

`ph-05-salt-only-differs` is byte-for-byte identical to `ph-01` except for its salt, and its hash is
`4799814afd98d8cccb1db3f9cd395adc6527fdcb1d3df7a48407f62ef27ab15b` — entirely different. This is
what makes two records belonging to the same person at two events **impossible to link** from
on-chain data alone.

---

## 4. TOTP for check-in

The narrative design is in `docs/SYSTEM_DESIGN.md` §7. This section is the mechanical definition.

### 4.1 The secret

- **Exactly 32 bytes** from a CSPRNG, **one per record**.
- Generated by the backend at entry, sent **once** to the runner's device (stored in the QR pass
  PWA) and kept server-side for the scanner's roster bundle.
- Rendered in JSON and the roster bundle as **64 lowercase hex characters**; the HMAC uses its
  **raw bytes**.
- **Never on chain**, and **never in the QR** — what goes in the QR is only its per-time-step
  output.

### 4.2 Deriving the code

| # | Step |
| --- | --- |
| T1 | `time_step = floor(unix_seconds / 30)`, unsigned 64-bit. Use UTC epoch seconds, not milliseconds. |
| T2 | `counter_bytes` = `time_step` as **8 big-endian bytes**. |
| T3 | `mac = HMAC-SHA-256(key = totp_secret (32 raw bytes), msg = counter_bytes)` → 32 bytes. |
| T4 | `offset = mac[mac.len() - 1] & 0x0F` (for SHA-256: `mac[31]`). |
| T5 | `bin = ((mac[offset] & 0x7F) << 24) \| (mac[offset+1] << 16) \| (mac[offset+2] << 8) \| mac[offset+3]` |
| T6 | `code = (bin % 1_000_000)` rendered as a **6-character string, left-padded with `'0'`**. |

T4/T5 are RFC 4226 §5.3's *dynamic truncation*, applied to a 32-byte MAC (the original RFC uses a
20-byte HMAC-SHA-1; we use SHA-256, so `offset` comes from the last byte of the 32-byte MAC).

Masking the first byte with `& 0x7F` discards the sign bit so the result does not depend on how a
language treats signed integers.

### 4.3 A byte-level example (vector `tp-02-leading-zero`)

```
totp_secret (hex) 4d7b1e93a05c26f8d3407e91b6c258aa0f31d74e69b2085c1a3f6d904e7c2b15
unix_seconds      1772103330
T1 time_step      1772103330 / 30 = 59070111
T2 counter_bytes  000000000385569f
T3 mac            964f65de7c6f03add381f2203be56c75caae12bf048ff3bb1e61b9de127b02e2
T4 mac[31] = 0xe2, 0xe2 & 0x0f = 2                      -> offset = 2
T5 mac[2..6] = 65 de 7c 6f
     ((0x65 & 0x7f) << 24) | (0xde << 16) | (0x7c << 8) | 0x6f
   = 0x65de7c6f = 1709079663
T6 1709079663 % 1000000 = 79663      -> "079663"   <-- SIX characters, leading zero
```

Its QR payload:

```json
{"t":7,"s":59070111,"c":"079663"}
```

### 4.4 The leading zero is SIGNIFICANT (read this twice)

**This is the most common TOTP implementation bug.** The `bin % 1_000_000` above yields `79663` —
five digits. The code is **`"079663"`**, six characters. If a code is stored, transmitted or compared
as an **integer**, the leading zero disappears, and:

- the runner shows `79663` while the scanner computes `079663` → **every scan fails**, and only for
  ~10% of runners (the ones whose code happens to start with a zero). A bug like this survives manual
  testing and detonates on race day.
- the manual fallback breaks too: the runner reads out five digits, the volunteer types five digits.

The rules, without exception:

1. `code` is **always** a 6-character string. Left-pad with `'0'` (`String(n).padStart(6,'0')`,
   `format!("{:06}", n)`).
2. In the QR payload, `c` is a **JSON string** (`"079663"`), **never** a JSON number.
3. Comparison is **string against string**, not number against number.
4. A presented code has its shape validated first: it must be **exactly 6 ASCII digits**. A
   5-character code is rejected as *malformed*, not merely "wrong".

Two vectors guard this: `tp-02-leading-zero` (whose code is `079663`) and
`vf-08-five-digit-code-rejected` (presenting `79663` at the correct time step → **rejected**).

### 4.5 Verification + clock tolerance

A `presented` code is **accepted if and only if** it equals the code computed for `time_step - 1`,
`time_step`, or `time_step + 1` — a window of up to **90 seconds**.

```
verify(secret, now, presented):
    if presented is not exactly 6 ASCII digits: return false
    step = floor(now / 30)
    ok = false
    for d in [-1, 0, +1]:
        ok |= constant_time_eq(code_at_step(secret, step + d), presented)   # no short-circuit
    return ok
```

Two requirements:

- **Compare in constant time.** Node: `crypto.timingSafeEqual` (check the length first — a length is
  not a secret). Rust: accumulate `diff |= a[i] ^ b[i]` and compare once. Do not use a plain `==` on
  the strings.
- **Do not short-circuit in the loop.** Use `|=`, not `||`/`or else`, so that the time taken to
  accept does not leak which step matched.

The vectors guarding this window:

| Vector | Code from step | Verified at step | Result |
| --- | ---: | ---: | --- |
| `vf-01-same-step` | 59070000 | 59070000 | **accepted** |
| `vf-02-previous-step` | 59069999 | 59070000 | **accepted** (the runner's clock is ~30s slow) |
| `vf-03-next-step` | 59070001 | 59070000 | **accepted** (the runner's clock is ~30s fast) |
| `vf-04-two-steps-old-rejected` | 59069998 | 59070000 | **rejected** (60s stale) |
| `vf-05-two-steps-ahead-rejected` | 59070002 | 59070000 | **rejected** |
| `vf-06-leading-zero-roundtrip` | 59070111 | 59070111 | **accepted** (code `079663`) |
| `vf-07-wrong-code-rejected` | — | 59070000 | **rejected** (`000000`) |
| `vf-08-five-digit-code-rejected` | — | 59070111 | **rejected** (`79663`, malformed) |

A clock more than 90 seconds out will refuse scans that are genuinely valid. That is an acknowledged
risk (`SYSTEM_DESIGN.md` §11, point 11); the mitigation is a "clock sanity" banner in the scanner PWA
plus the manual fallback.

---

## 5. The QR payload

```json
{"t":<token_id>,"s":<time_step>,"c":"<6-character code>"}
```

**Exactly three keys, in that order, with no spaces at all.** Real examples from the vectors:

```
{"t":1,"s":59070000,"c":"911070"}
{"t":7,"s":59070111,"c":"079663"}
{"t":4242,"s":59072879,"c":"844761"}
```

| Key | Type | Contents |
| --- | --- | --- |
| `t` | JSON number (`u32`) | the record's `token_id` (from `RaceRecord.enter`) |
| `s` | JSON number (`u64`) | the `time_step` the code was made for |
| `c` | **JSON string** | the 6-character code, leading zero preserved |

**Why `s` may be an ordinary number.** JSON numbers are safe up to `2^53 - 1` (≈ 9.007 × 10^15).
`time_step` today is ≈ 5.9 × 10^7 and rises by about 1.05 million a year, so that limit is hundreds
of millions of years away. No string needed, no BigInt needed.

**Why `c` must be a string.** See §4.4. That is the only reason this ordering/typing rule is written
out in such detail.

**The manual fallback** for when the camera fails (a cracked screen, a dirty lens, a QR too dim): the
runner reads out the **6 digits of `c`** and the volunteer types those six digits plus the **bib
number**. The bib number replaces `t`, and `s` comes from the scanner's own clock — which is exactly
why the ±1 step tolerance exists. This flow is required in the scanner PWA (STE-22): the camera is
not the only path.

---

## 6. Security notes (from `SYSTEM_DESIGN.md` §7 and §11)

1. **A hash is a commitment, not encryption.** `participant_hash` does not hide PII in any
   cryptographic sense. It only lets anyone who **already** has the plaintext + salt prove that this
   record belongs to that person. It does not let anyone read PII off the chain.
2. **Its security rests entirely on the salt staying secret and random.** A national ID is
   **low-entropy** — its guess space is small and structured (region code + date of birth +
   sequence number). Without a salt, anyone could brute-force name+ID against an on-chain hash
   trivially. A random 32-byte salt per record is what closes that. Hence: the salt never enters a
   QR, never enters a log, never enters the chain.
3. **A leaked backend is leaked PII.** The PII vault is an ordinary Web2 database with ordinary Web2
   obligations (encryption at rest, access control, auditing). The chain does not help here, and does
   not pretend to.
4. **A forwarded screenshot fails because the time step moves.** A screenshot freezes one 30-second
   code. By the time the image reaches someone else through a group chat, `time_step` is outside the
   ±1 tolerance and the HMAC no longer matches (exactly case `vf-04`). An attacker would need the
   `totp_secret` itself, which never appears in a QR — only its per-step output does.
5. **A leaked roster is still bounded by the chain.** The scanner PWA holds the secrets for a whole
   roster so it can verify offline. A leaked roster lets someone produce valid codes — but the damage
   is still bounded: only allowlisted scanner addresses may `claim_racepack`, and it is still **one
   pack per record**.
6. **The real arbiter is the on-chain `state == Entered` guard.** The desk's local roster check is a
   UX optimisation. Two offline desks can both approve the same runner; both queue transactions, and
   the chain accepts **exactly one** — the second gets `AlreadyClaimed(102)` for the organiser to
   reconcile. The "one pack per entry" invariant is enforced by consensus, not by volunteer
   discipline.
7. **Physical impersonation is still possible.** A runner can hand their phone and race pack to a
   friend. Sterun makes the **record** honest (the chain still records who entered, and the organiser
   has a hash for spot-checking identity); Sterun does not put marshals on the course. This has to be
   stated plainly in organiser material.
8. **The right to erasure vs an immutable hash** is still open (`SYSTEM_DESIGN.md` §11, point 2). A
   hash alone identifies nobody, but the legal reading in our jurisdiction needs checking before
   mainnet.

---

## 7. Running the vectors

```bash
bash docs/specs/verify.sh
```

This runs **two separately written implementations** against the same JSON files:

- **Node** — `docs/specs/reference/node/verify-vectors.mjs`, using only `node:crypto`, with **zero
  npm dependencies**. Do not add anything to the pnpm workspace for it.
- **Rust** — `docs/specs/reference/rust/`, a standalone crate (with its own `[workspace]`, **not** a
  member of the `sc/` workspace), with `=`-pinned dependencies: `sha2 =0.10.9`, `hmac =0.12.1`,
  `unicode-normalization =0.1.25`, `serde_json =1.0.151` (dev).

STE-10's acceptance criterion is that **both produce identical output**. One implementation passing
its own tests proves nothing; two independent implementations agreeing proves the specification is
genuinely unambiguous.

On top of that, **the Soroban host itself is tested for agreement**: the tests
`host_sha256_matches_every_participant_hash_vector` and
`every_participant_hash_vector_is_accepted_by_enter_and_verify` in
`sc/contracts/race_record/src/test.rs` read the same
`docs/specs/vectors/participant_hash.json` file, run its preimages through
`env.crypto().sha256()`, and feed the results into `enter` + `verify`. So the value the backend
computes really is the value the chain accepts.

---

## 8. The rules for changing this

Once this STE-10 PR is merged, **every** change to the definition of `participant_hash` (including
its normalisation steps), to the TOTP derivation, or to the QR payload serialisation requires:

1. **A new PR** approved by **Axel (PM) + fable (AI co-PM)**. No self-merges.
2. **An entry in `docs/specs/CHANGELOG.md`**: the new version, the date, the reason, and its impact
   on existing data.
3. **`bash docs/specs/verify.sh` staying green** and **`cd sc && cargo test` staying green**.
4. Any existing vector whose value changes must be called out **explicitly** in the changelog.
   Vectors are frozen artefacts — never regenerate them quietly to make a test pass.
5. If the change touches a contract signature or an error code, follow the rules in
   `docs/specs/INTERFACE.md` §7 as well (including **regenerating the TS bindings**, STE-14).

A change to the hash definition **invalidates every `participant_hash` already on chain** (old
records could not be re-verified under the new rules). So a hash change is not a patch — it is at
minimum a **major version** plus a written migration plan.

---

## 9. Who consumes this

| Ticket | Component | What it uses |
| --- | --- | --- |
| STE-11 | PII vault + backend salt/secret (James) | §2, §3, §4.1 — computing `participant_hash`, storing the salt + `totp_secret` |
| STE-14 | TS bindings (Axel) | the `BytesN<32>` type for `participant_hash` |
| STE-15 | `SterunClient` (James) | `enter(participant_hash)`, `verify(token_id, participant_hash)` |
| STE-16 | Indexer (James) | indirectly — `participant_hash` arrives through `record_of` |
| STE-17 | Organiser console (Ancung) | identity verification by recomputing the hash |
| STE-18 | QR pass PWA (Ancung) | §4, §5 — computing codes offline, rendering the QR payload |
| STE-21 / STE-22 | Scanner PWA + TOTP verify (Ancung) | §4.5, §5 — ±1 step verification, the manual fallback |
