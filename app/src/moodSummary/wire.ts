// moodSummary/wire.ts — 桌面端心情总结入口。
// 按自然日（默认昨天）取 turns → summarizeMood → MoodSummaryAgent → HTML。
// 由 /mood 命令触发，HTML 交给 WeeklyReader 展示。

import * as turnRepo from "../db/repo/turnRepo";
import * as libraryRepo from "../db/repo/libraryRepo";
import { MoodSummaryAgent, summarizeMood } from "@lyra/core";
import type { MoodSummarySong } from "@lyra/core/moodSummary/MoodSummaryAgent";
import { dayKey, dayKeyBounds, yesterdayDayKey } from "@lyra/core/daily/dayKey";
import { renderMoodSummary } from "./renderer";

/** 最多带几首当天推荐过的歌进 prompt。 */
const SONG_LIMIT = 5;

export type RunMoodSummaryOpts = {
  /** 默认昨天；传 "today" 用今天 00:00～此刻。 */
  which?: "yesterday" | "today";
};

export async function runMoodSummary(
  opts: RunMoodSummaryOpts = {},
): Promise<string | null> {
  try {
    const key =
      opts.which === "today" ? dayKey() : yesterdayDayKey();
    const { startMs, endMs } = dayKeyBounds(key);
    const end = opts.which === "today" ? Date.now() : endMs;
    const turns = await turnRepo.listTurnsBetween(startMs, end);
    if (!turns || turns.length === 0) return null;

    const data = summarizeMood(turns);
    if (!data) return null;

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
