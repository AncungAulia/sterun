// SPDX-License-Identifier: Apache-2.0
//! Sterun C4 (STE-10) — reference implementation #2 of `participant_hash` + TOTP.
//!
//! Written independently of `docs/specs/reference/node/verify-vectors.mjs` and
//! run against the same JSON vectors in `docs/specs/vectors/`. STE-10's
//! acceptance criterion is that the two agree byte for byte;
//! `docs/specs/verify.sh` runs both.
//!
//! The normative spec is `docs/specs/HASH_AND_TOTP.md`. This crate is an
//! executable copy of it — if they disagree, the doc plus the vectors win and
//! this crate is the bug.
//!
//! This crate is **standalone on purpose**: it declares its own `[workspace]`
//! and is not a member of the contract workspace in `sc/`. Its dependency set
//! (`sha2`, `hmac`, `unicode-normalization`) must never leak into a contract
//! build.

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

// ---------------------------------------------------------------------------
// Unicode whitespace — an EXPLICIT set, deliberately not `char::is_whitespace`
//
// ECMAScript's WhiteSpace production and Rust's `char::is_whitespace()` are NOT
// the same set: JS counts U+FEFF (ZWNBSP) and does not count U+0085 (NEL);
// Rust follows Unicode `White_Space=Yes`, which is the exact opposite on both
// code points. A spec that said "Unicode whitespace" and leaned on each
// language's built-in would hash the same input two different ways. So the set
// is written out, once, and both reference implementations hard-code it.
//
// This is Unicode `White_Space=Yes` — 25 code points, unchanged since Unicode
// 4.1. `tests/vectors.rs::whitespace_table_equals_unicode_white_space` proves
// this table equals `char::is_whitespace()` over the whole scalar range, which
// is what pins the table to a real Unicode property rather than to a guess.
// ---------------------------------------------------------------------------

/// Unicode `White_Space=Yes`.
pub const WHITESPACE: [char; 25] = [
    '\u{0009}', '\u{000a}', '\u{000b}', '\u{000c}', '\u{000d}', // TAB LF VT FF CR
    '\u{0020}', // SPACE
    '\u{0085}', // NEL
    '\u{00a0}', // NO-BREAK SPACE
    '\u{1680}', // OGHAM SPACE MARK
    '\u{2000}', '\u{2001}', '\u{2002}', '\u{2003}', '\u{2004}', '\u{2005}', '\u{2006}', '\u{2007}',
    '\u{2008}', '\u{2009}', '\u{200a}', // EN QUAD .. HAIR SPACE
    '\u{2028}', // LINE SEPARATOR
    '\u{2029}', // PARAGRAPH SEPARATOR
    '\u{202f}', // NARROW NO-BREAK SPACE
    '\u{205f}', // MEDIUM MATHEMATICAL SPACE
    '\u{3000}', // IDEOGRAPHIC SPACE
];

/// `true` iff `c` is in [`WHITESPACE`].
pub fn is_ws(c: char) -> bool {
    WHITESPACE.contains(&c)
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Which input field a rejection came from. The vectors name these verbatim.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Name,
    NationalId,
    EmergencyContact,
    Salt,
}

impl Field {
    pub fn as_str(self) -> &'static str {
        match self {
            Field::Name => "name",
            Field::NationalId => "national_id",
            Field::EmergencyContact => "emergency_contact",
            Field::Salt => "salt",
        }
    }
}

/// Why an input must never be hashed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrCode {
    /// Nothing left after normalization.
    Empty,
    /// Contains U+0000, which is the separator byte.
    Nul,
}

impl ErrCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrCode::Empty => "E_EMPTY",
            ErrCode::Nul => "E_NUL",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NormError {
    pub field: Field,
    pub code: ErrCode,
}

impl NormError {
    fn new(field: Field, code: ErrCode) -> Self {
        Self { field, code }
    }

    /// `"<field>/<code>"`, the shape the vector runner compares.
    pub fn tag(self) -> String {
        format!("{}/{}", self.field.as_str(), self.code.as_str())
    }
}

impl core::fmt::Display for NormError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.tag())
    }
}

impl std::error::Error for NormError {}

// ---------------------------------------------------------------------------
// Normalization (HASH_AND_TOTP.md §2)
// ---------------------------------------------------------------------------

