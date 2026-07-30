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

import { searchBilibili, enrichTracksWithAudio } from "../bilibili/api";
import { getOrAnalyzeFeatures } from "../bilibili/audioFeatures";
import { MusicProfileAgent } from "../agents/MusicProfileAgent";
import { buildProfileAnalyzeInput } from "../agents/buildProfileAnalyzeInput";
import { bilibiliTrackToLibrary } from "../library/bilibiliTrackToLibrary";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as musicProfileRepo from "../db/repo/musicProfileRepo";
import { profileNeedsRefresh } from "../types/musicProfile";

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

export async function precomputeAll(
  onProgress: (p: PrecomputeProgress) => void,
): Promise<PrecomputeResult> {
  const result: PrecomputeResult = { tracks: 0, features: 0, profiles: 0 };

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
  const allMetadata = tracks.map((t) => bilibiliTrackToLibrary(t));
  const n = await libraryRepo.batchInsertTracks(allMetadata);
  console.log(`[precompute] synced ${n} track metadata`);

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

  onProgress({
    phase: "profiles",
    current: 0,
    total: tracks.length,
    detail: "生成音乐画像...",
  });
  const profileAgent = new MusicProfileAgent();
  const existingMap = await musicProfileRepo.getBatch(
    tracks.map((t) => `bili:${t.bvid}`),
  );
  const need = tracks.filter((t) =>
    profileNeedsRefresh(existingMap.get(`bili:${t.bvid}`)),
  );

  for (let i = 0; i < need.length; i++) {
    const t = need[i];
    try {
      const profileInput = buildProfileAnalyzeInput({
        title: t.title,
        artist: t.author,
        tag: t.tag,
      });
      const profile = await profileAgent.analyze(profileInput);
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
