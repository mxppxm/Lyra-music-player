// Weekly letter file I/O commands.
// Atomic write via <path>.tmp → rename so a crash mid-write can never
// leave a half-written HTML on disk that the frontend would try to open.

use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

pub fn write_weekly_html_impl(path: String, content: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = target.with_extension("html.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, target).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn path_exists_impl(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

pub fn read_weekly_html_impl(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_weekly_html(path: String, content: String) -> Result<(), String> {
    write_weekly_html_impl(path, content)
}

/// Kept for future use (system-browser open). Current /week flow renders
/// HTML in-app via an iframe modal instead.
#[tauri::command]
pub async fn open_weekly_html(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    path_exists_impl(path)
}

#[tauri::command]
pub async fn read_weekly_html(path: String) -> Result<String, String> {
    read_weekly_html_impl(path)
}
