/**
 * Bilibili API client — search music videos and extract audio stream URLs.
 *
 * All HTTP requests go through the Tauri Rust backend (`bilibili_fetch`)
 * to bypass CORS restrictions in the WebView.
 */

import { getLyraPlatform } from "@lyra/platform";

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

/** Fetch via platform HTTP. Returns data field only. */
async function biliGet(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.bilibili.com${path}?${qs}`;
  const json = (await getLyraPlatform().fetchJson(url)) as any;
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

/**
 * Bilibili's playurl ranks P2P "mcdn" nodes first by bandwidth, but those
 * nodes routinely lose the resource (~1/3 of tracks 404 on the preferred
 * URL). The official upos-sz CDN mirrors in backupUrl are stable, so
 * demote mcdn candidates to last resort. Verified 2026-08: every mcdn
 * failure sampled had a working upos backup.
 */
function pickStableUrl(candidates: string[]): string | null {
  const urls = candidates.filter((u) => typeof u === "string" && u.length > 0);
  if (urls.length === 0) return null;
  const stable = urls.filter((u) => !u.includes("mcdn.bilivideo.cn"));
  return stable[0] ?? urls[0];
}

/**
 * Primary source: the legacy "durl" whole-file MP4 stream (qn=32, ~5 MB per
 * song). Standard moov-first MP4 with h264+AAC on official upos nodes — the
 * most AVPlayer-compatible source bilibili offers. Falls back to DASH audio
 * for videos where durl isn't MP4 (ancient FLV uploads).
 */
export async function getAudioUrl(bvid: string, cid: number): Promise<string | null> {
  const durlUrl = await getDurlStreamUrl(bvid, cid);
  if (durlUrl) return durlUrl;
  return getDashAudioUrl(bvid, cid);
}

async function getDurlStreamUrl(bvid: string, cid: number): Promise<string | null> {
  try {
    const data = await biliGet("/x/player/playurl", {
      bvid,
      cid: String(cid),
      qn: "32",
      platform: "pc",
    });
    const format = String(data?.format ?? "");
    if (!format.includes("mp4")) return null; // flv360 etc. — unplayable
    const durl: any[] = data?.durl ?? [];
    if (durl.length === 0) return null;
    return pickStableUrl([durl[0].url, ...(durl[0].backup_url ?? [])]);
  } catch {
    return null;
  }
}

async function getDashAudioUrl(bvid: string, cid: number): Promise<string | null> {
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

  // Dolby tracks (ac-3/ec-3) can outrank AAC by bandwidth, but AVPlayer
  // chokes on them in bilibili's fMP4 containers (-11828 / -12847). AAC-LC
  // (mp4a) plays everywhere, desktop and iOS alike.
  const aacStreams = audioStreams.filter((s: any) =>
    String(s.codecs ?? "").startsWith("mp4a"),
  );
  const pool = aacStreams.length > 0 ? aacStreams : audioStreams;
  pool.sort((a: any, b: any) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  const best = pool[0];
  return pickStableUrl([
    best.baseUrl ?? best.base_url ?? best.url,
    ...(best.backupUrl ?? best.backup_url ?? []),
  ]);
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
