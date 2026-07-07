import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import {
  insert,
  listUnconsumed,
  listSince,
  markConsumed,
  getById,
  countUnconsumed,
} from "./featureRequestRepo";
import type { FeatureRequest } from "../../engineer/types";

const sample: Omit<FeatureRequest, "consumed"> = {
  id: "fr-01",
  created_at: 1720000000000,
  from_agent: "companion",
  desire: "Support ambient playlist mode",
  observed_pattern: "User often leaves music on idle for 30+ min",
  urgency: "important",
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("featureRequestRepo — insert", () => {
  it("inserts 6 bound params and consumed defaults to 0", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insert(sample);
    expect(executeMock).toHaveBeenCalledOnce();
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO feature_requests/i);
    expect(args).toHaveLength(6);
    expect(args[0]).toBe("fr-01");
    expect(args[2]).toBe("companion");
  });

  it("maps null observed_pattern when empty string given", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insert({ ...sample, observed_pattern: "" });
    const [, args] = executeMock.mock.calls[0];
    expect(args[4]).toBeNull();
  });
});

describe("featureRequestRepo — listUnconsumed", () => {
  it("queries WHERE consumed = 0", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listUnconsumed();
    const [sql] = selectMock.mock.calls[0];
    expect(sql).toMatch(/WHERE consumed = 0/i);
    expect(sql).toMatch(/ORDER BY created_at ASC/i);
  });

  it("deserialises consumed flag to boolean false", async () => {
    selectMock.mockResolvedValueOnce([
      { ...sample, consumed: 0 },
    ]);
    const items = await listUnconsumed();
    expect(items[0].consumed).toBe(false);
  });
});

describe("featureRequestRepo — listSince", () => {
  it("queries with timestamp param", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listSince(1719000000000);
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/created_at >= \?/i);
    expect(args![0]).toBe(1719000000000);
  });
});

describe("featureRequestRepo — markConsumed", () => {
  it("updates consumed = 1 for given ids", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 2 });
    await markConsumed(["fr-01", "fr-02"]);
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/consumed = 1/i);
    expect(sql).toMatch(/IN \(\?, \?\)/);
    expect(args).toEqual(["fr-01", "fr-02"]);
  });

  it("is a no-op when ids array is empty", async () => {
    await markConsumed([]);
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("featureRequestRepo — getById", () => {
  it("returns null when not found", async () => {
    selectMock.mockResolvedValueOnce([]);
    expect(await getById("missing")).toBeNull();
  });

  it("returns the FeatureRequest when found", async () => {
    selectMock.mockResolvedValueOnce([{ ...sample, consumed: 0 }]);
    const req = await getById("fr-01");
    expect(req).not.toBeNull();
    expect(req!.urgency).toBe("important");
    expect(req!.consumed).toBe(false);
  });
});

describe("featureRequestRepo — countUnconsumed", () => {
  it("returns count from db", async () => {
    selectMock.mockResolvedValueOnce([{ n: 3 }]);
    expect(await countUnconsumed()).toBe(3);
  });

  it("returns 0 as default", async () => {
    selectMock.mockResolvedValueOnce([{}]);
    expect(await countUnconsumed()).toBe(0);
  });
});
