/**
 * Sprint 2 T7 — Orchestrator end-to-end integration smoke
 *
 * Simulates 10 turns through a fully-stateful fake pipeline:
 *   - Map-backed fake DB (dialogue_turns + shared_memory tables)
 *   - In-memory memory.md held in a string closure
 *   - Stubbed agents with deterministic, PAD-varying outputs
 *   - Silent-full-listen rule fires on turns where onSongComplete is called
 *
 * After 10 turns, reflectNow() is called with a stubbed ReflectAgent.
 * Assertions:
 *   - All 10 DialogueTurns persisted in dialogue_turns
 *   - At least 1 SalientMoment inserted into shared_memory
 *   - memory.md after Reflect contains: Living Portrait, Facts, Dreams sections
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "./Orchestrator";
import type { CurrentEmotion, LibraryTrack, DialogueTurn, SoulState } from "../types";
import * as memoryContext from "../memory/context";
import { EMPTY_MEMORY } from "../memory/parser";

// ---------------------------------------------------------------------------
// Stateful fake DB (same pattern as Sprint 1a T6 integration.test.ts)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

class FakeDb {
  private tables = new Map<string, Row[]>();

  private getTable(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rowsAffected: number; lastInsertId: number }> {
    const normalized = sql.replace(/\s+/g, " ").trim();

    const insertMatch = normalized.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
    if (!insertMatch) {
      // UPDATE — no-op for our assertions
      return { rowsAffected: 1, lastInsertId: 0 };
    }
    const table = insertMatch[1];
    const rows = this.getTable(table);

    const colMatch = normalized.match(/INTO\s+\w+\s*\(([^)]+)\)/i);
    if (!colMatch) throw new Error(`FakeDb.execute: cannot parse columns from: ${sql}`);
    const cols = colMatch[1].split(",").map((c) => c.trim());

    const row: Row = {};
    cols.forEach((col, i) => {
      row[col] = params[i] ?? null;
    });

    const isUpsert = /ON CONFLICT/i.test(normalized);
    if (isUpsert) {
      const conflictMatch = normalized.match(/ON CONFLICT\s*\((\w+)\)/i);
      const conflictCol = conflictMatch ? conflictMatch[1] : cols[0];
      const conflictVal = row[conflictCol];
      const existing = rows.findIndex((r) => r[conflictCol] === conflictVal);
      if (existing !== -1) {
        const setMatch = normalized.match(/DO UPDATE SET\s+(.+)$/i);
        if (setMatch) {
          const setPairs = setMatch[1].split(",").map((s) => s.trim());
          for (const pair of setPairs) {
            const [lhs, rhs] = pair.split("=").map((s) => s.trim());
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

    const tableMatch = normalized.match(/FROM\s+(\w+)/i);
    if (!tableMatch) return [] as unknown as T;
    const table = tableMatch[1];
    let rows = [...(this.getTable(table))];

    // WHERE col = ?
    const whereMatch = normalized.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereMatch) {
      const col = whereMatch[1];
      rows = rows.filter((r) => r[col] === params[0]);
    }

    // ORDER BY col DESC / ASC
    const orderMatch = normalized.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = orderMatch[2].toUpperCase();
      rows.sort((a, b) => {
        const av = a[col] as number;
        const bv = b[col] as number;
        return dir === "DESC" ? bv - av : av - bv;
      });
    }

    // LIMIT ?
    const limitMatch = normalized.match(/LIMIT\s+(\?|\d+)/i);
    if (limitMatch) {
      const n =
        limitMatch[1] === "?"
          ? (params[whereMatch ? 1 : 0] as number)
          : parseInt(limitMatch[1], 10);
      rows = rows.slice(0, n);
    }

    // COUNT(*)
    if (/SELECT\s+COUNT\s*\(\s*\*\s*\)/i.test(normalized)) {
      return [{ n: rows.length }] as unknown as T;
    }

    return rows as unknown as T;
  }

  /** Expose table rows for assertions */
  getRows(table: string): Row[] {
    return this.getTable(table);
  }
}

// ---------------------------------------------------------------------------
// In-memory memory.md fake (via @tauri-apps/api/core invoke mock)
// ---------------------------------------------------------------------------

let memoryMdContent = "";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { content?: string }) => {
    if (cmd === "memory_file_read") return memoryMdContent;
    if (cmd === "memory_file_write") {
      memoryMdContent = args?.content ?? "";
      return undefined;
    }
    throw new Error(`invoke: unknown command ${cmd}`);
  }),
}));

