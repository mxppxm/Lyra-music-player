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
 *
 * `forceKeyword`：可选，提供时直接用该词搜索（跳过 hint 判断）。
 * 用于歌名点播等场景，保证永远限定在频道内按歌名搜——
 * 否则 hint 判断对长歌名/含空格/含"累烦有点"等词的歌名会退化为
 * 只搜频道名（结果与歌名无关）。
 */
export async function searchBilibili(
  query: string,
  limit = 200,
  forceKeyword?: string,
): Promise<BilibiliSearchResult> {
  const seen = new Set<string>();
  const tracks: BilibiliTrack[] = [];

  // Default: JLRS-LeoFM studio channel. When query is a short hint (e.g. artist
  // name from an artist session), narrow the Bilibili search.
  const hint = query.replace(/\s+/g, " ").trim();
  const useHint =
    hint.length >= 2 &&
    hint.length <= 12 &&
    !hint.includes(" ") &&
    !/有点|累|烦|延续|lyra/i.test(hint);
  const searchKeyword =
    forceKeyword ?? (useHint ? `百万豪装录音棚 ${hint}` : "百万豪装录音棚");

  // 10 页 ≈ 200 个视频，扩大曲库减少重复
  const MAX_PAGES = 10;
  const pageResults = await Promise.allSettled(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      biliGet("/x/web-interface/search/type", {
        search_type: "video",
        keyword: searchKeyword,
        order: "pubdate",
        page: String(i + 1),
      }),
    ),
  );

  for (const page of pageResults) {
    if (page.status !== "fulfilled") {
      console.warn("[bilibili] search page failed:", page.reason);
      continue;
    }
    const data = page.value;
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
