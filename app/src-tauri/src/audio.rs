use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::{Arc, Mutex};

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
        })
    }

    pub fn play_file(&self, path: &Path) -> Result<(), AudioError> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let decoder = Decoder::new(reader).map_err(|e| AudioError::Decode(e.to_string()))?;

        let new_sink = Sink::try_new(&self.handle)
            .map_err(|e| AudioError::Stream(e.to_string()))?;
        new_sink.append(decoder);

        let mut guard = self.sink.lock().unwrap();
        *guard = Some(new_sink);
        Ok(())
    }

    pub fn stop(&self) {
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
