// SPDX-License-Identifier: Apache-2.0
//! Runs `docs/specs/vectors/*.json` through the Rust reference implementation.
//!
//! These are the SAME files the Node reference reads. Nothing here restates an
//! expected value: every hash, code and payload comes out of the JSON, so the
//! two implementations can only both pass by genuinely agreeing.

use std::{fs, path::PathBuf};

use serde_json::Value;
use sterun_spec_reference::{
    code_at_step, counter_bytes, from_hex, is_ws, norm_contact, norm_id, norm_name,
    participant_preimage, qr_payload, sha256, time_step, to_hex, verify_code, WHITESPACE,
};

fn vector_dir() -> PathBuf {
    // CARGO_MANIFEST_DIR = docs/specs/reference/rust
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../vectors")
        .canonicalize()
        .expect("docs/specs/vectors must exist next to the reference implementations")
}

fn load(file: &str) -> Value {
    let path = vector_dir().join(file);
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {path:?}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path:?} is not valid JSON: {e}"))
}

fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing string field {key:?} in {v}"))
        .to_string()
}

fn u(v: &Value, key: &str) -> u64 {
    v.get(key)
        .and_then(Value::as_u64)
        .unwrap_or_else(|| panic!("missing integer field {key:?} in {v}"))
}

// ---------------------------------------------------------------------------
// participant_hash
// ---------------------------------------------------------------------------

#[test]
fn participant_hash_vectors() {
    let doc = load("participant_hash.json");
    let vectors = doc["vectors"].as_array().expect("vectors array");
    assert!(
        vectors.len() >= 4,
        "STE-10 requires at least 4 participant_hash vectors, found {}",
        vectors.len()
    );

    for v in vectors {
        let id = s(v, "id");
        let input = &v["input"];
        let salt = from_hex(&s(input, "salt_hex")).expect("salt_hex");
        assert_eq!(salt.len(), 32, "{id}: salt must be 32 raw bytes");

        let normalized = &v["normalized"];
        assert_eq!(
            norm_name(&s(input, "name")).expect("norm_name"),
            s(normalized, "name"),
            "{id}: norm_name"
        );
        assert_eq!(
            norm_id(&s(input, "national_id")).expect("norm_id"),
            s(normalized, "national_id"),
            "{id}: norm_id"
        );
        assert_eq!(
            norm_contact(&s(input, "emergency_contact")).expect("norm_contact"),
            s(normalized, "emergency_contact"),
            "{id}: norm_contact"
        );

        let preimage = participant_preimage(
            &s(input, "name"),
            &s(input, "national_id"),
            &s(input, "emergency_contact"),
            &salt,
        )
        .expect("preimage");
        assert_eq!(to_hex(&preimage), s(v, "preimage_hex"), "{id}: preimage");
        assert_eq!(
            preimage.len() as u64,
            u(v, "preimage_len"),
            "{id}: preimage_len"
        );
        assert_eq!(
            to_hex(&sha256(&preimage)),
            s(v, "expected_hash_hex"),
            "{id}: sha256"
        );
    }
}

/// The NFC pair: precomposed and decomposed spellings of one name must land on
/// exactly one hash. If this fails, the normalization is wrong — not the vector.
#[test]
fn nfc_pairs_collide_and_salt_pairs_do_not() {
    let doc = load("participant_hash.json");
    let vectors = doc["vectors"].as_array().unwrap();
    let find = |id: &str| {
        vectors
            .iter()
            .find(|v| v["id"] == id)
            .unwrap_or_else(|| panic!("no vector {id}"))
            .clone()
    };

    let mut same_pairs = 0;
    let mut differ_pairs = 0;
    for v in vectors {
        if let Some(other_id) = v.get("same_hash_as").and_then(Value::as_str) {
            let other = find(other_id);
            assert_eq!(
                s(v, "preimage_hex"),
                s(&other, "preimage_hex"),
                "{}: NFC pair must produce the same preimage as {other_id}",
                s(v, "id")
            );
            assert_eq!(
                s(v, "expected_hash_hex"),
                s(&other, "expected_hash_hex"),
                "{}: NFC pair must produce the same hash as {other_id}",
                s(v, "id")
            );
            assert_ne!(
                s(&v["input"], "name"),
                s(&other["input"], "name"),
                "{}: the two spellings must differ as raw input, or the vector proves nothing",
                s(v, "id")
            );
            same_pairs += 1;
        }
        if let Some(other_id) = v.get("differs_from").and_then(Value::as_str) {
            let other = find(other_id);
            assert_ne!(
                s(v, "expected_hash_hex"),
                s(&other, "expected_hash_hex"),
                "{}: salt change must change the hash",
                s(v, "id")
            );
            differ_pairs += 1;
        }
    }
    assert!(same_pairs >= 1, "no NFC pair in the vectors");
    assert!(differ_pairs >= 1, "no salt-only pair in the vectors");
}