// ---------------------------------------------------------------------------
// DB client mock — routes to our FakeDb instance
// ---------------------------------------------------------------------------

let fakeDb = new FakeDb();

vi.mock("../db/client", () => ({
  DB_URL: "sqlite:lyra.db",
  getDb: () => Promise.resolve(fakeDb),
  invalidateDb: vi.fn(() => {
    fakeDb = new FakeDb();
  }),
}));

// ---------------------------------------------------------------------------
// ReflectAgent stub — deterministic output, no network call
// ---------------------------------------------------------------------------

vi.mock("../reflect/ReflectAgent", () => ({
  ReflectAgent: class {
    async run() {
      return {
        livingPortrait:
          "她在深夜寻找共鸣，音乐是她与世界之间的翻译。\n\n古典钢琴让她的呼吸放缓，回到内心的中心。",
        factMutations: [
          { op: "add", tags: ["#时段:深夜"], conclusion: "慢速古典钢琴", startConfidence: 0.6 },
          {
            op: "add",
            tags: ["#情绪:平静"],
            conclusion: "低噪音环境音",
            startConfidence: 0.55,
          },
        ],
        dreamNarrative: "一个安静的夜晚，她把所有喜欢的曲子串成了一段旅程。",
      };
    }
  },
}));

// Import the repos + trigger AFTER mocks are in place
import { insertTurn, listRecentTurns } from "../db/repo/turnRepo";
import { reflectNow } from "../reflect/trigger";

// ---------------------------------------------------------------------------
// Stubs fixtures
// ---------------------------------------------------------------------------

const TRACKS: LibraryTrack[] = [
  { id: "t1", path: "/music/chopin.flac", origin: "local", added_at: 0, title: "夜曲", duration_ms: 240_000 },
  { id: "t2", path: "/music/satie.flac",  origin: "local", added_at: 0, title: "裸露的舞者", duration_ms: 180_000 },
  { id: "t3", path: "/music/debussy.flac", origin: "local", added_at: 0, title: "月光", duration_ms: 300_000 },
  { id: "t4", path: "/music/schubert.flac", origin: "local", added_at: 0, title: "小夜曲", duration_ms: 200_000 },
  { id: "t5", path: "/music/bach.flac", origin: "local", added_at: 0, title: "BWV 988", duration_ms: 260_000 },
];

/** PAD values cycle deterministically by turn index */
function padForTurn(i: number): { p: number; a: number; d: number } {
  const pads = [
    { p: -0.3, a: -0.2, d:  0.0 },
    { p:  0.4, a:  0.1, d:  0.0 },
    { p: -0.1, a: -0.3, d:  0.1 },
    { p:  0.2, a:  0.3, d: -0.1 },
    { p: -0.5, a: -0.1, d:  0.2 },
    { p:  0.1, a:  0.0, d:  0.0 },
    { p:  0.6, a:  0.4, d: -0.2 },
    { p: -0.2, a: -0.4, d:  0.3 },
    { p:  0.3, a:  0.2, d:  0.0 },
    { p:  0.0, a: -0.1, d: -0.1 },
  ];
  return pads[i % pads.length];
}

function makeSoulState(): SoulState {
  return {
    agent_id: "lyra_001",
    created_at: "2026-07-06",
    musical_taste_base: {
      aesthetic_axes: {
        restraint_vs_expression: 0,
        narrative_vs_atmospheric: 0,
        polished_vs_raw: 0,
        novelty_seeking: 0.5,
      },
      affinity_genres: [],
      aversion_signals: [],
      backbone: "",
    },
    dynamic_mood: {
      current_pad: { p: 0, a: 0, d: 0 },
      attention_to_user: 0.85,
      recent_bias: "",
    },
    shared_memory: [],
    evolution_log: [],
    proactive_budget: {
      daily_limit: 3,
      sulk_until: null,
      kind_budgets: { morning: 1, care: 1, anniversary: 1, share: 1, rhythm: 2 },
    },
  };
}

