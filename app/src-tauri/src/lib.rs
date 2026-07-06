pub mod audio;
pub mod library_scan;
pub mod secrets;

use std::sync::Arc;
use tauri::{Manager, State};
use tauri_plugin_sql::{Migration, MigrationKind};

pub struct AppState {
    pub audio: Arc<audio::AudioPlayer>,
}

#[tauri::command]
async fn audio_play(state: State<'_, AppState>, path: String) -> Result<(), String> {
    state
        .audio
        .play_file(std::path::Path::new(&path))
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
async fn secret_set(key: String, value: String) -> Result<(), String> {
    secrets::set_secret(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
async fn secret_get(key: String) -> Result<Option<String>, String> {
    secrets::get_secret(&key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn secret_delete(key: String) -> Result<(), String> {
    secrets::delete_secret(&key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn library_scan(path: String) -> Result<Vec<library_scan::ScannedTrack>, String> {
    library_scan::scan_directory(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:lyra.db",
                    vec![Migration {
                        version: 1,
                        description: "initial schema",
                        sql: include_str!("../migrations/001_initial.sql"),
                        kind: MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .setup(|app| {
            let player = audio::AudioPlayer::new().expect("audio init");
            app.manage(AppState {
                audio: Arc::new(player),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio_play,
            audio_stop,
            audio_is_playing,
            secret_set,
            secret_get,
            secret_delete,
            library_scan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
