import type { DialogueTurn, PAD } from "../types";
import type { WeekWindow } from "./weeklyPaths";

export type PadPoint = { ts: number; pad: PAD };

export type WeeklySongPlayed = {
  song_id: string;
  title: string;
  artist: string | null;
  small_note: string;
  count: number;
};

export type WeeklyMomentSummary = {
  moment_id: string;
  text: string;
  kind: string;
  ts: number;
};

export type WeeklyRawData = {
  window: WeekWindow;
  turns: DialogueTurn[];
  pad_series: PadPoint[];
  salient: WeeklyMomentSummary[];
  songs_played: WeeklySongPlayed[];
  living_portrait_now: string;
  living_portrait_last_close: string | null;
};

type TurnRepoLike = { listRecentTurns: (limit?: number) => Promise<DialogueTurn[]> };
type SharedRepoLike = { listRecentSalient: (limit?: number) => Promise<Array<{ id: string; ts: number; kind: string; text: string }>> };
type LibraryRepoLike = { getById: (id: string) => Promise<{ id: string; title: string; artist: string | null; path: string } | null> };

export type CollectDeps = {
  window: WeekWindow;
  memoryText: string;
  lastPortraitAtClose: string | null;
  turnRepo: TurnRepoLike;
  sharedMemoryRepo: SharedRepoLike;
  libraryRepo: LibraryRepoLike;
};

// Wide enough to sweep 7 days of listening for reasonable session densities;
// the in-window filter happens client-side so a wide fetch is fine.
const WINDOW_FETCH_LIMIT = 2000;

export async function collectWindow(deps: CollectDeps): Promise<WeeklyRawData> {
  const startMs = Date.parse(deps.window.start);
  const endMs = Date.parse(deps.window.end);

  const allTurns = await deps.turnRepo.listRecentTurns(WINDOW_FETCH_LIMIT);
  const turns = allTurns
    .filter((t) => t.timestamp >= startMs && t.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  const pad_series: PadPoint[] = turns.map((t) => ({
    ts: t.timestamp,
    pad: t.current_emotion.pad,
  }));

  const allSalient = await deps.sharedMemoryRepo.listRecentSalient(WINDOW_FETCH_LIMIT);
  const salient: WeeklyMomentSummary[] = allSalient
    .filter((m) => m.ts >= startMs && m.ts <= endMs)
    .map((m) => ({ moment_id: m.id, text: m.text, kind: m.kind, ts: m.ts }));

  const songs_played = await gatherSongs(turns, deps.libraryRepo);

  return {
    window: deps.window,
    turns,
    pad_series,
    salient,
    songs_played,
    living_portrait_now: parseLivingPortrait(deps.memoryText),
    living_portrait_last_close: deps.lastPortraitAtClose,
  };
}

async function gatherSongs(
  turns: DialogueTurn[],
  libraryRepo: LibraryRepoLike,
): Promise<WeeklySongPlayed[]> {
  const buckets = new Map<string, { count: number; latestTs: number; small_note: string }>();
  for (const t of turns) {
    const id = t.agent_response.song_id;
    if (!id) continue;
    const prev = buckets.get(id);
    if (!prev || t.timestamp > prev.latestTs) {
      buckets.set(id, {
        count: (prev?.count ?? 0) + 1,
        latestTs: t.timestamp,
        small_note: t.agent_response.rationale ?? "",
      });
    } else {
      buckets.set(id, { ...prev, count: prev.count + 1 });
    }
  }
  const out: WeeklySongPlayed[] = [];
  for (const [song_id, agg] of buckets) {
    const meta = await libraryRepo.getById(song_id);
    out.push({
      song_id,
      title: meta?.title ?? song_id,
      artist: meta?.artist ?? null,
      small_note: agg.small_note,
      count: agg.count,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

// Extract the paragraph(s) under a "## Living Portrait" section from raw
// memory.md text. Empty string if the section is missing — first-week case.
function parseLivingPortrait(md: string): string {
  const lines = md.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^##\s+Living Portrait\b/.test(l));
  if (startIdx < 0) return "";
  const rest = lines.slice(startIdx + 1);
  const endRel = rest.findIndex((l) => /^##\s+/.test(l));
  const body = endRel < 0 ? rest : rest.slice(0, endRel);
  return body.join("\n").trim();
}
