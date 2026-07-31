import { CapacitorHttp } from "@capacitor/core";

const BILI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  Referer: "https://www.bilibili.com/",
  Origin: "https://www.bilibili.com",
  Accept: "application/json, text/plain, */*",
  Cookie: "buvid3=random-buvid3-for-lyra",
};

export async function iosFetchJson(url: string): Promise<unknown> {
  if (!url.startsWith("https://api.bilibili.com/")) {
    throw new Error(`Blocked URL: ${url}`);
  }
  const res = await CapacitorHttp.get({ url, headers: BILI_HEADERS });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const json = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (json.code !== 0) throw new Error(json.message ?? "bilibili error");
  return json.data ?? json;
}
