import { CapacitorHttp } from "@capacitor/core";

const BILI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Referer: "https://www.bilibili.com/",
  Origin: "https://www.bilibili.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Cookie: "buvid3=random-buvid3-for-lyra",
};

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

function searchHeadersFor(url: string): Record<string, string> {
  const headers: Record<string, string> = { ...SEARCH_HEADERS };
  try {
    const host = new URL(url).hostname;
    if (host.includes("baidu.com")) headers.Referer = "https://www.baidu.com/";
    else if (host.includes("bing.com")) headers.Referer = "https://www.bing.com/";
    else if (host.includes("duckduckgo.com")) {
      headers.Referer = "https://lite.duckduckgo.com/";
    }
  } catch {
    /* keep defaults */
  }
  return headers;
}

export async function iosFetchText(url: string): Promise<string> {
  let href = url;
  try {
    href = new URL(url).toString();
  } catch {
    href = url;
  }
  if (!href.startsWith("https://")) {
    throw new Error("only https");
  }
  const res = await CapacitorHttp.get({
    url: href,
    headers: searchHeadersFor(href),
    connectTimeout: 15_000,
    readTimeout: 15_000,
    responseType: "text",
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (typeof res.data === "string") return res.data;
  if (res.data == null) return "";
  return JSON.stringify(res.data);
}

export async function iosFetchJson(url: string): Promise<unknown> {
  if (!url.startsWith("https://api.bilibili.com/")) {
    throw new Error(`Blocked URL: ${url}`);
  }
  const res = await CapacitorHttp.get({ url, headers: BILI_HEADERS });
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}`);
  }
  const raw = res.data;
  if (typeof raw === "string") {
    if (raw.trimStart().startsWith("<!DOCTYPE") || raw.trimStart().startsWith("<html")) {
      throw new Error("Bilibili returned HTML (blocked or captcha)");
    }
  }
  const json = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof json !== "object" || json === null) {
    throw new Error("Bilibili returned non-JSON");
  }
  const code = (json as { code?: number }).code;
  if (code !== undefined && code !== 0) {
    throw new Error((json as { message?: string }).message ?? `bilibili error ${code}`);
  }
  return (json as { data?: unknown }).data ?? json;
}
