use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("decode: {0}")]
    Decode(String),
    #[error("stream: {0}")]
    Stream(String),
}

pub struct AudioPlayer {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    sink: Arc<Mutex<Option<Sink>>>,
    // Incremented on every `play_file` and every `stop`. Watcher threads
    // read this to decide whether their "song finished" observation is
    // still relevant (i.e., the playback wasn't superseded by a new one).
    current_id: Arc<AtomicU64>,
}

// SAFETY: Two paths must be justified independently.
//
// ACCESS PATH: All mutable state (`sink`) is protected by `Arc<Mutex<Option<Sink>>>`.
// `_stream` and `handle` are written only in `new()` and never mutated again;
// `handle` is `Clone`-shareable per the rodio API contract. No field is accessed
// without going through the Mutex or an immutable borrow, so shared references
// from multiple threads are sound.
//
// DROP PATH: `OutputStream` wraps a `cpal::Stream` whose `Drop` impl (on macOS)
// calls CoreAudio's `AudioOutputUnitStop` + `AudioUnitUninitialize`.  Apple's
// CoreAudio documentation states that both functions are safe to call from any
// thread on macOS 10.14+, so dropping `AudioPlayer` from a non-audio thread is
// correct on our target platform.  cpal's `!Send` marker is a conservative
// cross-platform default, not a correctness requirement on macOS.
//
// PORTABILITY: On Windows (WASAPI) and Linux (ALSA/PipeWire) the drop-from-
// non-audio-thread guarantee does not hold universally.  If this crate is ever
// ported to those platforms, replace this pattern with a dedicated audio thread
// that owns `OutputStream` for its entire lifetime and communicates via channels.
//
// TODO(v0.2): Migrate to a dedicated audio thread that holds `OutputStream`
// forever (send commands via `mpsc`) to make the Send bound platform-agnostic.
unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

impl AudioPlayer {
    pub fn new() -> Result<Self, AudioError> {
        let (stream, handle) = OutputStream::try_default()
            .map_err(|e| AudioError::Stream(e.to_string()))?;
        Ok(Self {
            _stream: stream,
            handle,
            sink: Arc::new(Mutex::new(None)),
            current_id: Arc::new(AtomicU64::new(0)),
        })
    }

    /// Play `path`. Returns a monotonically increasing playback id.
    /// When the sink naturally drains (song finished), `on_complete(id)` is
    /// called on a background thread. If `stop()` or another `play_file()` is
    /// called first, the watcher exits silently — the caller only gets
    /// `on_complete` for natural completions.
    pub fn play_file<F>(&self, path: &Path, on_complete: F) -> Result<u64, AudioError>
    where
        F: 'static + Send + FnOnce(u64),
    {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let decoder = Decoder::new(reader).map_err(|e| AudioError::Decode(e.to_string()))?;

        let new_sink = Sink::try_new(&self.handle)
            .map_err(|e| AudioError::Stream(e.to_string()))?;
        new_sink.append(decoder);

        // Bump id BEFORE swapping the sink. The previous watcher thread (if
        // any) may still be sleeping between polls; when it next reads
        // current_id it will find a different value and exit silently.
        let id = self.current_id.fetch_add(1, Ordering::SeqCst) + 1;

        {
            let mut guard = self.sink.lock().unwrap();
            if let Some(old) = guard.take() {
                old.stop();
            }
            *guard = Some(new_sink);
        }

        // Spawn watcher — polls sink emptiness every 300ms.
        let sink_arc = Arc::clone(&self.sink);
        let current_id = Arc::clone(&self.current_id);
        thread::spawn(move || {
            // Grace period so we don't observe "empty" before playback starts.
            thread::sleep(Duration::from_millis(400));
            loop {
                if current_id.load(Ordering::SeqCst) != id {
                    return; // superseded
                }
                let done = {
                    let guard = sink_arc.lock().unwrap();
                    guard.as_ref().map_or(true, |s| s.empty())
                };
                if done {
                    // Re-check after acquiring intent to fire, in case a
                    // stop() or new play_file() sneaked in between the emptiness
                    // check and here.
                    if current_id.load(Ordering::SeqCst) == id {
                        on_complete(id);
                    }
                    return;
                }
                thread::sleep(Duration::from_millis(300));
            }
        });

        Ok(id)
    }

    pub fn stop(&self) {
        // Invalidate the current id so the watcher thread's completion emit
        // (if it happens to observe emptiness at the same time) gets suppressed.
        self.current_id.fetch_add(1, Ordering::SeqCst);
        let mut guard = self.sink.lock().unwrap();
        if let Some(sink) = guard.take() {
            sink.stop();
        }
    }

    pub fn is_playing(&self) -> bool {
        let guard = self.sink.lock().unwrap();
        guard.as_ref().map_or(false, |s| !s.empty() && !s.is_paused())
    }
}
