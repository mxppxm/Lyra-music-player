use lyra_lib::secrets;
use std::path::PathBuf;

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lyra-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).ok();
    dir
}

#[test]
fn set_get_roundtrip() {
    let dir = temp_dir();
    let k = "k1_roundtrip";
    secrets::set_secret(&dir, k, "v1").unwrap();
    assert_eq!(secrets::get_secret(&dir, k).unwrap().as_deref(), Some("v1"));
    secrets::delete_secret(&dir, k).unwrap();
}

#[test]
fn get_missing_returns_none() {
    let dir = temp_dir();
    let k = "does-not-exist";
    assert_eq!(secrets::get_secret(&dir, k).unwrap(), None);
}

#[test]
fn delete_missing_is_ok() {
    let dir = temp_dir();
    let k = "also-missing";
    secrets::delete_secret(&dir, k).unwrap();
}
