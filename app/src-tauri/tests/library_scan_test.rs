use lyra_lib::library_scan::scan_directory;
use std::path::PathBuf;

fn fixture_lib() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures/lib");
    p
}

#[test]
fn scan_finds_wav_files() {
    let results = scan_directory(&fixture_lib()).expect("scan should succeed");
    assert!(results.iter().any(|t| t.path.ends_with(".wav")));
}

#[test]
fn scan_returns_absolute_paths() {
    let results = scan_directory(&fixture_lib()).expect("scan should succeed");
    for t in &results {
        let p = std::path::Path::new(&t.path);
        assert!(p.is_absolute(), "path {} is not absolute", t.path);
    }
}

#[test]
fn scan_ignores_non_audio_extensions() {
    let mut txt = fixture_lib();
    txt.push("readme.txt");
    std::fs::write(&txt, "not audio").ok();
    let results = scan_directory(&fixture_lib()).expect("scan");
    assert!(!results.iter().any(|t| t.path.ends_with(".txt")));
    std::fs::remove_file(&txt).ok();
}

#[test]
fn scan_missing_dir_returns_error() {
    let res = scan_directory(&PathBuf::from("/nonexistent/xyz"));
    assert!(res.is_err());
}
