import { describe, it, expect } from "vitest";
import { buildDailyDigest } from "./buildDailyDigest";
import { deriveConclusions } from "./deriveConclusions";
import type { ActivityEventRow } from "../db/repo/activityEventsRepo";
import type { PlaySessionRow } from "../db/repo/playSessionsRepo";

function evt(
  partial: Partial<ActivityEventRow> & { name: string },
): ActivityEventRow {
  return {
    id: partial.id ?? `e-${partial.name}`,
    ts: partial.ts ?? 1,
    day_key: partial.day_key ?? "2026-08-10",
    name: partial.name,
    song_id: partial.song_id ?? null,
    turn_id: partial.turn_id ?? null,
    props_json: partial.props_json ?? "{}",
    platform: "ios",
  };
}

function sess(
  partial: Partial<PlaySessionRow> & { song_id: string },
): PlaySessionRow {
  return {
    id: partial.id ?? `s-${partial.song_id}`,
    day_key: partial.day_key ?? "2026-08-10",
    song_id: partial.song_id,
    turn_id: null,
    source: partial.source ?? "user_input",
    started_at: partial.started_at ?? 1,
    ended_at: partial.ended_at ?? 2,
    listen_ms: partial.listen_ms ?? 120_000,
    pause_ms: 0,
    duration_ms: 200_000,
    end_reason: partial.end_reason ?? "completed",
    max_position_ms: partial.listen_ms ?? 120_000,
    seek_count: 0,
    was_background_ms: 0,
    lyrics_open_count: 0,
    under_track_lock: partial.under_track_lock ?? 0,
    lock_play_count: partial.lock_play_count ?? null,
    consecutive_repeat_index: 1,
  };
}

describe("buildDailyDigest + deriveConclusions", () => {
  it("marks sparse days", () => {
    const d = buildDailyDigest({ dayKey: "2026-08-10", events: [], sessions: [] });
    expect(d.sparse).toBe(true);
    expect(deriveConclusions(d)[0]?.id).toBe("sparse.day");
  });

  it("merges lock into top_locked when lock song is also the longest listen", () => {
    const events = [
      evt({ name: "track_lock_on", song_id: "t1", props_json: '{"play_count":1}' }),
      evt({
        name: "track_lock_loop",
        song_id: "t1",
        props_json: '{"play_count":5}',
      }),
      evt({ name: "lyra_start" }),
      evt({ name: "lyra_start" }),
    ];
    const sessions = [
      sess({
        song_id: "t1",
        source: "track_lock_loop",
        under_track_lock: 1,
        lock_play_count: 5,
        listen_ms: 200_000,
      }),
      sess({
        id: "s2",
        song_id: "t1",
        source: "track_lock_loop",
        under_track_lock: 1,
        lock_play_count: 4,
        listen_ms: 180_000,
      }),
    ];
    const d = buildDailyDigest({ dayKey: "2026-08-10", events, sessions });
    expect(d.trackLock.maxPlayCount).toBeGreaterThanOrEqual(5);
    const ids = deriveConclusions(d).map((c) => c.id);
    expect(ids).toContain("listening.top_locked");
    expect(ids).not.toContain("lock.deep");
    expect(ids).not.toContain("listening.top_track");
    expect(ids).toContain("meta.lyra_start_driven");
  });

  it("merges lock + top-track into one conclusion when they are the same song", () => {
    const events = [
      evt({ name: "track_lock_on", song_id: "guo" }),
      evt({
        name: "track_lock_loop",
        song_id: "guo",
        props_json: '{"play_count":10}',
      }),
    ];
    const sessions = [
      // unlocked fragment before lock
      sess({
        id: "s0",
        song_id: "guo",
        source: "user_input",
        under_track_lock: 0,
        lock_play_count: null,
        listen_ms: 7 * 60_000 + 23_000, // ~7m23s gap vs lock-only
      }),
      ...Array.from({ length: 10 }, (_, i) =>
        sess({
          id: `s-lock-${i}`,
          song_id: "guo",
          source: "track_lock_loop",
          under_track_lock: 1,
          lock_play_count: i + 1,
          listen_ms: 6 * 60_000 + 1_000, // ~60m10s lock total
        }),
      ),
    ];
    const d = buildDailyDigest({ dayKey: "2026-08-10", events, sessions });
    const conclusions = deriveConclusions(d);
    const ids = conclusions.map((c) => c.id);
    expect(ids).toContain("listening.top_locked");
    expect(ids).not.toContain("lock.deep");
    expect(ids).not.toContain("listening.top_track");

    const merged = conclusions.find((c) => c.id === "listening.top_locked")!;
    const evidence = merged.evidence.map((e) => e.display).join(" ");
    // One primary total; lock-only only as subordinate「其中」
    expect(evidence).toMatch(/合计约/);
    expect(evidence).toMatch(/第 10 遍/);
    expect(evidence).toMatch(/其中锁定/);
    expect(evidence).not.toMatch(/开播 10 次/);
    // Must not present two competing absolute durations without「其中」
    const absoluteDurations = evidence.match(/\d+\s*分(?:\s*\d+\s*秒)?/g) ?? [];
    expect(absoluteDurations.length).toBeLessThanOrEqual(2);
  });

  it("keeps lock.deep and top_track separate when they are different songs", () => {
    const events = [
      evt({ name: "track_lock_on", song_id: "locked" }),
      evt({
        name: "track_lock_loop",
        song_id: "locked",
        props_json: '{"play_count":4}',
      }),
    ];
    const sessions = [
      sess({
        id: "s-lock",
        song_id: "locked",
        source: "track_lock_loop",
        under_track_lock: 1,
        lock_play_count: 4,
        listen_ms: 200_000,
      }),
      sess({
        id: "s-top",
        song_id: "other",
        source: "user_input",
        under_track_lock: 0,
        listen_ms: 400_000,
      }),
    ];
    const d = buildDailyDigest({ dayKey: "2026-08-10", events, sessions });
    const ids = deriveConclusions(d).map((c) => c.id);
    expect(ids).toContain("lock.deep");
    expect(ids).toContain("listening.top_track");
    expect(ids).not.toContain("listening.top_locked");
  });
});
