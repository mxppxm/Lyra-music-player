use lyra_lib::secrets;

// keyring test uses the mock keyring in tests (feature default in v3);
// on macOS CI this may fall through to the real Keychain; scope test keys
// with a random suffix to avoid pollution.

fn tkey(name: &str) -> String {
    format!("lyra-test-{}-{}", name, std::process::id())
}

#[test]
fn set_get_roundtrip() {
    let k = tkey("k1");
    secrets::set_secret(&k, "v1").unwrap();
    assert_eq!(secrets::get_secret(&k).unwrap().as_deref(), Some("v1"));
    secrets::delete_secret(&k).unwrap();
}

#[test]
fn get_missing_returns_none() {
    let k = tkey("does-not-exist");
    assert_eq!(secrets::get_secret(&k).unwrap(), None);
}

#[test]
fn delete_missing_is_ok() {
    let k = tkey("also-missing");
    secrets::delete_secret(&k).unwrap();
}
