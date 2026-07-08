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

/// Extracted features. Floats energy/valence are in [0, 1]; bpm is in
/// [60, 200] or 0 if detection failed.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct AudioFeatures {
    /// RMS energy, normalised to [0, 1].
    pub energy: f32,
    /// Spectral centroid divided by Nyquist. Bright material → higher.
    pub valence: f32,
    /// Detected beats-per-minute in [60, 200], or 0 when detection is
    /// inconclusive (silence, no discernible periodic onsets, etc).
    pub bpm: u32,
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

/// Beat tracker via spectral-flux onset envelope + autocorrelation.
/// Returns detected BPM in [60, 200], or 0 when the signal is silent
/// or has no periodic onset structure worth reporting. Sprint 12.
pub fn compute_bpm(samples: &[f32], sample_rate: u32) -> u32 {
    const FRAME: usize = 1024;
    const HOP: usize = 512;
    if samples.len() < FRAME * 4 || sample_rate == 0 {
        return 0;
    }
    let frame_rate = sample_rate as f32 / HOP as f32; // frames per second
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FRAME);

    // 1) Spectral flux per hop.
    let mut prev_mag = vec![0.0f32; FRAME / 2];
    let mut flux: Vec<f32> = Vec::with_capacity(samples.len() / HOP);
    let mut i = 0;
    while i + FRAME <= samples.len() {
        let mut buf: Vec<Complex<f32>> = (0..FRAME)
            .map(|k| {
                let w = 0.5
                    - 0.5 * (2.0 * std::f32::consts::PI * k as f32 / (FRAME as f32 - 1.0)).cos();
                Complex::new(samples[i + k] * w, 0.0)
            })
            .collect();
        fft.process(&mut buf);
        let half = FRAME / 2;
        let mut sum_positive = 0.0f32;
        for k in 0..half {
            let mag = buf[k].norm();
            let diff = mag - prev_mag[k];
            if diff > 0.0 {
                sum_positive += diff;
            }
            prev_mag[k] = mag;
        }
        flux.push(sum_positive);
        i += HOP;
    }
    if flux.len() < 32 {
        return 0;
    }

    // 2) Normalize by mean, half-wave rectify to isolate onsets.
    let mean_flux = flux.iter().sum::<f32>() / flux.len() as f32;
    if mean_flux == 0.0 {
        return 0;
    }
    let onset: Vec<f32> = flux
        .iter()
        .map(|&v| (v / mean_flux - 1.0).max(0.0))
        .collect();

    // 3) Autocorrelation over the plausible tempo range [60, 200] BPM.
    let min_lag = (frame_rate * 60.0 / 200.0).floor() as usize;
    let max_lag = (frame_rate * 60.0 / 60.0).ceil() as usize;
    let max_lag = max_lag.min(onset.len() / 2);
    if max_lag <= min_lag {
        return 0;
    }

    let mut best_lag = min_lag;
    let mut best_score = 0.0f32;
    for lag in min_lag..=max_lag {
        let mut s = 0.0f32;
        for k in 0..(onset.len() - lag) {
            s += onset[k] * onset[k + lag];
        }
        if s > best_score {
            best_score = s;
            best_lag = lag;
        }
    }
    if best_score <= 0.0 {
        return 0;
    }

    let bpm = 60.0 * frame_rate / best_lag as f32;
    bpm.round().clamp(60.0, 200.0) as u32
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
    let bpm = compute_bpm(&mono, sample_rate);
    let duration_ms = total_duration
        .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0);

    Ok(AudioFeatures {
        energy,
        valence,
        bpm,
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

    // Sprint 12: BPM detection tests --------------------------------------

    #[test]
    fn bpm_of_empty_is_zero() {
        assert_eq!(compute_bpm(&[], 44_100), 0);
    }

    #[test]
    fn bpm_of_silence_is_zero() {
        let sr = 44_100u32;
        let silence = vec![0.0f32; sr as usize * 5];
        assert_eq!(compute_bpm(&silence, sr), 0);
    }

    #[test]
    fn bpm_of_120bpm_click_track_detects_120() {
        // Click every 0.5s = 120 BPM. Each click is a 10ms pulse of
        // white-noise-ish content so spectral flux has something to
        // latch onto.
        let sr = 44_100u32;
        let seconds = 8.0f32;
        let n = (sr as f32 * seconds) as usize;
        let period_samples = sr as usize / 2; // 0.5s → 120 BPM
        let mut buf = vec![0.0f32; n];
        let click_len = (sr as f32 * 0.010) as usize;
        for k in 0..(n / period_samples) {
            let start = k * period_samples;
            for j in 0..click_len {
                if start + j < n {
                    // deterministic pseudo-noise
                    let phase = (start + j) as f32 * 12.34;
                    buf[start + j] = 0.8 * phase.sin() * (1.0 - j as f32 / click_len as f32);
                }
            }
        }
        let bpm = compute_bpm(&buf, sr);
        // Allow ±5 BPM slack because 44.1 kHz / 512 hop = 86.13 fps
        // and lag quantisation for 120 BPM is ~1 BPM per lag step.
        assert!(
            (bpm as i32 - 120).abs() <= 5,
            "expected ≈120 BPM, got {}",
            bpm
        );
    }
}
