use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

// Extra time we wait past the declared song duration before assuming the
// primary Sink::empty() watcher will never fire. Covers decoder tail latency,
// small metadata rounding, and the 400ms grace + 300ms poll of the watcher
// itself. 750ms is enough for MP3/FLAC/AAC without noticeably delaying the
// next song when the primary path is broken.
const FALLBACK_SLACK_MS: u64 = 750;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("decode: {0}")]
    Decode(String),
    #[error("stream: {0}")]
    Stream(String),
}

/// Owns the audio pipeline. `OutputStream` (the `!Send` cpal handle) lives
/// forever on a dedicated audio thread; only the `Send + Sync`
/// `OutputStreamHandle` crosses thread boundaries. This keeps the struct
/// `Send + Sync` without any `unsafe`, and guarantees `OutputStream` drops on
/// its own thread — safe on macOS, Windows (WASAPI), and Linux (ALSA/PipeWire)
/// alike.
pub struct AudioPlayer {
    handle: OutputStreamHandle,
    sink: Arc<Mutex<Option<Sink>>>,
    // Incremented on every `play_file` and every `stop`. Watcher threads
    // read this to decide whether their "song finished" observation is
    // still relevant (i.e., the playback wasn't superseded by a new one).
    current_id: Arc<AtomicU64>,
    // Signal the audio thread to drop the OutputStream and exit.
    shutdown: Option<mpsc::Sender<()>>,
    // Kept so Drop can join the worker before the AudioPlayer disappears.
    worker: Option<thread::JoinHandle<()>>,
}

impl AudioPlayer {
    pub fn new() -> Result<Self, AudioError> {
        let (init_tx, init_rx) =
            mpsc::channel::<Result<OutputStreamHandle, String>>();
        let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();

        let worker = thread::spawn(move || {
            // Create the OutputStream on this thread. It never leaves.
            let (stream, handle) = match OutputStream::try_default() {
                Ok(pair) => pair,
                Err(e) => {
                    let _ = init_tx.send(Err(e.to_string()));
                    return;
                }
            };
            // Hand back the clone-able handle so the outer struct can build sinks.
            if init_tx.send(Ok(handle)).is_err() {
                // Receiver dropped — nothing more to do.
                return;
            }
            drop(init_tx);
            // Park until shutdown. OutputStream stays alive here, and
            // its Drop runs on this thread when the block ends.
            let _ = shutdown_rx.recv();
            drop(stream);
        });

        let handle = init_rx
            .recv()
            .map_err(|e| AudioError::Stream(format!("audio worker init: {}", e)))?
            .map_err(AudioError::Stream)?;

        Ok(Self {
            handle,
            sink: Arc::new(Mutex::new(None)),
            current_id: Arc::new(AtomicU64::new(0)),
            shutdown: Some(shutdown_tx),
            worker: Some(worker),
        })
    }

