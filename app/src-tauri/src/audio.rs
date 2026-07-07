use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
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
