import { invoke } from "@tauri-apps/api/core";

export async function desktopFetchJson(
  url: string,
  _init?: RequestInit,
): Promise<unknown> {
  if (!url.startsWith("https://api.bilibili.com/")) {
    throw new Error(`Blocked URL: ${url}`);
  }
  return invoke("bilibili_fetch", { url });
}

export async function desktopFetchText(url: string): Promise<string> {
  let href = url;
  try {
    href = new URL(url).toString();
  } catch {
    href = url;
  }
  if (!href.startsWith("https://")) {
    throw new Error("only https");
  }
  return invoke<string>("http_get_text", { url: href });
}
