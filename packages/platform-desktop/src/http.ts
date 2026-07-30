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
