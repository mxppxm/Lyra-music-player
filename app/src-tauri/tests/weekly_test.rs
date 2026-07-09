use std::fs;
use lyra_lib::weekly;

#[test]
fn write_weekly_html_creates_parent_dirs() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let sub = tmp.path().join("nested/deep");
    let target = sub.join("2026-07-02_to_2026-07-09.html");
    weekly::write_weekly_html_impl(target.to_string_lossy().into(), "<html>hi</html>".into())
        .expect("write ok");
    let read = fs::read_to_string(&target).expect("read");
    assert_eq!(read, "<html>hi</html>");
}

#[test]
fn write_weekly_html_is_atomic_no_tmp_left() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("a.html");
    weekly::write_weekly_html_impl(target.to_string_lossy().into(), "x".into()).unwrap();
    let entries: Vec<_> = fs::read_dir(tmp.path()).unwrap().filter_map(Result::ok).collect();
    assert_eq!(entries.len(), 1, "only final file should remain, no .tmp");
    assert_eq!(entries[0].file_name().to_string_lossy(), "a.html");
}

#[test]
fn write_weekly_html_overwrites_existing_file() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("a.html");
    fs::write(&target, "old").unwrap();
    weekly::write_weekly_html_impl(target.to_string_lossy().into(), "new".into()).unwrap();
    assert_eq!(fs::read_to_string(&target).unwrap(), "new");
}

#[test]
fn path_exists_impl_returns_true_for_existing_file() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("a.html");
    fs::write(&target, "x").unwrap();
    assert!(weekly::path_exists_impl(target.to_string_lossy().into()).unwrap());
}

#[test]
fn path_exists_impl_returns_false_for_missing_file() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("nope.html");
    assert!(!weekly::path_exists_impl(target.to_string_lossy().into()).unwrap());
}
