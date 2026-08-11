// daily/runDaily.ts — 生成并落盘某一天的心情日报

import { listActivityEventsByDay } from "../db/repo/activityEventsRepo";
import { listPlaySessionsByDay } from "../db/repo/playSessionsRepo";
import {
  getDailySnapshot,
  upsertDailySnapshot,
} from "../db/repo/dailySnapshotsRepo";
import { getTrack } from "../db/repo/libraryRepo";
import { listTurnsBetween } from "../db/repo/turnRepo";
import { songDisplayTitle } from "../library/display";
import { DailyMoodAgent } from "../agents/DailyMoodAgent";
import { buildDailyDigest } from "./buildDailyDigest";
import { deriveConclusions } from "./deriveConclusions";
import { buildDailyMoodBrief } from "./buildDailyMoodBrief";
import { renderDailyHtml } from "./renderDailyHtml";
import { dayKeyBounds, yesterdayDayKey } from "./dayKey";

export type RunDailyResult = {
  dayKey: string;
  html: string;
  sparse: boolean;
  created: boolean;
};

export async function runDaily(opts?: {
  dayKey?: string;
  force?: boolean;
}): Promise<RunDailyResult> {
  const dayKey = opts?.dayKey ?? yesterdayDayKey();
  if (!opts?.force) {
    const existing = await getDailySnapshot(dayKey);
    // Re-render when snapshot predates the mood-letter layout.
    if (existing?.html.includes("daily-letter-v4")) {
      return {
        dayKey,
        html: existing.html,
        sparse: existing.fallback === 1,
        created: false,
      };
    }
  }

  const { startMs, endMs } = dayKeyBounds(dayKey);
  const [events, sessions, turns] = await Promise.all([
    listActivityEventsByDay(dayKey),
    listPlaySessionsByDay(dayKey),
    listTurnsBetween(startMs, endMs).catch(() => []),
  ]);
  const digest = buildDailyDigest({ dayKey, events, sessions });
  const conclusions = deriveConclusions(digest);

  const titleMap = new Map<string, string>();
  const songIds = new Set<string>([
    ...digest.listening.tracks.map((t) => t.songId),
    ...turns.map((t) => t.agent_response.song_id).filter(Boolean),
  ]);
  for (const id of songIds) {
    try {
      const track = await getTrack(id);
      if (track) titleMap.set(id, songDisplayTitle(track));
    } catch {
      /* ignore */
    }
  }
  const titleOf = (id: string) => titleMap.get(id) ?? "未知曲目";

  const brief = buildDailyMoodBrief({
    dayKey,
    digest,
    conclusions,
    turns,
    titleOf,
  });

  const agent = new DailyMoodAgent();
  const letter = await agent.write(brief);
  const html = renderDailyHtml({ dayKey, letter, brief });

  await upsertDailySnapshot({
    dayKey,
    html,
    turnCount: digest.sessionCount,
    eventCount: digest.eventCount,
    fallback: digest.sparse || letter.fallback,
  });

  return { dayKey, html, sparse: digest.sparse, created: true };
}
