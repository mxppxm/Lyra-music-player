// db/repo/musicProfileRepo.ts — LLM 音乐画像 CRUD

import { getDb } from "../client";
import type { MusicProfile, TrackFeedback } from "../../types/musicProfile";

type Row = {
  track_id: string;
  analyzed_at: number;
  llm_model: string | null;
  profile_json: string;
};

export async function upsert(profile: MusicProfile): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO music_profiles (track_id, analyzed_at, llm_model, profile_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       analyzed_at = excluded.analyzed_at,
       llm_model = excluded.llm_model,
       profile_json = excluded.profile_json`,
    [profile.track_id, profile.analyzed_at, profile.llm_model ?? null, JSON.stringify(profile)],
  );
}

export async function getByTrackId(id: string): Promise<MusicProfile | null> {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT track_id, analyzed_at, llm_model, profile_json FROM music_profiles WHERE track_id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  return JSON.parse(rows[0].profile_json) as MusicProfile;
}

export async function getBatch(ids: string[]): Promise<Map<string, MusicProfile>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.select<Row[]>(
    `SELECT track_id, analyzed_at, llm_model, profile_json
     FROM music_profiles WHERE track_id IN (${placeholders})`,
    ids,
  );
  const out = new Map<string, MusicProfile>();
  for (const r of rows) {
    out.set(r.track_id, JSON.parse(r.profile_json) as MusicProfile);
  }
  return out;
}

/** Check which track_ids already have profiles */
export async function hasProfiles(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.select<{ track_id: string }[]>(
    `SELECT track_id FROM music_profiles WHERE track_id IN (${placeholders})`,
    ids,
  );
  return new Set(rows.map(r => r.track_id));
}

// ── Track Feedback ──────────────────────────────────────────────────────────

type FeedbackRow = {
  id: string;
  track_id: string;
  turn_id: string;
  reaction: string;
  timestamp: number;
  emotion_delta_json: string;
};

export async function insertFeedback(fb: TrackFeedback): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO track_feedback (id, track_id, turn_id, reaction, timestamp, emotion_delta_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      fb.track_id,
      fb.turn_id,
      fb.reaction,
      fb.timestamp,
      JSON.stringify(fb.emotion_delta),
    ],
  );
}

export async function getFeedbackForTrack(track_id: string): Promise<TrackFeedback[]> {
  const db = await getDb();
  const rows = await db.select<FeedbackRow[]>(
    `SELECT id, track_id, turn_id, reaction, timestamp, emotion_delta_json
     FROM track_feedback WHERE track_id = ? ORDER BY timestamp DESC`,
    [track_id],
  );
  return rows.map(r => ({
    track_id: r.track_id,
    turn_id: r.turn_id,
    reaction: r.reaction as TrackFeedback["reaction"],
    timestamp: r.timestamp,
    emotion_delta: JSON.parse(r.emotion_delta_json),
  }));
}

/** Count feedback by reaction type for a set of tracks. Returns aggregated counts. */
export async function getFeedbackStats(
  trackIds: string[],
): Promise<Map<string, { completed: number; skipped: number; repeated: number }>> {
  if (trackIds.length === 0) return new Map();
  const db = await getDb();
  const placeholders = trackIds.map(() => "?").join(",");

  // Query total counts per track
  const rows = await db.select<
    { track_id: string; reaction: string; cnt: number }[]
  >(
    `SELECT track_id, reaction, COUNT(*) as cnt
     FROM track_feedback
     WHERE track_id IN (${placeholders})
     GROUP BY track_id, reaction`,
    trackIds,
  );

  const out = new Map<string, { completed: number; skipped: number; repeated: number }>();
  for (const r of rows) {
    let entry = out.get(r.track_id);
    if (!entry) {
      entry = { completed: 0, skipped: 0, repeated: 0 };
      out.set(r.track_id, entry);
    }
    if (r.reaction === "completed") entry.completed = r.cnt;
    else if (r.reaction === "skipped") entry.skipped = r.cnt;
    else if (r.reaction === "repeated") entry.repeated = r.cnt;
  }
  return out;
}
