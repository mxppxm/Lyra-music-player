use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn secrets_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("secrets.json")
}

fn load_secrets(path: &PathBuf) -> HashMap<String, String> {
    match fs::read_to_string(path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_secrets(path: &PathBuf, map: &HashMap<String, String>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn set_secret(app_data_dir: &PathBuf, key: &str, value: &str) -> Result<(), String> {
    let path = secrets_path(app_data_dir);
    let mut map = load_secrets(&path);
    map.insert(key.to_string(), value.to_string());
    save_secrets(&path, &map)
}

pub fn get_secret(app_data_dir: &PathBuf, key: &str) -> Result<Option<String>, String> {
    let path = secrets_path(app_data_dir);
    let map = load_secrets(&path);
    Ok(map.get(key).cloned())
}

pub fn delete_secret(app_data_dir: &PathBuf, key: &str) -> Result<(), String> {
    let path = secrets_path(app_data_dir);
    let mut map = load_secrets(&path);
    map.remove(key);
    save_secrets(&path, &map)
}
