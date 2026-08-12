import type { LibraryTrack } from "../types";
import * as libraryRepo from "../db/repo/libraryRepo";
import { unwrapBookTitle } from "./parseTrackIdentity";
import { bilibiliTrackToLibrary } from "./bilibiliTrackToLibrary";

export type SongIntentResult =
  | { kind: "song"; song: LibraryTrack; source: "local" | "bilibili" }
  | { kind: "mood"; reason?: string };

/** Explicit ♪ search — never falls back to mood. */
export type StrictSongSearchResult =
  | { kind: "song"; song: LibraryTrack; source: "local" | "bilibili" }
  | { kind: "miss"; reason: string };

/**
 * Try to resolve a user utterance as a song-name request.
 *
 * Priorities:
 * 1. Text contains 《…》 → always treat as song intent, extract book title
 * 2. Short plain text (2–25 chars, no obvious mood/function words) → title match
 * 3. Local library miss → Bilibili search fallback (persist hit to library)
 * 4. Bilibili miss/failure → mood
 */
export async function resolveSongIntent(
  text: string,
): Promise<SongIntentResult> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "mood", reason: "empty input" };

  // ── 1) 《》 mandatory song intent ──────────────────────────────
  const book = trimmed.match(/《([^》]+)》/);
  if (book) {
    const candidate = book[1].trim();
    if (candidate.length < 1) return { kind: "mood", reason: "empty book title" };
    const local = await libraryRepo.findByTitle([candidate]);
    if (local.length > 0) return { kind: "song", song: local[0], source: "local" };
    const bili = await searchBilibiliForSong(candidate);
    if (bili) return { kind: "song", song: bili, source: "bilibili" };
    return { kind: "mood", reason: `no local/B站 match for 《${candidate}》` };
  }

  // ── 2) Short plain text heuristic ──────────────────────────────
  // 只认本地命中：日常短输入（"你好"「晚安」等）极可能不是点歌，本地
  // 未命中就直接回落情绪管道，绝不发 B 站请求——否则 iOS 真机上每次
  // 普通输入都会被劫持成点歌，卡在 B 站搜索（45s 超时）十几秒。
  if (isLikelySongName(trimmed)) {
    const { song } = unwrapBookTitle(trimmed);
    const candidates = [trimmed, song].filter(
      (s): s is string => typeof s === "string" && s.length >= 2,
    );
    const local = await libraryRepo.findByTitle(candidates);
    if (local.length > 0) return { kind: "song", song: local[0], source: "local" };
    // 本地未命中 → 不是明确点歌，回落 mood
    return { kind: "mood", reason: "short text, no local match" };
  }

  return { kind: "mood", reason: "not a song-name pattern" };
}

/**
 * Explicit song search (♪ mode): local includes first, then open Bilibili
 * search by play count (no studio channel keyword). Never returns mood.
 */
export async function resolveStrictSongSearch(
  text: string,
): Promise<StrictSongSearchResult> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "miss", reason: "empty input" };

  const book = trimmed.match(/《([^》]+)》/);
  const candidate = (book?.[1] ?? trimmed).trim();
  if (candidate.length < 1) return { kind: "miss", reason: "empty title" };

  const local = await libraryRepo.findByTitle([candidate, trimmed].filter(
    (s, i, arr) => s.length >= 2 && arr.indexOf(s) === i,
  ));
  if (local.length > 0) {
    return { kind: "song", song: local[0], source: "local" };
  }

  const bili = await searchBilibiliOpenForSong(candidate);
  if (bili) return { kind: "song", song: bili, source: "bilibili" };
  return { kind: "miss", reason: `no local/B站 match for ${candidate}` };
}

/**
 * Bilibili fallback for a song request — always searches within the
 * 百万豪装录音棚 channel, appending the song title via forceKeyword so a
 * local miss still lands on the requested song instead of an arbitrary
 * channel upload. Persists it so future requests hit locally. Returns null
 * on empty / failure.
 */
async function searchBilibiliForSong(
  title: string,
): Promise<LibraryTrack | null> {
  try {
    const { searchBilibili } = await import("../bilibili/api");
    // 始终限定在「百万豪装录音棚」频道内按歌名搜（forceKeyword）——
    // 避免 hint 判断退化导致结果与歌名无关。
    const { tracks } = await searchBilibili(
      "百万豪装录音棚",
      5,
      `百万豪装录音棚 ${title}`,
    );
    if (tracks.length === 0) return null;

    const track = bilibiliTrackToLibrary(tracks[0]);
    // Persist so the next request hits the local library fast.
    try {
      await libraryRepo.batchInsertTracks([track]);
    } catch (err) {
      console.warn("[lyra] persist Bilibili song into library failed:", err);
    }
    return track;
  } catch (err) {
    console.warn("[lyra] Bilibili song search failed:", err);
    return null;
  }
}

/** Open Bilibili search by play count — no channel scope. Persist on hit. */
async function searchBilibiliOpenForSong(
  title: string,
): Promise<LibraryTrack | null> {
  try {
    const { searchBilibiliByPlayCount } = await import("../bilibili/api");
    const { tracks } = await searchBilibiliByPlayCount(title, 5);
    if (tracks.length === 0) return null;
    const track = bilibiliTrackToLibrary(tracks[0]);
    try {
      await libraryRepo.batchInsertTracks([track]);
    } catch (err) {
      console.warn("[lyra] persist open Bilibili song into library failed:", err);
    }
    return track;
  } catch (err) {
    console.warn("[lyra] open Bilibili song search failed:", err);
    return null;
  }
}

// ── Heuristic: is this likely a song name, not a mood expression? ──
const MOOD_PATTERNS =
  /^(有点|很|好|非常|特别|真的|有点|还|也|挺|蛮|最近|今天|我现在|我想|感觉|心情|状态|随便|算了|点|播|放|来|给|帮)/;
const FUNCTION_WORDS =
  /^(来|放|播|点|给|帮|换个|换一首|下一首|切|跳过|继续|再|开始|停|暂停|播放)/;

function isLikelySongName(text: string): boolean {
  // 《》 already handled — single char or too long is unlikely a song name
  if (text.length < 2 || text.length > 25) return false;
  // Contains Chinese mood/function prefixes
  if (MOOD_PATTERNS.test(text)) return false;
  if (FUNCTION_WORDS.test(text)) return false;
  // Contains multiple spaces or obvious mood keywords
  if (text.includes(" ") && text.length > 8) return false;
  // Looks like a sentence
  if (/[，。！？、；：""''（）【】]/.test(text)) return false;
  return true;
}
