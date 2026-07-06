import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { insertTurn, getTurn, listRecentTurns, countTurns } from "./turnRepo";
import type { DialogueTurn } from "../../types";

const sample: DialogueTurn = {
  id: "turn-01",
  timestamp: 1730000000000,
  current_emotion: {
    pad: { p: 0.3, a: -0.2, d: 0.1 },
    labels: ["疲惫"],
    confidence: 0.82,
    source: "emotion-agent-inferred",
  },
  user_utterance: { modality: "text", content: "最近有点累" },
  agent_response: { song_id: "s1", rationale: "r" },
  user_reaction: {
    behavioral: { listen_duration_ms: 100, completed: true, skipped: false, repeated: 0, volume_delta: 0 },
    silence_positive: true,
  },
  emotion_delta: { p: 0.1, a: 0, d: 0 },
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("turnRepo", () => {
  it("insertTurn executes INSERT with all 7 columns", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertTurn(sample);
    expect(executeMock).toHaveBeenCalledOnce();
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO dialogue_turns/i);
    expect(sql).toContain("id");
    expect(sql).toContain("timestamp");
    expect(sql).toContain("current_emotion_json");
    expect(args).toHaveLength(7);
    expect(args?.[0]).toBe("turn-01");
    expect(args?.[1]).toBe(1730000000000);
  });

  it("getTurn returns null when the row is not found", async () => {
    selectMock.mockResolvedValueOnce([]);
    const res = await getTurn("nonexistent");
    expect(res).toBeNull();
  });

  it("getTurn round-trips a row through fromRow", async () => {
    // Emulate what SQLite would return after insertTurn(sample)
    selectMock.mockResolvedValueOnce([
      {
        id: sample.id,
        timestamp: sample.timestamp,
        user_utterance_json: JSON.stringify(sample.user_utterance),
        agent_response_json: JSON.stringify(sample.agent_response),
        user_reaction_json: JSON.stringify(sample.user_reaction),
        current_emotion_json: JSON.stringify(sample.current_emotion),
        emotion_delta_json: JSON.stringify(sample.emotion_delta),
      },
    ]);
    const res = await getTurn(sample.id);
    expect(res).toEqual(sample);
  });

  it("listRecentTurns queries ORDER BY timestamp DESC LIMIT ?", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listRecentTurns(5);
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/ORDER BY timestamp DESC/i);
    expect(sql).toMatch(/LIMIT/i);
    expect(args?.[0]).toBe(5);
  });

  it("countTurns SELECTs count(*)", async () => {
    selectMock.mockResolvedValueOnce([{ n: 42 }]);
    const n = await countTurns();
    expect(n).toBe(42);
    const [sql] = selectMock.mock.calls[0];
    expect(sql).toMatch(/SELECT COUNT\(\*\)/i);
  });
});
