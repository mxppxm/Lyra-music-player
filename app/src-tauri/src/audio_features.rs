//! audio_features — Sprint 9
//!
//! Cheap DSP-only feature extraction: RMS energy + spectral centroid.
//! No BPM (deferred v0.2.1). No lyrics embedding (Sprint 10).
//!
//! Design constraint: every extraction is best-effort. Any decode or DSP
//! error at the command layer yields an error to the caller, and the TS
//! integration silently drops the row so the library import isn't blocked.

use rustfft::{num_complex::Complex, FftPlanner};
use std::path::Path;

use rodio::{Decoder, Source};
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;

/// Extracted features. All floats are in [0, 1].
#[derive(Debug, Clone, Copy, Serialize)]
pub struct AudioFeatures {
    /// RMS energy, normalised to [0, 1].
    pub energy: f32,
    /// Spectral centroid divided by Nyquist. Bright material → higher.
    pub valence: f32,
    /// Duration of the source in milliseconds (from the file header).
    pub duration_ms: u64,
}

/// Compute RMS of the buffer, clamped to [0, 1].
pub fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    let rms = (sum_sq / samples.len() as f32).sqrt();
    rms.clamp(0.0, 1.0)
}

/// Spectral centroid over a single FFT of the buffer (Hann-windowed).
/// Returns centroid / Nyquist in [0, 1]. Empty buffers return 0.
pub fn compute_spectral_centroid(samples: &[f32], sample_rate: u32) -> f32 {
    // Round buffer length to nearest power of 2 up to 4096. Larger FFTs
    // stall on huge buffers without meaningfully improving centroid.
    if samples.is_empty() || sample_rate == 0 {
        return 0.0;
    }
    let n = 4096.min(samples.len().next_power_of_two() >> 0);
    let n = if n < 64 { 64 } else { n };
    let take = n.min(samples.len());
    if take < 64 {
        return 0.0;
    }
    // Hann window
    let mut buf: Vec<Complex<f32>> = (0..take)
        .map(|i| {
            let w = 0.5
                - 0.5
                    * (2.0 * std::f32::consts::PI * i as f32 / (take as f32 - 1.0)).cos();
            Complex::new(samples[i] * w, 0.0)
        })
        .collect();
    // Zero-pad to n
    buf.resize(n, Complex::new(0.0, 0.0));

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(n);
    fft.process(&mut buf);

    // Half spectrum only (real FFT). Compute weighted centroid.
    let half = n / 2;
    let mut numerator = 0.0f32;
    let mut denominator = 0.0f32;
    for k in 0..half {
        let mag = buf[k].norm();
        let freq = k as f32 * sample_rate as f32 / n as f32;
        numerator += freq * mag;
        denominator += mag;
    }
    if denominator == 0.0 {
        return 0.0;
    }
    let centroid_hz = numerator / denominator;
    let nyquist = sample_rate as f32 / 2.0;
    (centroid_hz / nyquist).clamp(0.0, 1.0)
}

/// Load a track and extract features. Reads at most `max_secs` of audio,
/// downmixed to mono. Returns an error if the file can't be opened or
/// decoded.
pub fn extract(path: &Path) -> Result<AudioFeatures, AudioFeaturesError> {
    let max_secs: u32 = 30;
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let decoder =
        Decoder::new(reader).map_err(|e| AudioFeaturesError::Decode(e.to_string()))?;

    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels().max(1) as usize;
    let total_duration = decoder.total_duration();

    // Take at most max_secs of samples, downmixed to mono.
    let max_samples = (sample_rate as usize) * (max_secs as usize) * channels;
    let raw: Vec<f32> = decoder
        .take(max_samples)
        .map(|s| s as f32 / i16::MAX as f32)
        .collect();

    let mono: Vec<f32> = if channels <= 1 {
        raw
    } else {
        raw.chunks(channels)
            .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
            .collect()
    };

    let energy = compute_rms(&mono);
    let valence = compute_spectral_centroid(&mono, sample_rate);
    let duration_ms = total_duration
        .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0);

    Ok(AudioFeatures {
        energy,
        valence,
        duration_ms,
    })
}

#[derive(Debug, thiserror::Error)]
pub enum AudioFeaturesError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("decode: {0}")]
    Decode(String),
}

// ─── Tauri command ──────────────────────────────────────────────────────────

/// `invoke("audio_extract_features", { path })` → AudioFeatures.
/// String error is what Tauri commands must surface.
#[tauri::command]
pub async fn audio_extract_features(path: String) -> Result<AudioFeatures, String> {
    tokio::task::spawn_blocking(move || extract(Path::new(&path)))
        .await
        .map_err(|e| format!("join: {}", e))?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn rms_of_empty_is_zero() {
        assert_eq!(compute_rms(&[]), 0.0);
    }

    #[test]
    fn rms_of_zeros_is_zero() {
        let zeros = vec![0.0f32; 1000];
        assert_eq!(compute_rms(&zeros), 0.0);
    }

    #[test]
    fn rms_of_constant_matches_amplitude() {
        let buf = vec![0.5f32; 1000];
        let r = compute_rms(&buf);
        assert!((r - 0.5).abs() < 1e-4, "expected ~0.5, got {}", r);
    }

    #[test]
    fn rms_clamps_to_one() {
        let buf = vec![10.0f32; 100];
        assert_eq!(compute_rms(&buf), 1.0);
    }

    #[test]
    fn spectral_centroid_of_1khz_sine_is_low() {
        // 1 kHz sine at 44.1 kHz sample rate: centroid ≈ 1000/22050 ≈ 0.045
        let sr = 44_100u32;
        let n = 4096usize;
        let samples: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 1000.0 * i as f32 / sr as f32).sin() * 0.8)
            .collect();
        let c = compute_spectral_centroid(&samples, sr);
        assert!(c > 0.02 && c < 0.10, "expected ~0.045, got {}", c);
    }

    #[test]
    fn spectral_centroid_of_higher_sine_is_higher() {
        let sr = 44_100u32;
        let n = 4096usize;
        let low: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 500.0 * i as f32 / sr as f32).sin())
            .collect();
        let high: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 5000.0 * i as f32 / sr as f32).sin())
            .collect();
        let cl = compute_spectral_centroid(&low, sr);
        let ch = compute_spectral_centroid(&high, sr);
        assert!(ch > cl, "high sine ({}) should exceed low sine ({})", ch, cl);
    }

    #[test]
    fn spectral_centroid_of_empty_is_zero() {
        assert_eq!(compute_spectral_centroid(&[], 44_100), 0.0);
    }
}
