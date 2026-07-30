/**
 * Bilibili API client — search music videos and extract audio stream URLs.
 *
 * All HTTP requests go through the Tauri Rust backend (`bilibili_fetch`)
 * to bypass CORS restrictions in the WebView.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BilibiliTrack {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  author: string;
  duration: string;
  duration_ms: number;
  cover: string;
  tag: string;
  play_count: number;
}

export interface BilibiliSearchResult {
  tracks: BilibiliTrack[];
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDuration(dur: string): number {
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return 0;
}

/** Fetch via Rust proxy. Returns data field only (proxy already checked code==0). */
async function biliGet(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.bilibili.com${path}?${qs}`;
  const json = await invoke<any>("bilibili_fetch", { url });
  return json.data ?? json;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * 搜索 B 站"百万豪装录音棚"系列歌曲。
 * 使用搜索 API（/x/web-interface/search/type），不需要 WBI 签名，
 * 从海外也能正常访问。
 */
export async function searchBilibili(
  _query: string,
  limit = 200,
): Promise<BilibiliSearchResult> {
  const seen = new Set<string>();
  const tracks: BilibiliTrack[] = [];

  // 用"百万豪装录音棚"锁定 JLRS-LeoFM 的高品质音源
  // 不做关键词拼接 — 用户的情绪描述和视频标题不匹配，
  // 全量拉取后由 LibraryAgent 的 PAD 打分做精选
  const searchKeyword = "百万豪装录音棚";

  // 10 页 ≈ 200 个视频，扩大曲库减少重复
  const MAX_PAGES = 10;
  const pageDatas = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      biliGet("/x/web-interface/search/type", {
        search_type: "video",
        keyword: searchKeyword,
        order: "pubdate",
        page: String(i + 1),
      }),
    ),
  );

  for (const data of pageDatas) {
    const results: any[] = data?.result ?? [];
    for (const r of results) {
      const bvid = String(r.bvid ?? "");
      if (seen.has(bvid)) continue;
      seen.add(bvid);

      const title = String(r.title ?? "")
        .replace(/<em[^>]*>/g, "").replace(/<\/em>/g, "");
      const durStr = String(r.duration ?? "0:00");
      const durMs = parseDuration(durStr);

      // 时长过滤：1.5-10 分钟
      if (durMs < 90_000 || durMs > 600_000) continue;

      tracks.push({
        bvid,
        aid: Number(r.aid ?? 0),
        cid: 0,
        title,
        author: String(r.author ?? ""),
        duration: durStr,
        duration_ms: durMs,
        cover: String(r.pic ?? ""),
        tag: String(r.tag ?? ""),
        play_count: Number(r.play ?? 0),
      });
    }
    if (tracks.length >= limit) break;
  }

  return {
    tracks: tracks.slice(0, limit),
    total: tracks.length,
  };
}

export async function getVideoCid(bvid: string): Promise<number> {
  const data = await biliGet("/x/web-interface/view", { bvid });
  return data.cid ?? data.pages?.[0]?.cid ?? 0;
}

export async function getAudioUrl(bvid: string, cid: number): Promise<string | null> {
  const data = await biliGet("/x/player/playurl", {
    bvid,
    cid: String(cid),
    fnval: "16",
    qn: "64",
    fourk: "1",
  });

  const dash = data?.dash;
  if (!dash) return null;

  const audioStreams: any[] = dash.audio ?? [];
  if (audioStreams.length === 0) return null;

  audioStreams.sort((a: any, b: any) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return audioStreams[0].baseUrl ?? audioStreams[0].base_url ?? audioStreams[0].url ?? null;
}

export async function enrichTracksWithAudio(
  tracks: BilibiliTrack[],
): Promise<(BilibiliTrack & { audioUrl: string | null })[]> {
  return await Promise.all(
    tracks.map(async (track) => {
      try {
        if (track.cid === 0) track.cid = await getVideoCid(track.bvid);
        const audioUrl = await getAudioUrl(track.bvid, track.cid);
        return { ...track, audioUrl };
      } catch (err) {
        console.warn(`[bilibili] enrich failed for ${track.bvid}:`, err);
        return { ...track, audioUrl: null };
      }
    }),
  );
}
