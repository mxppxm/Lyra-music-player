import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeRow = {
  id: number;
  window_start: string;
  window_end: string;
  html_path: string;
  living_portrait_at_close: string;
  turn_count: number;
  fallback: number;
  created_at: string;
};

let rows: FakeRow[] = [];
let nextId = 1;

const execute = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.startsWith("INSERT")) {
    const [ws, we] = [args[0] as string, args[1] as string];
    if (rows.some((r) => r.window_start === ws && r.window_end === we)) {
      throw new Error("UNIQUE constraint failed: ux_weekly_window");
    }
    rows.push({
      id: nextId++,
      window_start: ws,
      window_end: we,
      html_path: args[2] as string,
      living_portrait_at_close: args[3] as string,
      turn_count: args[4] as number,
      fallback: args[5] as number,
      created_at: "2026-07-09T00:00:00Z",
    });
    return { rowsAffected: 1, lastInsertId: rows[rows.length - 1].id };
  }
  if (sql.startsWith("DELETE")) {
    const [ws, we] = [args[0] as string, args[1] as string];
    const before = rows.length;
    rows = rows.filter((r) => !(r.window_start === ws && r.window_end === we));
    return { rowsAffected: before - rows.length, lastInsertId: 0 };
  }
  return { rowsAffected: 0, lastInsertId: 0 };
});

const select = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.includes("ORDER BY id DESC LIMIT 1")) {
    return rows.length === 0 ? [] : [rows[rows.length - 1]];
  }
  if (sql.includes("WHERE window_start = ? AND window_end = ?")) {
    const [ws, we] = [args[0] as string, args[1] as string];
    return rows.filter((r) => r.window_start === ws && r.window_end === we);
  }
  return [];
});

vi.mock("../client", () => ({ getDb: async () => ({ execute, select }) }));

import * as repo from "./weeklyRepo";

beforeEach(() => {
  rows = [];
  nextId = 1;
  execute.mockClear();
  select.mockClear();
});

describe("weeklyRepo", () => {
  it("insert stores a row and can be found by window", async () => {
    await repo.insert({
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/tmp/w.html", living_portrait_at_close: "portrait",
      turn_count: 12, fallback: 0,
    });
    const found = await repo.findByWindow("2026-07-02", "2026-07-09");
    expect(found?.html_path).toBe("/tmp/w.html");
    expect(found?.turn_count).toBe(12);
  });

  it("latest returns the highest-id row", async () => {
    await repo.insert({
      window_start: "2026-06-25", window_end: "2026-07-02",
      html_path: "/a.html", living_portrait_at_close: "A", turn_count: 5, fallback: 0,
    });
    await repo.insert({
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/b.html", living_portrait_at_close: "B", turn_count: 7, fallback: 1,
    });
    const latest = await repo.latest();
    expect(latest?.living_portrait_at_close).toBe("B");
  });

  it("insert twice with same window throws (UNIQUE)", async () => {
    const row = {
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/x.html", living_portrait_at_close: "p", turn_count: 1, fallback: 0 as const,
    };
    await repo.insert(row);
    await expect(repo.insert(row)).rejects.toThrow(/UNIQUE/);
  });

  it("deleteByWindow removes and lets a re-insert succeed", async () => {
    const row = {
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/x.html", living_portrait_at_close: "p", turn_count: 1, fallback: 0 as const,
    };
    await repo.insert(row);
    await repo.deleteByWindow("2026-07-02", "2026-07-09");
    expect(await repo.findByWindow("2026-07-02", "2026-07-09")).toBeNull();
    await expect(repo.insert(row)).resolves.toBeUndefined();
  });

  it("findByWindow returns null when nothing matches", async () => {
    const out = await repo.findByWindow("2020-01-01", "2020-01-08");
    expect(out).toBeNull();
  });

  it("latest returns null when table empty", async () => {
    expect(await repo.latest()).toBeNull();
  });
});
