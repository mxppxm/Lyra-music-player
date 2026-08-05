// moodSummary/wire.ts — 桌面端心情总结入口。
// 收集最近 turns → core 数据层统计 → MoodSummaryAgent 生成文案 → 渲染 HTML。
// 由 /mood 命令触发，HTML 交给 App shell 的 WeeklyReader 展示（同一 iframe 阅读器）。

import * as turnRepo from "../db/repo/turnRepo";
import * as libraryRepo from "../db/repo/libraryRepo";
import { MoodSummaryAgent, summarizeMood } from "@lyra/core";
import type { MoodSummarySong } from "@lyra/core/moodSummary/MoodSummaryAgent";
import { renderMoodSummary } from "./renderer";

/** 最近多少轮对话纳入总结。 */
const TURN_LIMIT = 60;
/** 最多带几首最近推荐过的歌进 prompt。 */
const SONG_LIMIT = 5;

export async function runMoodSummary(): Promise<string | null> {
  try {
    const turns = await turnRepo.listRecentTurns(TURN_LIMIT);
    if (!turns || turns.length === 0) return null;

    const data = summarizeMood(turns);
    if (!data) return null;

    // 最近推荐过的歌（去重，按时间倒序取前 SONG_LIMIT 首）。
    const songs: MoodSummarySong[] = [];
    const seen = new Set<string>();
    for (const t of [...turns].reverse()) {
      const id = t.agent_response?.song_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const track = await libraryRepo.getTrack(id);
      songs.push({
        song_id: id,
        title: track?.title ?? id,
        artist: track?.artist ?? null,
      });
      if (songs.length >= SONG_LIMIT) break;
    }

    const agent = new MoodSummaryAgent();
    const summary = await agent.summarize({ data, songs });
    return renderMoodSummary({ data, summary });
  } catch (e) {
    console.error("[moodSummary] runMoodSummary error:", e);
    return null;
  }
}
