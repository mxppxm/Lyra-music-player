/**
 * Sprint 1a T6 — acceptance smoke test
 *
 * Exercises the full T1-codec → T2-repo → T3-invalidateDb pipeline through a
 * stateful Map-backed fake DB, proving the plumbing is connected before Sprint 1b.
 *
 * agent_id used throughout: lyra_001
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stateful fake DB
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * Minimal SQL-fake that understands the subset of statements the repos emit:
 *   INSERT INTO <table> (<cols>) VALUES (?, ?, …)
 *   INSERT … ON CONFLICT(…) DO UPDATE SET …
 *   SELECT <cols> FROM <table> [WHERE <col> = ?] [ORDER BY <col> ASC|DESC] [LIMIT ?]
 *   SELECT COUNT(*) as n FROM <table>
 */
class FakeDb {
  private tables = new Map<string, Row[]>();

  private getTable(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId: number }> {
    const normalized = sql.replace(/\s+/g, " ").trim();

    // INSERT … ON CONFLICT … DO UPDATE  →  upsert
    const isUpsert = /ON CONFLICT/i.test(normalized);

    // Extract table name
    const tableMatch = normalized.match(/INTO\s+(\w+)/i);
    if (!tableMatch) throw new Error(`FakeDb.execute: cannot parse table from: ${sql}`);
    const table = tableMatch[1];
    const rows = this.getTable(table);

    // Extract column list
    const colMatch = normalized.match(/INTO\s+\w+\s*\(([^)]+)\)/i);
    if (!colMatch) throw new Error(`FakeDb.execute: cannot parse columns from: ${sql}`);
    const cols = colMatch[1].split(",").map((c) => c.trim());

    // Build row
    const row: Row = {};
    cols.forEach((col, i) => {
      row[col] = params[i] ?? null;
    });

    if (isUpsert) {
      // Determine conflict column (first column, typically agent_id / id)
      const conflictMatch = normalized.match(/ON CONFLICT\s*\((\w+)\)/i);
      const conflictCol = conflictMatch ? conflictMatch[1] : cols[0];
      const conflictVal = row[conflictCol];
      const existing = rows.findIndex((r) => r[conflictCol] === conflictVal);
      if (existing !== -1) {
        // Parse SET clause: col = excluded.col pairs
        const setMatch = normalized.match(/DO UPDATE SET\s+(.+)$/i);
        if (setMatch) {
          const setPairs = setMatch[1].split(",").map((s) => s.trim());
          for (const pair of setPairs) {
            const [lhs, rhs] = pair.split("=").map((s) => s.trim());
            // rhs is like "excluded.col_name"
            const rhsCol = rhs.replace(/^excluded\./, "");
            rows[existing][lhs] = row[rhsCol] ?? row[lhs];
          }
        }
      } else {
        rows.push(row);
      }
    } else {
      rows.push(row);
    }

    return { rowsAffected: 1, lastInsertId: rows.length };
  }

  async select<T = Row[]>(sql: string, params: unknown[] = []): Promise<T> {
    const normalized = sql.replace(/\s+/g, " ").trim();

    // COUNT(*)
    if (/SELECT COUNT\(\*\)/i.test(normalized)) {
      const tableMatch = normalized.match(/FROM\s+(\w+)/i);
      const table = tableMatch ? tableMatch[1] : "";
      const rows = this.getTable(table);
      return [{ n: rows.length }] as unknown as T;
    }

    // Extract table
    const tableMatch = normalized.match(/FROM\s+(\w+)/i);
    if (!tableMatch) throw new Error(`FakeDb.select: cannot parse table from: ${sql}`);
    const table = tableMatch[1];
    let rows = [...this.getTable(table)];

    // WHERE col = ?
    const whereMatch = normalized.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereMatch) {
      const col = whereMatch[1];
      const val = params[0];
      rows = rows.filter((r) => r[col] === val);
    }

    // ORDER BY col ASC|DESC
    const orderMatch = normalized.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = (orderMatch[2] ?? "ASC").toUpperCase();
      rows.sort((a, b) => {
        const av = a[col] as number;
        const bv = b[col] as number;
        return dir === "ASC" ? av - bv : bv - av;
      });
    }

    // LIMIT ?  — param index: WHERE consumes params[0] when present
    const limitMatch = normalized.match(/LIMIT\s+\?/i);
    if (limitMatch) {
      const limitParam = whereMatch ? params[1] : params[0];
      if (limitParam !== undefined) rows = rows.slice(0, limitParam as number);
    }

    return rows as unknown as T;
  }
}

// ---------------------------------------------------------------------------
// Wire mock BEFORE importing the repos
// ---------------------------------------------------------------------------

let fakeDb = new FakeDb();

vi.mock("../client", () => ({
  DB_URL: "sqlite:lyra.db",
  getDb: () => Promise.resolve(fakeDb),
  invalidateDb: vi.fn(() => {
    fakeDb = new FakeDb();
  }),
}));

// Import repos AFTER mock is in place
import { insertTurn, getTurn, listRecentTurns, countTurns } from "./turnRepo";
import { upsertSoulState, loadSoulState } from "./soulRepo";
import { insertSnapshot, listSnapshotsForTurn } from "./emotionRepo";
import { insertTrack, getTrack, findByPath } from "./libraryRepo";
import { invalidateDb } from "../client";

import type { DialogueTurn, SoulState, CurrentEmotion, LibraryTrack } from "../../types";

// ---------------------------------------------------------------------------
// Sample fixtures — agent_id: lyra_001
// ---------------------------------------------------------------------------

