import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { upsert, getByTrackId, getBatch } from "./libraryFeaturesRepo";
import type { LibraryFeatures } from "./libraryFeaturesRepo";

const sample: LibraryFeatures = {
  track_id: "t-01",
  bpm: null,
  energy: 0.42,
  valence: 0.31,
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("libraryFeaturesRepo — upsert", () => {
  it("issues INSERT ... ON CONFLICT with 4 params", async () => {
    executeMock.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
    await upsert(sample);
    expect(executeMock).toHaveBeenCalledOnce();
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO library_features/i);
    expect(sql).toMatch(/ON CONFLICT\(track_id\)/i);
    expect(args).toEqual(["t-01", null, 0.42, 0.31]);
  });
});

describe("libraryFeaturesRepo — getByTrackId", () => {
  it("returns row when found", async () => {
    selectMock.mockResolvedValue([sample]);
    const r = await getByTrackId("t-01");
    expect(r).toEqual(sample);
  });

  it("returns null when missing", async () => {
    selectMock.mockResolvedValue([]);
    const r = await getByTrackId("nope");
    expect(r).toBeNull();
  });
});

describe("libraryFeaturesRepo — getBatch", () => {
  it("returns empty map when ids is empty (short-circuit)", async () => {
    const m = await getBatch([]);
    expect(m.size).toBe(0);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("selects IN(...) and packs into a map", async () => {
    selectMock.mockResolvedValue([
      sample,
      { track_id: "t-02", bpm: 120, energy: 0.8, valence: 0.5 },
    ]);
    const m = await getBatch(["t-01", "t-02"]);
    expect(m.size).toBe(2);
    expect(m.get("t-01")?.energy).toBe(0.42);
    expect(m.get("t-02")?.bpm).toBe(120);
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/IN \(\?,\?\)/);
    expect(args).toEqual(["t-01", "t-02"]);
  });
});
