/// Bilibili proxy — makes HTTP requests from the Rust backend to bypass
/// CORS restrictions in the Tauri WebView.
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, ORIGIN, REFERER, USER_AGENT};
use serde::Deserialize;

const BILIBILI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BILIBILI_REFERER: &str = "https://www.bilibili.com/";

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum JsonResponse {
    Object(serde_json::Map<String, serde_json::Value>),
    Array(Vec<serde_json::Value>),
}

/// Fetch a Bilibili API URL and return the JSON response.
/// Only allows requests to api.bilibili.com — rejects everything else.
#[tauri::command]
pub async fn bilibili_fetch(url: String) -> Result<serde_json::Value, String> {
    if !url.starts_with("https://api.bilibili.com/") {
        return Err(format!(
            "Blocked: only api.bilibili.com URLs allowed, got: {}",
            url
        ));
    }

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(BILIBILI_UA));
    headers.insert(REFERER, HeaderValue::from_static(BILIBILI_REFERER));
    headers.insert(ORIGIN, HeaderValue::from_static("https://www.bilibili.com"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/plain, */*"));
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("zh-CN,zh;q=0.9,en;q=0.8"));
    headers.insert(
        "Cookie",
        HeaderValue::from_static("buvid3=random-buvid3-for-lyra"),
    );

    // Bilibili WBI signature — simplest form: just try without cookie first,
    // the 412 often goes away with proper Origin + Accept headers.

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("reqwest client: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Bilibili returned {}: {}", status, body.chars().take(200).collect::<String>()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("json parse: {}", e))?;

    // Don't reject on code != 0 — some endpoints (e.g. /nav) return
    // useful data even with non-zero code. Let TypeScript decide.
    Ok(json)
}