const sampleTurn: DialogueTurn = {
  id: "turn-lyra-01",
  timestamp: 1730000000000,
  current_emotion: {
    pad: { p: 0.5, a: 0.1, d: 0.2 },
    labels: ["平静", "专注"],
    confidence: 0.9,
    source: "emotion-agent-inferred",
  },
  user_utterance: { modality: "text", content: "来一首放松的曲子" },
  agent_response: { song_id: "s-lyra-01", rationale: "匹配当前平静情绪" },
  user_reaction: {
    behavioral: {
      listen_duration_ms: 240000,
      completed: true,
      skipped: false,
      repeated: 1,
      volume_delta: 0,
    },
    silence_positive: true,
  },
  emotion_delta: { p: 0.05, a: -0.02, d: 0.01 },
};

const sampleSoul: SoulState = {
  agent_id: "lyra_001",
  created_at: "2024-01-01T00:00:00Z",
  musical_taste_base: {
    aesthetic_axes: {
      restraint_vs_expression: 0.4,
      narrative_vs_atmospheric: 0.6,
      polished_vs_raw: 0.7,
      novelty_seeking: 0.5,
    },
    affinity_genres: ["ambient", "jazz"],
    aversion_signals: ["harsh noise"],
    backbone: "introspective",
  },
  dynamic_mood: {
    current_pad: { p: 0.3, a: 0.1, d: 0.2 },
    attention_to_user: 0.8,
    recent_bias: "calm",
  },
  shared_memory: [],
  evolution_log: [],
  proactive_budget: {
    daily_limit: 3,
    sulk_until: null,
    kind_budgets: {
      morning: 1,
      care: 1,
      anniversary: 0,
      share: 1,
      rhythm: 0,
    },
  },
};

const sampleEmotion: CurrentEmotion = {
  pad: { p: 0.5, a: 0.1, d: 0.2 },
  labels: ["平静"],
  confidence: 0.88,
  source: "emotion-agent-inferred",
};

const sampleTrack: LibraryTrack = {
  id: "track-lyra-01",
  path: "/music/lyra/ambient-01.flac",
  origin: "local",
  title: "Ambient 01",
  artist: "Lyra",
  album: "Test Album",
  duration_ms: 240000,
  added_at: 1730000000000,
};

// ---------------------------------------------------------------------------
// Reset fake DB before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  fakeDb = new FakeDb();
  vi.mocked(invalidateDb).mockImplementation(() => {
    fakeDb = new FakeDb();
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sprint 1a integration smoke", () => {

  it("T1+T2 turnRepo: insert then round-trip retrieve preserves all fields", async () => {
    await insertTurn(sampleTurn);
    const result = await getTurn(sampleTurn.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(sampleTurn.id);
    expect(result!.timestamp).toBe(sampleTurn.timestamp);
    expect(result!.current_emotion).toEqual(sampleTurn.current_emotion);
    expect(result!.user_utterance).toEqual(sampleTurn.user_utterance);
    expect(result!.agent_response).toEqual(sampleTurn.agent_response);
    expect(result!.user_reaction).toEqual(sampleTurn.user_reaction);
    expect(result!.emotion_delta).toEqual(sampleTurn.emotion_delta);
  });

  it("T1+T2 soulRepo: upsert then load preserves lyra_001 soul state", async () => {
    await upsertSoulState(sampleSoul);
    const result = await loadSoulState("lyra_001");
    expect(result).not.toBeNull();
    expect(result!.agent_id).toBe("lyra_001");
    expect(result!.musical_taste_base.affinity_genres).toEqual(["ambient", "jazz"]);
    expect(result!.dynamic_mood.attention_to_user).toBe(0.8);
    expect(result!.proactive_budget.daily_limit).toBe(3);
  });

  it("T1+T2 emotionRepo: insert snapshot then list by turnId", async () => {
    await insertSnapshot(sampleEmotion, { id: "snap-01", timestamp: 1730000001000, turnId: sampleTurn.id });
    await insertSnapshot(sampleEmotion, { id: "snap-02", timestamp: 1730000002000, turnId: sampleTurn.id });
    const snaps = await listSnapshotsForTurn(sampleTurn.id);
    expect(snaps).toHaveLength(2);
    expect(snaps[0].pad).toEqual(sampleEmotion.pad);
    expect(snaps[0].labels).toEqual(sampleEmotion.labels);
    expect(snaps[0].confidence).toBe(sampleEmotion.confidence);
  });

  it("T1+T2 libraryRepo: insert track then get by id and findByPath", async () => {
    await insertTrack(sampleTrack);
    const byId = await getTrack(sampleTrack.id);
    expect(byId).not.toBeNull();
    expect(byId!.path).toBe(sampleTrack.path);
    expect(byId!.title).toBe("Ambient 01");

    const byPath = await findByPath(sampleTrack.path);
    expect(byPath).not.toBeNull();
    expect(byPath!.id).toBe(sampleTrack.id);
  });

  it("T2 listRecentTurns + countTurns: ordering and count correct", async () => {
    const t1: DialogueTurn = { ...sampleTurn, id: "t-old", timestamp: 1000 };
    const t2: DialogueTurn = { ...sampleTurn, id: "t-new", timestamp: 9000 };
    await insertTurn(t1);
    await insertTurn(t2);

    const count = await countTurns();
    expect(count).toBe(2);

    const recent = await listRecentTurns(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe("t-new"); // DESC order, newest first
  });

  it("T3 invalidateDb: after invalidation a fresh insert is visible", async () => {
    // Insert before invalidation
    await insertTurn(sampleTurn);
    expect(await countTurns()).toBe(1);

    // Invalidate — clears the in-memory store
    invalidateDb();
    // After invalidation the fake is reset so count is zero
    expect(await countTurns()).toBe(0);

    // Insert again post-invalidation — should be persisted
    await insertTurn(sampleTurn);
    expect(await countTurns()).toBe(1);
  });

});
