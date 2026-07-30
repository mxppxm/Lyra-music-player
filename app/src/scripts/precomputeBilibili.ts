/**
 * Bilibili 全量预计算脚本
 *
 * 一次性跑通完整管线：
 *   1. 拉全部 ~1800 首元数据 → SQLite
 *   2. 逐首下载音频 → 提取 PAD 特征 → lyra-audio-features.json
 *   3. 逐首调 LLM → 生成 MusicProfile → music_profiles 表
 *
 * 跑完后数据打进 app 包，用户安装即用，无需二次分析。
 *
 * 使用方式（开发环境 Tauri 下）：
 *   import { precomputeAll } from "./scripts/precomputeBilibili";
 *   await precomputeAll((p) => console.log(p));
 */

import { searchBilibili, enrichTracksWithAudio, BilibiliTrack } from "../bilibili/api";
import { getOrAnalyzeFeatures } from "../bilibili/audioFeatures";
import { MusicProfileAgent } from "../agents/MusicProfileAgent";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as musicProfileRepo from "../db/repo/musicProfileRepo";
import type { LibraryTrack } from "../types";

export interface PrecomputeProgress {
  phase: "metadata" | "features" | "profiles" | "done";
  current: number;
  total: number;
  detail?: string;
}

export interface PrecomputeResult {
  tracks: number;
  features: number;
  profiles: number;
}


function trackToLibrary(
  t: BilibiliTrack,
  featureCache: Record<string, unknown>,
): LibraryTrack {
  return {
    id: `bili:${t.bvid}`,
    title: t.title,
    artist: t.author || undefined,
    album: undefined,
    path: `bili:__pending__:${t.bvid}`,
    duration_ms: t.duration_ms,
    origin: "web" as const,
    added_at: Date.now(),
    metadata: {
      bvid: t.bvid,
      aid: t.aid,
      tag: t.tag,
      cover: t.cover,
      play_count: t.play_count,
      ...(featureCache[t.bvid]
        ? { audio_features: featureCache[t.bvid] }
        : {}),
    },
  };
}

export async function precomputeAll(
  onProgress: (p: PrecomputeProgress) => void,
): Promise<PrecomputeResult> {
  const result: PrecomputeResult = { tracks: 0, features: 0, profiles: 0 };

  // Phase 1 — metadata
  onProgress({ phase: "metadata", current: 0, total: 0, detail: "拉取歌单..." });
  const { tracks } = await searchBilibili("", 9999);
  result.tracks = tracks.length;
  onProgress({
    phase: "metadata",
    current: tracks.length,
    total: tracks.length,
    detail: `歌单: ${tracks.length} 首`,
  });
  if (tracks.length === 0) {
    onProgress({ phase: "done", current: 0, total: 0 });
    return result;
  }
  const allMetadata = tracks.map((t) => trackToLibrary(t, {}));
  const n = await libraryRepo.batchInsertTracks(allMetadata);
  console.log(`[precompute] synced ${n} track metadata`);

  // Phase 2 — audio features (batch enrich → FFT)
  onProgress({
    phase: "features",
    current: 0,
    total: tracks.length,
    detail: "提取音频特征...",
  });
  const BATCH = 10;
  for (let off = 0; off < tracks.length; off += BATCH) {
    const batch = tracks.slice(off, off + BATCH);
    const enriched = await enrichTracksWithAudio(batch);
    const withUrl = enriched.filter((t) => t.audioUrl);
    for (const t of withUrl) {
      try {
        await getOrAnalyzeFeatures(t.bvid, t.audioUrl!);
        result.features++;
      } catch (e) {
        console.warn(`[precompute] feature fail ${t.bvid}:`, e);
      }
    }
    onProgress({
      phase: "features",
      current: Math.min(off + BATCH, tracks.length),
      total: tracks.length,
      detail: `特征: ${result.features}/${tracks.length}`,
    });
  }

  // Phase 3 — LLM MusicProfile
  onProgress({
    phase: "profiles",
    current: 0,
    total: tracks.length,
    detail: "生成音乐画像...",
  });
  const profileAgent = new MusicProfileAgent();
  const { hasProfiles } = await import("../db/repo/musicProfileRepo");
  const existing = await hasProfiles(tracks.map((t) => `bili:${t.bvid}`));
  const need = tracks.filter((t) => !existing.has(`bili:${t.bvid}`));

  for (let i = 0; i < need.length; i++) {
    const t = need[i];
    try {
      const profile = await profileAgent.analyze({
        title: t.title,
        artist: t.author || undefined,
      });
      if (profile) {
        profile.track_id = `bili:${t.bvid}`;
        await musicProfileRepo.upsert(profile);
        result.profiles++;
      }
    } catch (e) {
      console.warn(`[precompute] profile fail ${t.bvid}:`, e);
    }
    if (i % 10 === 0 || i === need.length - 1) {
      onProgress({
        phase: "profiles",
        current: result.profiles,
        total: need.length,
        detail: `画像: ${result.profiles}/${need.length}`,
      });
    }
  }

  onProgress({
    phase: "done",
    current: tracks.length,
    total: tracks.length,
    detail: `完成: ${result.tracks} 首, ${result.features} 特征, ${result.profiles} 画像`,
  });
  return result;
}
