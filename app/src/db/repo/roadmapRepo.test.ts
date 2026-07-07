import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import {
  insertItem,
  getItem,
  listByStatus,
  listAll,
  updateStatus,
  countByStatus,
} from "./roadmapRepo";
import type { RoadmapItem } from "../../engineer/types";

const sample: RoadmapItem = {
  id: "rm-01",
  created_at: 1720000000000,
  created_by: "engineer-daily",
  title: "Add theme switcher",
  rationale: "Users have requested dark/light mode toggling repeatedly.",
  evidence: ["3 feature_requests mention themes", "session notes 2026-07-01"],
  proposed_change: {
    zone: "green",
    files: ["themes/dark.css", "themes/light.css"],
    summary: "Add two CSS theme files and a toggle button",
  },
  status: "proposed",
  priority: 70,
  effort: "S",
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("roadmapRepo — insertItem", () => {
  it("inserts with all 10 columns", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertItem(sample);
    expect(executeMock).toHaveBeenCalledOnce();
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO roadmap/i);
    expect(args).toHaveLength(10);
    expect(args[0]).toBe("rm-01");
    expect(args[3]).toBe("Add theme switcher");
    expect(args[8]).toBe(70);
    expect(args[9]).toBe("S");
  });

  it("serialises evidence array to JSON", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertItem(sample);
    const [, args] = executeMock.mock.calls[0];
    const evidenceParsed = JSON.parse(args[5] as string);
    expect(Array.isArray(evidenceParsed)).toBe(true);
    expect(evidenceParsed).toContain("3 feature_requests mention themes");
  });

  it("serialises proposed_change to JSON", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertItem(sample);
    const [, args] = executeMock.mock.calls[0];
    const pc = JSON.parse(args[6] as string);
    expect(pc.zone).toBe("green");
    expect(pc.files).toContain("themes/dark.css");
  });
});

describe("roadmapRepo — getItem", () => {
  it("returns null when not found", async () => {
    selectMock.mockResolvedValueOnce([]);
    expect(await getItem("missing")).toBeNull();
  });

  it("deserialises row back to RoadmapItem", async () => {
    selectMock.mockResolvedValueOnce([
      {
        ...sample,
        evidence_json: JSON.stringify(sample.evidence),
        proposed_change_json: JSON.stringify(sample.proposed_change),
      },
    ]);
    const item = await getItem("rm-01");
    expect(item).not.toBeNull();
    expect(item!.title).toBe("Add theme switcher");
    expect(item!.evidence).toHaveLength(2);
    expect(item!.proposed_change.zone).toBe("green");
  });
});

describe("roadmapRepo — listByStatus", () => {
  it("queries with status param and ORDER BY priority DESC", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listByStatus("proposed");
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toMatch(/WHERE status = \?/i);
    expect(sql).toMatch(/ORDER BY priority DESC/i);
    expect(args![0]).toBe("proposed");
  });
});

describe("roadmapRepo — listAll", () => {
  it("returns all rows without a WHERE clause", async () => {
    selectMock.mockResolvedValueOnce([]);
    await listAll();
    const [sql] = selectMock.mock.calls[0];
    expect(sql).not.toMatch(/WHERE/i);
  });
});

describe("roadmapRepo — updateStatus", () => {
  it("runs UPDATE with new status and id", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1 });
    await updateStatus("rm-01", "queued");
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE roadmap SET status/i);
    expect(args![0]).toBe("queued");
    expect(args![1]).toBe("rm-01");
  });
});

describe("roadmapRepo — countByStatus", () => {
  it("returns 0 when no rows", async () => {
    selectMock.mockResolvedValueOnce([{ n: 0 }]);
    expect(await countByStatus("proposed")).toBe(0);
  });

  it("returns the count from db", async () => {
    selectMock.mockResolvedValueOnce([{ n: 5 }]);
    expect(await countByStatus("queued")).toBe(5);
  });
});
