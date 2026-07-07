import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import {
  insertEntry,
  listByTaskId,
  listSince,
  listRecent,
  getEntry,
} from "./engineerAuditRepo";
import type { EngineerAuditEntry } from "../../engineer/types";

const sample: EngineerAuditEntry = {
  id: "audit-01",
  timestamp: 1720000000000,
  task_id: "daily-2026-07-07",
  phase: "propose",
  payload_json: JSON.stringify({ proposed: 3, blocked: 1 }),
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("engineerAuditRepo — insertEntry", () => {
  it("inserts 5 columns", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertEntry(sample);
    expect(executeMock).toHaveBeenCalledOnce();
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO engineer_audit/i);
    expect(args).toHaveLength(5);
    expect(args[0]).toBe("audit-01");
    expect(args[2]).toBe("daily-2026-07-07");
    expect(args[3]).toBe("propose");
  });

  it("stores payload_json as string", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertEntry(sample);
    const [, args] = executeMock.mock.calls[0];
    expect(typeof args[4]).toBe("string");
    expect(JSON.parse(args[4] as string)).toMatchObject({ proposed: 3 });
  });
});

describe("engineerAuditRepo — listByTaskId", () => {
  it("queries WHERE task_id = ? ORDER BY timestamp ASC", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listByTaskId("daily-2026-07-07");
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/WHERE task_id = \?/i);
    expect(sql).toMatch(/ORDER BY timestamp ASC/i);
    expect(args![0]).toBe("daily-2026-07-07");
  });

  it("deserialises rows to EngineerAuditEntry", async () => {
    selectMock.mockResolvedValueOnce([sample]);
    const entries = await listByTaskId("daily-2026-07-07");
    expect(entries).toHaveLength(1);
    expect(entries[0].phase).toBe("propose");
  });
});

describe("engineerAuditRepo — listSince", () => {
  it("queries with timestamp param and ORDER BY timestamp DESC", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listSince(1719000000000);
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/timestamp >= \?/i);
    expect(sql).toMatch(/ORDER BY timestamp DESC/i);
    expect(args![0]).toBe(1719000000000);
  });
});

describe("engineerAuditRepo — listRecent", () => {
  it("queries with LIMIT param", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listRecent(10);
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/LIMIT \?/i);
    expect(args![0]).toBe(10);
  });
});

describe("engineerAuditRepo — getEntry", () => {
  it("returns null when not found", async () => {
    selectMock.mockResolvedValueOnce([]);
    expect(await getEntry("missing")).toBeNull();
  });

  it("returns entry when found", async () => {
    selectMock.mockResolvedValueOnce([sample]);
    const entry = await getEntry("audit-01");
    expect(entry).not.toBeNull();
    expect(entry!.task_id).toBe("daily-2026-07-07");
  });
});
