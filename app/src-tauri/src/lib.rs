pub mod audio;
pub mod audio_features;
pub mod bilibili_proxy;
pub mod http_get;
pub mod library_scan;
pub mod lyrics;
pub mod secrets;
pub mod tray;
pub mod weekly;

use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tauri_plugin_sql::{Migration, MigrationKind};
use tray::{TrayController, TrayState};

pub struct AppState {
    pub audio: Arc<audio::AudioPlayer>,
}

#[tauri::command]
async fn audio_play(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
    duration_ms: Option<u64>,
) -> Result<u64, String> {
    let app_for_emit = app.clone();
    state
        .audio
        .play_file(std::path::Path::new(&path), duration_ms, move |id| {
            let _ = app_for_emit.emit("audio-complete", id);
        })
        .map_err(|e| e.to_string())
}

/// Play audio from a remote URL. Downloads the audio bytes via reqwest with
/// Bilibili-compatible headers, then feeds them to rodio for decoding+playback.
/// Used for Bilibili DASH audio streams that require Referer/Origin headers.
#[tauri::command]
async fn audio_play_url(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    url: String,
    duration_ms: Option<u64>,
) -> Result<u64, String> {
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
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("read: {}", e))?;

    let app_for_emit = app.clone();
    state
        .audio
        .play_bytes(bytes.to_vec(), duration_ms, move |id| {
            let _ = app_for_emit.emit("audio-complete", id);
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn audio_stop(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.stop();
    Ok(())
}

#[tauri::command]
async fn audio_is_playing(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.audio.is_playing())
}

#[tauri::command]
async fn audio_get_position(state: State<'_, AppState>) -> Result<Option<(u64, u64)>, String> {
    Ok(state.audio.get_position())
}

#[tauri::command]
async fn audio_pause(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.pause();
    Ok(())
}

#[tauri::command]
async fn audio_resume(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.resume();
    Ok(())
}

#[tauri::command]
async fn secret_set(app_handle: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    secrets::set_secret(&dir, &key, &value)
}

#[tauri::command]
async fn secret_get(app_handle: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    secrets::get_secret(&dir, &key)
}

#[tauri::command]
async fn secret_delete(app_handle: tauri::AppHandle, key: String) -> Result<(), String> {
    let dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    secrets::delete_secret(&dir, &key)
}

#[tauri::command]
async fn library_scan(path: String) -> Result<Vec<library_scan::ScannedTrack>, String> {
    library_scan::scan_directory(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn app_data_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn memory_file_read(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("memory.md");
    match tokio::fs::read_to_string(&path).await {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn memory_file_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let path = dir.join("memory.md");
    tokio::fs::write(&path, content).await.map_err(|e| e.to_string())
}

/// Returns true if `<app_data_dir>/PANIC` exists.
/// When present, EngineerAgent.runDailyLoop() short-circuits immediately —
/// no LLM call, no roadmap insertions.
#[tauri::command]
async fn check_panic_file(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let panic_path = dir.join("PANIC");
    Ok(panic_path.exists())
}

#[tauri::command]
async fn feature_cache_read(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("lyra-audio-features.json");
    match tokio::fs::read_to_string(&path).await {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("{}".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn feature_cache_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let path = dir.join("lyra-audio-features.json");
    tokio::fs::write(&path, content).await.map_err(|e| e.to_string())
}

/// Copy bundled precomputed data (DB + feature cache) to app_data_dir
/// on first launch. Idempotent — skips if files already exist.
#[tauri::command]
async fn setup_bundled_data(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&data_dir).await.map_err(|e| e.to_string())?;

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {}", e))?;

    let mut copied = Vec::new();

    // Copy lyra.db
    let db_dest = data_dir.join("lyra.db");
    let db_src = resource_dir.join("resources/lyra.db");
    if !db_dest.exists() && db_src.exists() {
        tokio::fs::copy(&db_src, &db_dest)
            .await
            .map_err(|e| format!("copy lyra.db: {}", e))?;
        copied.push("lyra.db");
    }

    // Copy feature cache
    let fc_dest = data_dir.join("lyra-audio-features.json");
    let fc_src = resource_dir.join("resources/lyra-audio-features.json");
    if !fc_dest.exists() && fc_src.exists() {
        tokio::fs::copy(&fc_src, &fc_dest)
            .await
            .map_err(|e| format!("copy features: {}", e))?;
        copied.push("lyra-audio-features.json");
    }

    Ok(if copied.is_empty() {
        "skipped (already present)".into()
    } else {
        format!("copied: {}", copied.join(", "))
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:lyra.db",
                    vec![
                        Migration {
                            version: 1,
                            description: "initial schema",
                            sql: include_str!("../migrations/001_initial.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "perception audit table",
                            sql: include_str!("../migrations/002_perception_audit.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "soul perception_tuning column",
                            sql: include_str!("../migrations/003_soul_perception_tuning.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "lyrics embeddings table",
                            sql: include_str!("../migrations/004_lyrics_embeddings.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 5,
                            description: "llm usage log",
                            sql: include_str!("../migrations/005_llm_usage.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 6,
                            description: "reasoning traces + latency columns",
                            sql: include_str!("../migrations/006_reasoning_traces.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 7,
                            description: "weekly_snapshots table",
                            sql: include_str!("../migrations/007_weekly_snapshots.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 8,
                            description: "music profiles + track feedback",
                            sql: include_str!("../migrations/008_music_profiles.sql"),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .setup(|app| {
            let player = audio::AudioPlayer::new().expect("audio init");
            app.manage(AppState {
                audio: Arc::new(player),
            });
            let tray_ctrl = TrayController::new(&app.handle()).expect("tray init");
            app.manage(TrayState(tray_ctrl));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio_play,
            audio_play_url,
            audio_stop,
            audio_is_playing,
            audio_get_position,
            audio_pause,
            audio_resume,
            secret_set,
            secret_get,
            secret_delete,
            library_scan,
            app_data_dir,
            memory_file_read,
            memory_file_write,
            check_panic_file,
            feature_cache_read,
            feature_cache_write,
            tray::tray_set_breathing,
            audio_features::audio_extract_features,
            audio::analyze_audio_url,
            lyrics::lyrics_extract,
            weekly::write_weekly_html,
            weekly::open_weekly_html,
            weekly::path_exists,
            weekly::read_weekly_html,
            bilibili_proxy::bilibili_fetch,
            http_get::http_get_text,
            setup_bundled_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