/** Build the Orchestrator deps with per-turn PAD variation via a counter */
function makeIntegrationDeps(turnCounter: { n: number }) {
  const soul = makeSoulState();

  const emotion = {
    analyze: vi.fn(async (): Promise<CurrentEmotion> => {
      const pad = padForTurn(turnCounter.n);
      return {
        pad,
        labels: pad.p < 0 ? ["疲惫"] : ["平静"],
        confidence: 0.8,
        source: "emotion-agent-inferred" as const,
      };
    }),
  };

  const companion = {
    choose: vi.fn(async () => {
      const track = TRACKS[turnCounter.n % TRACKS.length];
      return {
        song_id: track.id,
        target_profile: "陪伴",
        rationale: `turn-${turnCounter.n} deterministic pick`,
        needed_shift: "接住" as const,
      };
    }),
  };

  const library = {
    prefilter: vi.fn(async () => TRACKS),
  };

  const soulStore = {
    load: vi.fn(async () => soul),
    apply: vi.fn(async () => soul),
  };

  // In-memory turn storage (accessed by reflectNow via listRecentTurns which uses the fake DB)
  const turnRepo = {
    insertTurn: vi.fn(async (t: DialogueTurn) => {
      await insertTurn(t);
    }),
    updateTurn: vi.fn(async (t: DialogueTurn) => {
      // No-op update is fine for this test; the row exists
      void t;
    }),
  };

  const audio = {
    playFile: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  };

  return {
    emotion,
    companion,
    library,
    soulStore,
    turnRepo,
    audio,
    clock: () => 1_730_000_000_000 + turnCounter.n * 60_000,
    idGen: () => `turn-${turnCounter.n + 1}`,
  };
}

// ---------------------------------------------------------------------------
// Reset state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  fakeDb = new FakeDb();
  memoryMdContent = "";
  memoryContext.setMemoryContext(EMPTY_MEMORY);
});

// ---------------------------------------------------------------------------
// Integration smoke: 10 turns → shared_memory entries → reflectNow() → memory.md
// ---------------------------------------------------------------------------

