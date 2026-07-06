import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { insertSnapshot, listSnapshotsForTurn } from "./emotionRepo";
import type { CurrentEmotion } from "../../types";

const sample: CurrentEmotion = {
  pad: { p: 0.3, a: -0.2, d: 0.1 },
  labels: ["疲惫"],
  confidence: 0.82,
  source: "emotion-agent-inferred",
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("emotionRepo", () => {
  it("insertSnapshot inserts with 9 columns and turn_id", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertSnapshot(sample, { id: "snap-1", timestamp: 1000, turnId: "turn-1" });
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO emotion_snapshots/i);
    expect(args).toHaveLength(9);
    expect(args?.[0]).toBe("snap-1");
    expect(args?.[1]).toBe(1000);
    expect(args?.[2]).toBe("turn-1");
  });

  it("insertSnapshot passes null when turnId is omitted", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertSnapshot(sample, { id: "snap-2", timestamp: 2000 });
    const [, args] = executeMock.mock.calls[0];
    expect(args?.[2]).toBeNull();
  });

  it("listSnapshotsForTurn returns [] when no rows", async () => {
    selectMock.mockResolvedValueOnce([]);
    const res = await listSnapshotsForTurn("turn-1");
    expect(res).toEqual([]);
  });

  it("listSnapshotsForTurn returns hydrated CurrentEmotion[]", async () => {
    selectMock.mockResolvedValueOnce([
      {
        id: "s1", timestamp: 1000, turn_id: "turn-1",
        pad_p: 0.3, pad_a: -0.2, pad_d: 0.1,
        labels_json: JSON.stringify(["疲惫"]),
        confidence: 0.82,
        source: "emotion-agent-inferred",
      },
    ]);
    const res = await listSnapshotsForTurn("turn-1");
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual(sample);
  });
});
