use lyra_lib::audio::AudioPlayer;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

#[test]
fn create_player_ok() {
    let _p = AudioPlayer::new().expect("new should succeed");
}

#[test]
fn play_file_starts_playback() {
    let p = AudioPlayer::new().unwrap();
    p.play_file(&fixture("silence_1s.wav")).expect("play should succeed");
    assert!(p.is_playing());
}

#[test]
fn stop_ends_playback() {
    let p = AudioPlayer::new().unwrap();
    p.play_file(&fixture("silence_1s.wav")).unwrap();
    p.stop();
    // small wait for internal cleanup
    sleep(Duration::from_millis(50));
    assert!(!p.is_playing());
}

#[test]
fn play_missing_file_returns_error() {
    let p = AudioPlayer::new().unwrap();
    let err = p.play_file(&PathBuf::from("/nonexistent.wav"));
    assert!(err.is_err());
}
