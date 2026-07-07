import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { insert, listRecent, pruneOlderThan, MAX_ROWS } from "./perceptionAuditRepo";
import type { PerceptionAuditRow } from "./perceptionAuditRepo";

const sample: PerceptionAuditRow = {
  id: "audit-01",
  ts: 1720000000000,
  source: "rule",
  features_json: JSON.stringify({ skipRatio: 0.5 }),
  bias_json: JSON.stringify({ pad_bias: { p: 0, a: 0, d: 0 }, confidence: 0, reason: "no signal" }),
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("perceptionAuditRepo — insert", () => {
  it("inserts 5 columns", async () => {
    executeMock.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
    await insert(sample);
    // 2 calls: insert + prune
    expect(executeMock).toHaveBeenCalledTimes(2);
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO perception_audit/i);
    expect(args).toHaveLength(5);
    expect(args[0]).toBe("audit-01");
    expect(args[2]).toBe("rule");
  });

  it("also runs a prune step keeping only MAX_ROWS newest", async () => {
    executeMock.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
    await insert(sample);
    const [pruneSql, pruneArgs] = executeMock.mock.calls[1];
    expect(pruneSql).toMatch(/DELETE FROM perception_audit/i);
    expect(pruneArgs).toEqual([MAX_ROWS]);
  });
});

describe("perceptionAuditRepo — listRecent", () => {
  it("returns rows via SELECT ... ORDER BY ts DESC LIMIT ?", async () => {
    selectMock.mockResolvedValue([sample]);
    const rows = await listRecent(10);
    expect(selectMock).toHaveBeenCalledOnce();
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/SELECT.*FROM perception_audit.*ORDER BY ts DESC/is);
    expect(args).toEqual([10]);
    expect(rows).toEqual([sample]);
  });
});

describe("perceptionAuditRepo — pruneOlderThan", () => {
  it("deletes rows older than cutoff and returns count", async () => {
    executeMock.mockResolvedValue({ rowsAffected: 7, lastInsertId: 0 });
    const n = await pruneOlderThan(1000);
    expect(executeMock).toHaveBeenCalledOnce();
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM perception_audit WHERE ts < \?/i);
    expect(args).toEqual([1000]);
    expect(n).toBe(7);
  });
});
