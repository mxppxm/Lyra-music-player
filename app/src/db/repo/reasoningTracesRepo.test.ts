import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeRow = {
  id: string;
  turn_id: string | null;
  agent_kind: string;
  prompt_text: string;
  raw_response: string | null;
  parsed_json: string | null;
  duration_ms: number | null;
  ts: number;
};

let rows: FakeRow[] = [];

const execute = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.startsWith("INSERT")) {
    rows.push({
      id: args[0] as string,
      turn_id: args[1] as string | null,
      agent_kind: args[2] as string,
      prompt_text: args[3] as string,
      raw_response: args[4] as string | null,
      parsed_json: args[5] as string | null,
      duration_ms: args[6] as number | null,
      ts: args[7] as number,
    });
    return { rowsAffected: 1, lastInsertId: 0 };
  }
  if (sql.startsWith("DELETE")) {
    const cutoff = args[0] as number;
    const before = rows.length;
    rows = rows.filter((r) => r.ts >= cutoff);
    return { rowsAffected: before - rows.length, lastInsertId: 0 };
  }
  return { rowsAffected: 0, lastInsertId: 0 };
});

const select = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.includes("WHERE turn_id = ?")) {
    return rows
      .filter((r) => r.turn_id === (args[0] as string))
      .sort((a, b) => a.ts - b.ts);
  }
  if (sql.includes("ORDER BY ts DESC")) {
    const limit = (args[0] as number) ?? 200;
    return [...rows].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }
  return [];
});

vi.mock("../client", () => ({
  getDb: async () => ({ execute, select }),
}));

import * as repo from "./reasoningTracesRepo";

beforeEach(() => {
  rows = [];
  execute.mockClear();
  select.mockClear();
});

describe("reasoningTracesRepo", () => {
  it("insert stores a row with auto-generated id when omitted", async () => {
    await repo.insert({
      turn_id: "t1",
      agent_kind: "companion",
      prompt_text: "prompt A",
      raw_response: "raw A",
      parsed_json: '{"song":"x"}',
      duration_ms: 512,
      ts: 100,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^trc-/);
    expect(rows[0].agent_kind).toBe("companion");
    expect(rows[0].duration_ms).toBe(512);
  });

  it("insert honors an explicit id", async () => {
    await repo.insert({
      id: "trc-custom",
      turn_id: null,
      agent_kind: "emotion",
      prompt_text: "prompt B",
      raw_response: null,
      parsed_json: null,
      duration_ms: null,
      ts: 200,
    });
    expect(rows[0].id).toBe("trc-custom");
  });

  it("listRecent returns rows newest first, capped to limit", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        turn_id: null,
        agent_kind: "emotion",
        prompt_text: `p${i}`,
        raw_response: null,
        parsed_json: null,
        duration_ms: null,
        ts: 100 + i,
      });
    }
    const out = await repo.listRecent(3);
    expect(out).toHaveLength(3);
    expect(out[0].prompt_text).toBe("p4");
    expect(out[2].prompt_text).toBe("p2");
  });

  it("listByTurn filters by turn_id ascending", async () => {
    await repo.insert({
      turn_id: "t1", agent_kind: "emotion", prompt_text: "e",
      raw_response: null, parsed_json: null, duration_ms: null, ts: 5,
    });
    await repo.insert({
      turn_id: "t1", agent_kind: "companion", prompt_text: "c",
      raw_response: null, parsed_json: null, duration_ms: null, ts: 10,
    });
    await repo.insert({
      turn_id: "t2", agent_kind: "emotion", prompt_text: "other",
      raw_response: null, parsed_json: null, duration_ms: null, ts: 20,
    });
    const out = await repo.listByTurn("t1");
    expect(out.map((r) => r.prompt_text)).toEqual(["e", "c"]);
  });

  it("deleteOlderThan removes stale rows and returns count", async () => {
    for (let i = 0; i < 4; i++) {
      await repo.insert({
        turn_id: null, agent_kind: "reflect", prompt_text: `p${i}`,
        raw_response: null, parsed_json: null, duration_ms: null, ts: 100 + i * 100,
      });
    }
    const removed = await repo.deleteOlderThan(250);
    expect(removed).toBe(2);
    expect(rows).toHaveLength(2);
  });
});
