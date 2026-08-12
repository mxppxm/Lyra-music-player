// daily/runDaily.ts — 生成并落盘某一天的按日心情总结

import { listActivityEventsByDay } from "../db/repo/activityEventsRepo";
import { listPlaySessionsByDay } from "../db/repo/playSessionsRepo";
import {
  getDailySnapshot,
  upsertDailySnapshot,
} from "../db/repo/dailySnapshotsRepo";
import { getTrack } from "../db/repo/libraryRepo";
import { listTurnsBetween } from "../db/repo/turnRepo";
import { songDisplayTitle } from "../library/display";
import { MoodSummaryAgent } from "../moodSummary/MoodSummaryAgent";
import { buildDailyDigest } from "./buildDailyDigest";
import { deriveConclusions } from "./deriveConclusions";
import { buildDayMoodBrief } from "./buildDayMoodBrief";
import { renderDayMoodHtml } from "./renderDayMoodHtml";
import { dayKeyBounds, dayKey as todayDayKey, yesterdayDayKey } from "./dayKey";

export type RunDailyResult = {
  dayKey: string;
  html: string;
  sparse: boolean;
  created: boolean;
};

const LAYOUT_MARK = "day-mood-v2";

export async function runDaily(opts?: {
  dayKey?: string;
  force?: boolean;
}): Promise<RunDailyResult> {
  const dayKey = opts?.dayKey ?? yesterdayDayKey();
  if (!opts?.force) {
    const existing = await getDailySnapshot(dayKey);
    if (existing?.html.includes(LAYOUT_MARK)) {
      return {
        dayKey,
        html: existing.html,
        sparse: existing.fallback === 1,
        created: false,
      };
    }
  }

  const { startMs, endMs } = dayKeyBounds(dayKey);
  // 「今天」只结算到此刻，避免把尚未发生的时段写进简报。
  const turnEndMs = dayKey === todayDayKey() ? Math.min(endMs, Date.now()) : endMs;
  const [events, sessions, turns] = await Promise.all([
    listActivityEventsByDay(dayKey),
    listPlaySessionsByDay(dayKey),
    listTurnsBetween(startMs, turnEndMs).catch(() => []),
  ]);
  const digest = buildDailyDigest({ dayKey, events, sessions });
  const conclusions = deriveConclusions(digest);

  const titleMap = new Map<string, string>();
  const artistMap = new Map<string, string | null>();
  const songIds = new Set<string>([
    ...digest.listening.tracks.map((t) => t.songId),
    ...turns.map((t) => t.agent_response.song_id).filter(Boolean),
  ]);
  for (const id of songIds) {
    try {
      const track = await getTrack(id);
      if (track) {
        titleMap.set(id, songDisplayTitle(track));
        artistMap.set(id, track.artist ?? null);
      }
    } catch {
      /* ignore */
    }
  }
  const titleOf = (id: string) => titleMap.get(id) ?? "未知曲目";
  const artistOf = (id: string) => artistMap.get(id) ?? null;

  const brief = buildDayMoodBrief({
    dayKey,
    digest,
    conclusions,
    turns,
    titleOf,
    artistOf,
  });

  const agent = new MoodSummaryAgent();
  const summary = await agent.summarizeDay(brief);
  const html = renderDayMoodHtml({ brief, summary });

  await upsertDailySnapshot({
    dayKey,
    html,
    turnCount: turns.length || digest.sessionCount,
    eventCount: digest.eventCount,
    fallback: brief.sparse || summary.fallback,
  });

  return { dayKey, html, sparse: brief.sparse, created: true };
}