describe("Orchestrator integration smoke — 10 turns + reflectNow", () => {
  it("persists all 10 DialogueTurns into dialogue_turns table", async () => {
    const turnCounter = { n: 0 };
    const deps = makeIntegrationDeps(turnCounter);
    const orc = new Orchestrator(deps as any);

    for (let i = 0; i < 10; i++) {
      turnCounter.n = i;
      await orc.onUserInput(`turn ${i + 1}: 来一首歌`);
      // Simulate song completion on even turns to trigger silent-full-listen rule
      // AND (post-audio-complete-event feature) auto-advance to a new turn.
      if (i % 2 === 0) {
        // Set listen progress to full duration so the rule fires
        const trackDuration = TRACKS[i % TRACKS.length].duration_ms ?? 240_000;
        orc.onListenProgress(trackDuration);
        await orc.onSongComplete();
      }
    }

    // 10 user-initiated turns + 5 auto-advance turns (one per onSongComplete
    // call at i=0,2,4,6,8) = 15 total.
    const turns = fakeDb.getRows("dialogue_turns");
    expect(turns).toHaveLength(15);
    // Each row should have a non-null id
    for (const row of turns) {
      expect(typeof row.id).toBe("string");
      expect((row.id as string).startsWith("turn-")).toBe(true);
    }

    // 10 turns should have modality "text" (user-initiated),
    // 5 should have modality "proactive-open" (auto-advance).
    const modalities = turns.map((r) => {
      const uu = JSON.parse(r.user_utterance_json as string);
      return uu.modality;
    });
    const textCount = modalities.filter((m) => m === "text").length;
    const proactiveCount = modalities.filter((m) => m === "proactive-open").length;
    expect(textCount).toBe(10);
    expect(proactiveCount).toBe(5);
  });

  it("inserts at least 1 SalientMoment into shared_memory when detectSalientMoment fires", async () => {
    // Spy on detectSalientMoment to return a canned moment on every call.
    // This verifies the DB-insert plumbing end-to-end without relying on the
    // silence heuristic (silence_positive is poisoned by verbal attribution
    // from the next utterance — that heuristic is covered by the unit test).
    const salientModule = await import("../moments/salient");
    const fakeMoment = {
      timestampISO: "2026-07-06T23:00:00.000Z",
      songTitle: "夜曲",
      narrative: "《夜曲》完整听完，沉默正向。",
      tags: ["#时段:深夜"],
    };
    const detectSpy = vi
      .spyOn(salientModule, "detectSalientMoment")
      .mockReturnValue(fakeMoment);

    try {
      const turnCounter = { n: 0 };
      const deps = makeIntegrationDeps(turnCounter);
      const orc = new Orchestrator(deps as any);

      // Run 10 turns; each odd turn finalises the previous one via onUserInput
      for (let i = 0; i < 10; i++) {
        turnCounter.n = i;
        await orc.onUserInput(`turn ${i + 1}: 来一首歌`);
      }

      // Finalise the last open turn
      turnCounter.n = 10;
      await orc.onUserInput("好");

      const sharedRows = fakeDb.getRows("shared_memory");
      expect(sharedRows.length).toBeGreaterThanOrEqual(1);
      // Each row should have the canned song title stored
      expect(sharedRows[0].song_id).toBe("夜曲");
    } finally {
      detectSpy.mockRestore();
    }
  });

  it("memory.md after reflectNow() contains Living Portrait, Facts, and Dreams sections", async () => {
    const turnCounter = { n: 0 };
    const deps = makeIntegrationDeps(turnCounter);
    const orc = new Orchestrator(deps as any);

    // Run 10 turns, finalising on every other one
    for (let i = 0; i < 10; i++) {
      turnCounter.n = i;
      await orc.onUserInput(`turn ${i + 1}: 来一首歌`);
      if (i % 2 === 0) {
        const trackDuration = TRACKS[i % TRACKS.length].duration_ms ?? 240_000;
        orc.onListenProgress(trackDuration);
        await orc.onSongComplete();
      }
    }

    // Finalise the last open turn so listRecentTurns sees all 10
    turnCounter.n = 10;
    await orc.onUserInput("好");

    // Invoke reflectNow() — uses stubbed ReflectAgent + fake DB + fake fileIO
    const stats = await reflectNow();

    // Stats sanity
    expect(stats.appliedFacts).toBe(2); // ReflectAgent stub returns 2 factMutations
    expect(stats.dreamAdded).toBe(true);

    // --- memory.md content assertions ---
    const md = memoryMdContent;
    expect(md.length).toBeGreaterThan(0);

    // Living Portrait section present and non-empty
    expect(md).toMatch(/##\s+Living Portrait/);
    const portraitSection = md.split(/##\s+Living Portrait/)[1]?.split(/##\s+/)[0] ?? "";
    expect(portraitSection.trim().length).toBeGreaterThan(0);

    // Facts section has at least one fact line (starts with "- #")
    expect(md).toMatch(/##\s+Facts \(Conditional Preferences\)/);
    const factsSection =
      md.split(/##\s+Facts \(Conditional Preferences\)/)[1]?.split(/##\s+/)[0] ?? "";
    const factLines = factsSection.split("\n").filter((l) => l.trim().startsWith("- #"));
    expect(factLines.length).toBeGreaterThanOrEqual(1);

    // Dreams section has at least one entry
    expect(md).toMatch(/##\s+Dreams/);
    const dreamsSection = md.split(/##\s+Dreams/)[1]?.split(/##\s+/)[0] ?? "";
    const dreamLines = dreamsSection.split("\n").filter((l) => l.trim().startsWith("- **"));
    expect(dreamLines.length).toBeGreaterThanOrEqual(1);
  });

  it("full log shows no unhandled errors — all 10 turns reach playing state", async () => {
    const turnCounter = { n: 0 };
    const deps = makeIntegrationDeps(turnCounter);
    const orc = new Orchestrator(deps as any);

    const errors: string[] = [];
    orc.subscribe((s) => {
      if (s.kind === "error") errors.push(s.message);
    });

    for (let i = 0; i < 10; i++) {
      turnCounter.n = i;
      await orc.onUserInput(`turn ${i + 1}: test input`);
    }

    expect(errors).toHaveLength(0);

    // Final state should be "playing" (last turn in progress)
    expect(orc.getState().kind).toBe("playing");
  });

  it("listRecentTurns returns all persisted turns for the ReflectAgent", async () => {
    const turnCounter = { n: 0 };
    const deps = makeIntegrationDeps(turnCounter);
    const orc = new Orchestrator(deps as any);

    for (let i = 0; i < 10; i++) {
      turnCounter.n = i;
      await orc.onUserInput(`turn ${i + 1}: 来一首歌`);
    }

    // The 10 turns are in the fake DB; listRecentTurns should find them all
    const recent = await listRecentTurns(30);
    expect(recent).toHaveLength(10);

    // Each turn should carry the correct utterance content
    for (const t of recent) {
      expect(t.user_utterance.content).toMatch(/^turn \d+:/);
    }
  });
});
