use lyra_lib::audio::AudioPlayer;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::Duration;

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

fn noop_complete(_id: u64) {}

#[test]
fn create_player_ok() {
    let _p = AudioPlayer::new().expect("new should succeed");
}

#[test]
fn play_file_starts_playback() {
    let p = AudioPlayer::new().unwrap();
    p.play_file(&fixture("silence_1s.wav"), noop_complete)
        .expect("play should succeed");
    assert!(p.is_playing());
}

#[test]
fn stop_ends_playback() {
    let p = AudioPlayer::new().unwrap();
    p.play_file(&fixture("silence_1s.wav"), noop_complete).unwrap();
    p.stop();
    // small wait for internal cleanup
    sleep(Duration::from_millis(50));
    assert!(!p.is_playing());
}

#[test]
fn play_missing_file_returns_error() {
    let p = AudioPlayer::new().unwrap();
    let err = p.play_file(&PathBuf::from("/nonexistent.wav"), noop_complete);
    assert!(err.is_err());
}

#[test]
fn play_file_fires_completion_callback_when_song_ends_naturally() {
    let p = AudioPlayer::new().unwrap();
    let completed = Arc::new(Mutex::new(None::<u64>));
    let completed_c = Arc::clone(&completed);

    let id = p
        .play_file(&fixture("silence_1s.wav"), move |i| {
            *completed_c.lock().unwrap() = Some(i);
        })
        .expect("play should succeed");

    // silence_1s.wav is 1 second; the watcher polls every 300ms after a
    // 400ms grace period so we should see completion within ~2s.
    for _ in 0..25 {
        if completed.lock().unwrap().is_some() {
            break;
        }
        sleep(Duration::from_millis(100));
    }
    assert_eq!(*completed.lock().unwrap(), Some(id));
}

#[test]
fn stop_suppresses_completion_callback() {
    let p = AudioPlayer::new().unwrap();
    let fired = Arc::new(Mutex::new(false));
    let fired_c = Arc::clone(&fired);

    p.play_file(&fixture("silence_1s.wav"), move |_| {
        *fired_c.lock().unwrap() = true;
    })
    .expect("play should succeed");

    // Stop immediately — before natural completion — and give the watcher
    // enough time to observe an empty sink AND read the invalidated id.
    p.stop();
    sleep(Duration::from_millis(1500));
    assert!(!*fired.lock().unwrap());
}

#[test]
fn superseding_play_file_suppresses_old_completion_callback() {
    let p = AudioPlayer::new().unwrap();
    let old_fired = Arc::new(Mutex::new(false));
    let new_completed = Arc::new(Mutex::new(None::<u64>));
    let old_fired_c = Arc::clone(&old_fired);
    let new_completed_c = Arc::clone(&new_completed);

    p.play_file(&fixture("silence_1s.wav"), move |_| {
        *old_fired_c.lock().unwrap() = true;
    })
    .expect("first play should succeed");

    // Start a second playback almost immediately — old watcher must exit
    // without firing, new one must fire when its song ends.
    sleep(Duration::from_millis(100));
    let new_id = p
        .play_file(&fixture("silence_1s.wav"), move |i| {
            *new_completed_c.lock().unwrap() = Some(i);
        })
        .expect("second play should succeed");

    for _ in 0..25 {
        if new_completed.lock().unwrap().is_some() {
            break;
        }
        sleep(Duration::from_millis(100));
    }
    assert_eq!(*new_completed.lock().unwrap(), Some(new_id));
    assert!(!*old_fired.lock().unwrap());
}
