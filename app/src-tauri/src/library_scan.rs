use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScannedTrack {
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, thiserror::Error)]
pub enum LibraryScanError {
    #[error("directory does not exist or is not readable: {0}")]
    BadRoot(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

const AUDIO_EXTS: &[&str] = &["mp3", "flac", "wav", "m4a", "ogg", "aac", "opus"];

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| AUDIO_EXTS.iter().any(|e| e.eq_ignore_ascii_case(s)))
        .unwrap_or(false)
}

pub fn scan_directory(root: &Path) -> Result<Vec<ScannedTrack>, LibraryScanError> {
    if !root.exists() || !root.is_dir() {
        return Err(LibraryScanError::BadRoot(root.display().to_string()));
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || !is_audio(path) {
            continue;
        }
        let abs = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let (title, artist, album, duration_ms) = read_metadata(&abs);
        out.push(ScannedTrack {
            path: abs.to_string_lossy().to_string(),
            title,
            artist,
            album,
            duration_ms,
        });
    }
    Ok(out)
}

fn read_metadata(path: &Path) -> (Option<String>, Option<String>, Option<String>, Option<u64>) {
    use lofty::file::AudioFile;
    use lofty::file::TaggedFileExt;
    use lofty::tag::Accessor;

    let Ok(file) = lofty::read_from_path(path) else {
        return (None, None, None, None);
    };
    let props = file.properties();
    let dur = Some(props.duration().as_millis() as u64);
    let tag = file.primary_tag().or_else(|| file.first_tag());
    let (title, artist, album) = tag
        .map(|t| {
            (
                t.title().map(|s| s.to_string()),
                t.artist().map(|s| s.to_string()),
                t.album().map(|s| s.to_string()),
            )
        })
        .unwrap_or((None, None, None));
    (title, artist, album, dur)
}