    /// Play `path`. Returns a monotonically increasing playback id.
    /// When the sink naturally drains (song finished), `on_complete(id)` is
    /// called on a background thread. If `stop()` or another `play_file()` is
    /// called first, the watcher exits silently — the caller only gets
    /// `on_complete` for natural completions.
    ///
    /// `duration_hint_ms`: optional song length. When provided, a fallback
    /// timer thread fires `on_complete` after `duration + FALLBACK_SLACK_MS`
    /// if the primary Sink::empty() watcher hasn't already fired. This
    /// guards against rodio 0.19 + symphonia edge cases where `sound_count`
    /// never decrements to 0 after an MP3 decoder EOFs — without the
    /// fallback the watcher polls forever and auto-advance never triggers.
    ///
    /// Exactly one of the two paths ever invokes the callback — whichever
    /// takes the boxed FnOnce out of the shared slot first. Superseded
    /// playbacks (id bumped) suppress both paths.
    pub fn play_file<F>(
        &self,
        path: &Path,
        duration_hint_ms: Option<u64>,
        on_complete: F,
    ) -> Result<u64, AudioError>
    where
        F: 'static + Send + FnOnce(u64),
    {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let decoder = Decoder::new(reader).map_err(|e| AudioError::Decode(e.to_string()))?;

        // Create the sink upfront so a failure here doesn't leave shared
        // state half-mutated. The sink attaches to the OutputStreamHandle
        // but contributes silence until we append.
        let new_sink = Sink::try_new(&self.handle)
            .map_err(|e| AudioError::Stream(e.to_string()))?;

        // Bump id BEFORE swapping the sink. The previous watcher thread (if
        // any) may still be sleeping between polls; when it next reads
        // current_id it will find a different value and exit silently.
        let id = self.current_id.fetch_add(1, Ordering::SeqCst) + 1;

        {
            let mut guard = self.sink.lock().unwrap();
            if let Some(old) = guard.take() {
                old.stop();
            }
            // Append AFTER stopping the old sink — otherwise both sinks
            // feed the shared handle for a lock-acquisition-window worth
            // of samples, causing audible double-audio at each swap.
            new_sink.append(decoder);
            *guard = Some(new_sink);
        }

        // Shared FnOnce slot so both the empty-watcher and the duration
        // fallback race for it; whoever wins take()s the boxed callback,
        // the loser sees None and drops.
        type Callback = Box<dyn FnOnce(u64) + Send>;
        let on_complete: Arc<Mutex<Option<Callback>>> =
            Arc::new(Mutex::new(Some(Box::new(on_complete))));

        // Primary watcher — polls sink emptiness every 300ms.
        let sink_arc = Arc::clone(&self.sink);
        let current_id_w = Arc::clone(&self.current_id);
        let cb_w = Arc::clone(&on_complete);
        thread::spawn(move || {
            // Grace period so we don't observe "empty" before playback starts.
            thread::sleep(Duration::from_millis(400));
            loop {
                if current_id_w.load(Ordering::SeqCst) != id {
                    return; // superseded
                }
                let done = {
                    let guard = sink_arc.lock().unwrap();
                    guard.as_ref().map_or(true, |s| s.empty())
                };
                if done {
                    // Take the callback slot FIRST — this guarantees that a
                    // stop() or fallback race can't fire the same callback
                    // twice. Then verify id inside; if it moved, we drop
                    // the callback without invoking it (equivalent to stop's
                    // "no natural-complete" contract).
                    let taken = cb_w.lock().unwrap().take();
                    if let Some(cb) = taken {
                        if current_id_w.load(Ordering::SeqCst) == id {
                            cb(id);
                        }
                    }
                    return;
                }
                thread::sleep(Duration::from_millis(300));
            }
        });

        // Fallback timer — only armed when the caller knows the song length.
        // A hint of 0 means "duration unknown" (metadata read failed); firing
        // the fallback then would truncate short songs at FALLBACK_SLACK_MS,
        // so skip.
        if let Some(dur_ms) = duration_hint_ms.filter(|d| *d > 0) {
            let current_id_f = Arc::clone(&self.current_id);
            let cb_f = Arc::clone(&on_complete);
            let wait_ms = dur_ms.saturating_add(FALLBACK_SLACK_MS);
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(wait_ms));
                let taken = cb_f.lock().unwrap().take();
                if let Some(cb) = taken {
                    if current_id_f.load(Ordering::SeqCst) == id {
                        cb(id);
                    }
                }
            });
        }

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

impl Drop for AudioPlayer {
    fn drop(&mut self) {
        // Kill any live sink first so its Drop doesn't race with the audio
        // thread's OutputStream teardown.
        if let Ok(mut guard) = self.sink.lock() {
            if let Some(sink) = guard.take() {
                sink.stop();
            }
        }
        // Signal the audio thread to exit, then wait for it. The shutdown
        // channel dropping is also a valid signal in case send() fails.
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
            drop(tx);
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
