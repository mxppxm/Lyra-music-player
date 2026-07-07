use lyra_lib::audio_features::{extract, AudioFeatures};
use std::path::PathBuf;

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

#[test]
fn extract_returns_features_from_silence_fixture() {
    let f: AudioFeatures = extract(&fixture("silence_1s.wav")).expect("extract");
    // Silence should measure near-zero energy.
    assert!(f.energy <= 0.01, "expected ~0 energy, got {}", f.energy);
    // Centroid of pure silence is 0.0 by construction.
    assert!(f.valence >= 0.0 && f.valence <= 1.0);
    // Duration parsing from header should give something non-zero.
    assert!(f.duration_ms > 0, "expected non-zero duration_ms");
}

#[test]
fn extract_missing_file_returns_error() {
    let e = extract(&PathBuf::from("/does/not/exist.wav"));
    assert!(e.is_err());
}