/// N1 NFC · N2 trim · N3 collapse internal whitespace runs to one U+0020 ·
/// N4 reject empty or U+0000.
pub fn norm_base(s: &str, field: Field) -> Result<String, NormError> {
    let nfc: Vec<char> = s.nfc().collect();

    let start = nfc.iter().position(|c| !is_ws(*c)).unwrap_or(nfc.len());
    let end = nfc
        .iter()
        .rposition(|c| !is_ws(*c))
        .map_or(start, |i| i + 1);

    let mut out = String::new();
    let mut pending_space = false;
    let mut saw_nul = false;
    for &c in &nfc[start..end] {
        if is_ws(c) {
            pending_space = true;
            continue;
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        if c == '\u{0000}' {
            saw_nul = true;
        }
        out.push(c);
    }

    if out.is_empty() {
        return Err(NormError::new(field, ErrCode::Empty));
    }
    if saw_nul {
        return Err(NormError::new(field, ErrCode::Nul));
    }
    Ok(out)
}

/// Names keep their case — a person's name is not a lookup key.
pub fn norm_name(s: &str) -> Result<String, NormError> {
    norm_base(s, Field::Name)
}

/// N5: strip whitespace and ASCII hyphen-minus, then ASCII-uppercase.
pub fn norm_id(s: &str) -> Result<String, NormError> {
    let base = norm_base(s, Field::NationalId)?;
    let out: String = base
        .chars()
        .filter(|c| !is_ws(*c) && *c != '-')
        // ASCII-only uppercasing: never `to_uppercase()`, which is
        // Unicode-full and would fold e.g. sharp s to SS.
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if out.is_empty() {
        return Err(NormError::new(Field::NationalId, ErrCode::Empty));
    }
    Ok(out)
}

/// N6: strip whitespace and `-`, `(`, `)`. A leading `+` is preserved.
pub fn norm_contact(s: &str) -> Result<String, NormError> {
    let base = norm_base(s, Field::EmergencyContact)?;
    let out: String = base
        .chars()
        .filter(|c| !is_ws(*c) && *c != '-' && *c != '(' && *c != ')')
        .collect();
    if out.is_empty() {
        return Err(NormError::new(Field::EmergencyContact, ErrCode::Empty));
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// participant_hash (HASH_AND_TOTP.md §3)
// ---------------------------------------------------------------------------

/// Exactly 32 raw bytes of CSPRNG output, one per record.
pub const SALT_LEN: usize = 32;

/// `utf8(norm_name) 0x00 utf8(norm_id) 0x00 utf8(norm_contact) 0x00 salt`
///
/// Exactly three separators; none after the salt. N4 guarantees no normalized
/// field can contain 0x00, so the encoding is injective without length
/// prefixes.
pub fn participant_preimage(
    name: &str,
    national_id: &str,
    emergency_contact: &str,
    salt: &[u8],
) -> Result<Vec<u8>, NormError> {
    if salt.len() != SALT_LEN {
        return Err(NormError::new(Field::Salt, ErrCode::Empty));
    }
    let name = norm_name(name)?;
    let id = norm_id(national_id)?;
    let contact = norm_contact(emergency_contact)?;

    let mut out = Vec::with_capacity(name.len() + id.len() + contact.len() + 3 + SALT_LEN);
    out.extend_from_slice(name.as_bytes());
    out.push(0x00);
    out.extend_from_slice(id.as_bytes());
    out.push(0x00);
    out.extend_from_slice(contact.as_bytes());
    out.push(0x00);
    out.extend_from_slice(salt);
    Ok(out)
}

/// SHA-256 of the preimage: the 32 bytes that go on-chain as `BytesN<32>`.
pub fn participant_hash(
    name: &str,
    national_id: &str,
    emergency_contact: &str,
    salt: &[u8],
) -> Result<[u8; 32], NormError> {
    let preimage = participant_preimage(name, national_id, emergency_contact, salt)?;
    Ok(sha256(&preimage))
}

pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().into()
}

// ---------------------------------------------------------------------------
// TOTP (HASH_AND_TOTP.md §4)
// ---------------------------------------------------------------------------

pub const TIME_STEP_SECONDS: u64 = 30;
pub const DIGITS: usize = 6;
pub const TOLERANCE_STEPS: i64 = 1;
pub const SECRET_LEN: usize = 32;

/// `floor(unix_seconds / 30)`, unsigned 64-bit.
pub fn time_step(unix_seconds: u64) -> u64 {
    unix_seconds / TIME_STEP_SECONDS
}

/// The counter as 8 big-endian bytes.
pub fn counter_bytes(step: u64) -> [u8; 8] {
    step.to_be_bytes()
}

/// RFC 4226 §5.3 dynamic truncation over a 32-byte HMAC-SHA-256 MAC, mod 10^6,
/// rendered as a 6-character string left-padded with `'0'`.
///
/// The return type is `String`, never an integer: `042315` parsed as a number
/// is `42315`, and that lost leading zero is the classic implementation bug.
pub fn code_at_step(secret: &[u8], step: u64) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC takes a key of any length");
    mac.update(&counter_bytes(step));
    let mac = mac.finalize().into_bytes();

    let offset = (mac[mac.len() - 1] & 0x0f) as usize;
    let bin = ((mac[offset] & 0x7f) as u32) << 24
        | (mac[offset + 1] as u32) << 16
        | (mac[offset + 2] as u32) << 8
        | (mac[offset + 3] as u32);
    format!("{:0width$}", bin % 1_000_000, width = DIGITS)
}

pub fn code_at(secret: &[u8], unix_seconds: u64) -> String {
    code_at_step(secret, time_step(unix_seconds))
}

fn is_six_digits(code: &str) -> bool {
    code.len() == DIGITS && code.bytes().all(|b| b.is_ascii_digit())
}

/// Constant-time equality over two 6-character ASCII codes.
fn codes_equal(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false; // length is public, not a secret
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    std::hint::black_box(diff) == 0
}

/// Accept iff `presented` equals the code for `time_step-1`, `time_step` or
/// `time_step+1` (a window of up to 90 seconds). Every candidate is compared
/// with no early exit, so acceptance timing does not leak which step matched.
pub fn verify_code(secret: &[u8], unix_seconds: u64, presented: &str) -> bool {
    if !is_six_digits(presented) {
        return false;
    }
    let step = time_step(unix_seconds);
    let mut ok = false;
    for delta in -TOLERANCE_STEPS..=TOLERANCE_STEPS {
        let Some(candidate) = step.checked_add_signed(delta) else {
            continue;
        };
        // `|=`, not `||`: no short circuit, so every step costs the same.
        ok |= codes_equal(&code_at_step(secret, candidate), presented);
    }
    ok
}

/// Compact QR payload: exactly three keys, this order, no whitespace.
///
/// `c` is a JSON **string**. That is the whole reason a leading zero survives
/// the trip from the runner's phone to the scanner.
pub fn qr_payload(token_id: u32, step: u64, code: &str) -> String {
    assert!(
        is_six_digits(code),
        "code must be 6 ASCII digits, got {code:?}"
    );
    format!("{{\"t\":{token_id},\"s\":{step},\"c\":\"{code}\"}}")
}

// ---------------------------------------------------------------------------
// Hex helpers (lowercase, no prefix)
// ---------------------------------------------------------------------------

pub fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(char::from_digit((b >> 4) as u32, 16).unwrap());
        out.push(char::from_digit((b & 0x0f) as u32, 16).unwrap());
    }
    out
}

pub fn from_hex(hex: &str) -> Result<Vec<u8>, String> {
    if !hex.len().is_multiple_of(2) {
        return Err(format!("odd-length hex: {hex}"));
    }
    let bytes = hex.as_bytes();
    let mut out = Vec::with_capacity(hex.len() / 2);
    for pair in bytes.chunks(2) {
        let hi = decode_nibble(pair[0])?;
        let lo = decode_nibble(pair[1])?;
        out.push(hi << 4 | lo);
    }
    Ok(out)
}

fn decode_nibble(b: u8) -> Result<u8, String> {
    match b {
        b'0'..=b'9' => Ok(b - b'0'),
        // Lowercase only: the spec renders hex lowercase, and accepting
        // uppercase here would hide a producer that does not.
        b'a'..=b'f' => Ok(b - b'a' + 10),
        _ => Err(format!("not lowercase hex: {:?}", b as char)),
    }
}
