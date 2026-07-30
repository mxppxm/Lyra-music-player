use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Resolve ffmpeg binary path at runtime so GUI apps launched from Finder
/// can still find it even without /opt/homebrew/bin on PATH.
fn find_ffmpeg() -> Option<String> {
    // Common macOS Homebrew locations
    let candidates = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/opt/ffmpeg/bin/ffmpeg",
    ];
    for p in candidates {
        if std::path::Path::new(p).is_file() {
            return Some(p.to_owned());
        }
    }
    // Fallback: hope it's on PATH (works when launched from terminal)
    None
}

use crate::audio_features::{self, AudioFeatures};

// Extra time we wait past the declared song duration before assuming the
// primary Sink::empty() watcher will never fire. Covers decoder tail latency,
// small metadata rounding, and the 400ms grace + 300ms poll of the watcher
// itself. 750ms is enough for MP3/FLAC/AAC without noticeably delaying the
// next song when the primary path is broken.
const FALLBACK_SLACK_MS: u64 = 750;

type Callback = Box<dyn FnOnce(u64) + Send>;

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
    // Playback position tracking: (start_time, total_duration_ms)
    playback_start: Arc<Mutex<Option<(Instant, u64)>>>,
    // Pause flag — checked by fallback timer to suppress auto-advance.
    paused: Arc<AtomicBool>,
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
            playback_start: Arc::new(Mutex::new(None)),
            paused: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Play `path`. Reads entire file into memory, then delegates to
    /// [`play_bytes`]. Same contract.
    pub fn play_file<F>(
        &self,
        path: &Path,
        duration_hint_ms: Option<u64>,
        on_complete: F,
    ) -> Result<u64, AudioError>
    where
        F: 'static + Send + FnOnce(u64),
    {
        let bytes = std::fs::read(path)?;
        self.play_bytes(bytes, duration_hint_ms, on_complete)
    }

    /// Play raw audio bytes (downloaded from a URL, e.g. Bilibili DASH stream).
    /// Uses ffmpeg to convert to WAV first, then plays via rodio.
    pub fn play_bytes<F>(
        &self,
        bytes: Vec<u8>,
        duration_hint_ms: Option<u64>,
        on_complete: F,
    ) -> Result<u64, AudioError>
    where
        F: 'static + Send + FnOnce(u64),
    {
        use std::io::Write;
        // Reset pause flag on new playback.
        self.paused.store(false, Ordering::SeqCst);
        let pid = std::process::id();
        let m4s_path = std::env::temp_dir().join(format!("lyra_{}.m4s", pid));
        let wav_path = std::env::temp_dir().join(format!("lyra_{}.wav", pid));

        // Write raw m4s bytes to temp file.
        {
            let mut f = std::fs::File::create(&m4s_path)?;
            f.write_all(&bytes)?;
            f.flush()?;
        }

        // Convert to WAV via ffmpeg.
        let ffmpeg_path = find_ffmpeg().unwrap_or_else(|| "ffmpeg".to_owned());
        let ffmpeg = std::process::Command::new(&ffmpeg_path)
            .args([
                "-y",
                "-i",
                m4s_path.to_str().unwrap_or(""),
                "-f", "wav",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "2",
                wav_path.to_str().unwrap_or(""),
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        // Clean up m4s regardless of ffmpeg result.
        let _ = std::fs::remove_file(&m4s_path);

        match ffmpeg {
            Ok(status) if status.success() => {}
            Ok(status) => return Err(AudioError::Decode(format!("ffmpeg exited {}", status))),
            Err(e) => return Err(AudioError::Decode(format!("ffmpeg: {}", e))),
        }

        let file = std::fs::File::open(&wav_path).map_err(AudioError::Io)?;
        let decoder = Decoder::new(file).map_err(|e| AudioError::Decode(e.to_string()))?;

        // Clean up wav after playback.
        let wav_cleanup = wav_path.clone();
        let on_complete = move |id: u64| {
            let _ = std::fs::remove_file(&wav_cleanup);
            on_complete(id);
        };

        // ── Identical sink logic — see original play_file for details ──────
        let new_sink = Sink::try_new(&self.handle)
            .map_err(|e| AudioError::Stream(e.to_string()))?;

        let id = self.current_id.fetch_add(1, Ordering::SeqCst) + 1;

        {
            let mut guard = self.sink.lock().unwrap();
            if let Some(old) = guard.take() {
                old.stop();
            }
            new_sink.append(decoder);
            *guard = Some(new_sink);
        }

        let on_complete: Arc<Mutex<Option<Callback>>> =
            Arc::new(Mutex::new(Some(Box::new(on_complete))));

        // Primary watcher
        let sink_arc = Arc::clone(&self.sink);
        let current_id_w = Arc::clone(&self.current_id);
        let cb_w = Arc::clone(&on_complete);
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(400));
            loop {
                if current_id_w.load(Ordering::SeqCst) != id {
                    return;
                }
                let done = {
                    let guard = sink_arc.lock().unwrap();
                    guard.as_ref().map_or(true, |s| s.empty())
                };
                if done {
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

        // Fallback timer
        if let Some(dur_ms) = duration_hint_ms.filter(|d| *d > 0) {
            let current_id_f = Arc::clone(&self.current_id);
            let paused_f = Arc::clone(&self.paused);
            let cb_f = Arc::clone(&on_complete);
            let wait_ms = dur_ms.saturating_add(FALLBACK_SLACK_MS);
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(wait_ms));
                // If paused, skip — the primary watcher will handle completion
                // after the user resumes.  This prevents auto-advance during
                // manual pause.
                if paused_f.load(Ordering::SeqCst) {
                    return;
                }
                let taken = cb_f.lock().unwrap().take();
                if let Some(cb) = taken {
                    if current_id_f.load(Ordering::SeqCst) == id {
                        cb(id);
                    }
                }
            });
        }

        // Record playback start for progress tracking
        {
            let mut start = self.playback_start.lock().unwrap();
            *start = Some((Instant::now(), duration_hint_ms.unwrap_or(0)));
        }

        Ok(id)
    }

    pub fn stop(&self) {
        // Invalidate the current id so the watcher thread's completion emit
        // (if it happens to observe emptiness at the same time) gets suppressed.
        self.current_id.fetch_add(1, Ordering::SeqCst);
        self.paused.store(false, Ordering::SeqCst);
        let mut guard = self.sink.lock().unwrap();
        if let Some(sink) = guard.take() {
            sink.stop();
        }
        // Clear position tracking
        let mut start = self.playback_start.lock().unwrap();
        *start = None;
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
        let guard = self.sink.lock().unwrap();
        if let Some(ref sink) = *guard {
            sink.pause();
        }
    }

    pub fn resume(&self) {
        let guard = self.sink.lock().unwrap();
        if let Some(ref sink) = *guard {
            sink.play();
        }
        self.paused.store(false, Ordering::SeqCst);
    }

    /// Returns `(elapsed_ms, total_duration_ms)` if playback is active, or `None` if idle.
    pub fn get_position(&self) -> Option<(u64, u64)> {
        let start = self.playback_start.lock().unwrap();
        let (t0, total) = (*start)?;
        let elapsed = t0.elapsed().as_millis() as u64;
        // Cap at total so the bar doesn't overshoot
        let elapsed = if total > 0 { elapsed.min(total) } else { elapsed };
        // If sink is gone / empty, report playback as finished
        let guard = self.sink.lock().unwrap();
        let playing = guard.as_ref().map_or(false, |s| !s.empty());
        if !playing && elapsed > 0 {
            // Already stopped or finished — return the last known position
            return Some((elapsed, total));
        }
        Some((elapsed, total))
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

/// Download audio from URL, transcode to WAV, extract features.
/// Used to build the audio-feature cache for mood-based song selection.
/// Returns AudioFeatures or an error string.
#[tauri::command]
pub async fn analyze_audio_url(url: String) -> Result<AudioFeatures, String> {
    use reqwest::header::{HeaderValue, REFERER, USER_AGENT};

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ),
    );
    headers.insert(REFERER, HeaderValue::from_static("https://www.bilibili.com/"));
    headers.insert(
        "Cookie",
        HeaderValue::from_static("buvid3=random-buvid3-for-lyra"),
    );

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("reqwest: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fetch: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("read: {}", e))?;

    // Spawn blocking for ffmpeg + rodio decode (CPU-bound)
    tokio::task::spawn_blocking(move || {
        use std::io::Write;
        let pid = std::process::id();
        let m4s_path = std::env::temp_dir().join(format!("lyra_analyze_{}.m4s", pid));
        let wav_path = std::env::temp_dir().join(format!("lyra_analyze_{}.wav", pid));

        // Write m4s
        {
            let mut f = std::fs::File::create(&m4s_path)
                .map_err(|e| format!("create m4s: {}", e))?;
            f.write_all(&bytes)
                .map_err(|e| format!("write m4s: {}", e))?;
        }

        // ffmpeg → WAV
        let status = std::process::Command::new("ffmpeg")
            .args([
                "-y", "-i",
                m4s_path.to_str().unwrap_or(""),
                "-f", "wav",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "2",
                wav_path.to_str().unwrap_or(""),
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("ffmpeg spawn: {}", e))?;

        let _ = std::fs::remove_file(&m4s_path);

        if !status.success() {
            let _ = std::fs::remove_file(&wav_path);
            return Err(format!("ffmpeg exited {}", status));
        }

        // Extract features
        let features = audio_features::extract(&wav_path)
            .map_err(|e| format!("feature extract: {}", e))?;

        let _ = std::fs::remove_file(&wav_path);

        Ok(features)
    })
    .await
    .map_err(|e| format!("join: {}", e))?
}