#[test]
fn rejected_inputs_are_rejected_for_the_declared_reason() {
    let doc = load("participant_hash.json");
    let rejects = doc["rejects"].as_array().expect("rejects array");
    assert!(!rejects.is_empty());

    for v in rejects {
        let id = s(v, "id");
        let input = &v["input"];
        let salt = from_hex(&s(input, "salt_hex")).expect("salt_hex");
        let err = participant_preimage(
            &s(input, "name"),
            &s(input, "national_id"),
            &s(input, "emergency_contact"),
            &salt,
        )
        .expect_err(&format!("{id} was accepted but must be rejected"));

        let expected = &v["expected_error"];
        assert_eq!(
            err.tag(),
            format!("{}/{}", s(expected, "field"), s(expected, "code")),
            "{id}: wrong rejection reason"
        );
    }
}

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

#[test]
fn totp_vectors() {
    let doc = load("totp.json");
    let vectors = doc["vectors"].as_array().expect("vectors array");
    assert!(
        vectors.len() >= 4,
        "STE-10 requires at least 4 TOTP vectors, found {}",
        vectors.len()
    );

    let mut saw_leading_zero = false;
    for v in vectors {
        let id = s(v, "id");
        let secret = from_hex(&s(v, "secret_hex")).expect("secret_hex");
        assert_eq!(secret.len(), 32, "{id}: secret must be 32 raw bytes");

        let step = time_step(u(v, "unix_seconds"));
        assert_eq!(step, u(v, "time_step"), "{id}: time_step");
        assert_eq!(
            to_hex(&counter_bytes(step)),
            s(v, "counter_bytes_hex"),
            "{id}: counter_bytes"
        );

        let code = code_at_step(&secret, step);
        assert_eq!(code, s(v, "expected_code"), "{id}: code");
        assert_eq!(code.len(), 6, "{id}: a code is always 6 characters");
        if code.starts_with('0') {
            saw_leading_zero = true;
        }

        let token_id = u32::try_from(u(v, "token_id")).expect("token_id is u32");
        assert_eq!(
            qr_payload(token_id, step, &code),
            s(v, "qr_payload"),
            "{id}: qr_payload"
        );
    }

    assert!(
        saw_leading_zero,
        "no vector with a leading-zero code — the single most common TOTP bug \
         would go uncovered"
    );
}

#[test]
fn totp_verification_window() {
    let doc = load("totp.json");
    let cases = doc["verification"].as_array().expect("verification array");
    assert!(!cases.is_empty());

    let mut accepted_adjacent = false;
    let mut rejected_two_steps = false;
    for v in cases {
        let id = s(v, "id");
        let secret = from_hex(&s(v, "secret_hex")).expect("secret_hex");
        let presented = s(v, "presented_code");
        let at = u(v, "verify_at_unix_seconds");
        let expected = v["expected_valid"].as_bool().expect("expected_valid");

        assert_eq!(
            time_step(at),
            u(v, "verify_at_time_step"),
            "{id}: verify_at_time_step"
        );
        assert_eq!(
            verify_code(&secret, at, &presented),
            expected,
            "{id}: verify"
        );

        if let Some(code_step) = v["presented_code_time_step"].as_u64() {
            let delta = code_step as i64 - time_step(at) as i64;
            if expected && delta.abs() == 1 {
                accepted_adjacent = true;
            }
            if !expected && delta.abs() == 2 {
                rejected_two_steps = true;
            }
        }
    }

    assert!(
        accepted_adjacent,
        "no vector proves the +/-1 step tolerance"
    );
    assert!(
        rejected_two_steps,
        "no vector proves a 2-step-old code is rejected"
    );
}

// ---------------------------------------------------------------------------
// The whitespace table is the one place the two languages could silently
// diverge, so it gets pinned to a real Unicode property rather than to taste.
// ---------------------------------------------------------------------------

#[test]
fn whitespace_table_equals_unicode_white_space() {
    assert_eq!(WHITESPACE.len(), 25);
    for cp in 0u32..=0x10_FFFF {
        let Some(c) = char::from_u32(cp) else {
            continue; // surrogate range
        };
        assert_eq!(
            is_ws(c),
            c.is_whitespace(),
            "U+{cp:04X}: hard-coded table disagrees with Unicode White_Space"
        );
    }
}

/// The two code points where ECMAScript and Unicode disagree, called out so a
/// future reader sees why the table is hard-coded instead of delegated.
#[test]
fn the_two_code_points_javascript_gets_wrong() {
    // U+0085 NEL: Unicode White_Space, but NOT ECMAScript WhiteSpace.
    assert!(is_ws('\u{0085}'));
    // U+FEFF ZWNBSP: ECMAScript WhiteSpace, but NOT Unicode White_Space.
    assert!(!is_ws('\u{FEFF}'));
    // U+200B ZERO WIDTH SPACE is neither, despite the name.
    assert!(!is_ws('\u{200B}'));
}
