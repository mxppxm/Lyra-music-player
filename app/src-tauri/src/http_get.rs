use std::time::Duration;

#[tauri::command]
pub async fn http_get_text(url: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("only https".into());
    }
    let referer = if url.contains("baidu.com") {
        "https://www.baidu.com/"
    } else if url.contains("bing.com") {
        "https://www.bing.com/"
    } else if url.contains("duckduckgo.com") {
        "https://lite.duckduckgo.com/"
    } else {
        ""
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(8))
        .user_agent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) \
             AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 \
             Mobile/15E148 Safari/604.1",
        )
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
    if !referer.is_empty() {
        req = req.header("Referer", referer);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    Ok(text)
}
