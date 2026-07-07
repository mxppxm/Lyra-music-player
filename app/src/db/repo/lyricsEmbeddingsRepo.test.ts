import { describe, expect, it, beforeEach, vi } from "vitest";

// In-memory fake for tauri-plugin-sql
type FakeRow = {
  track_id: string;
  lyrics_hash: string;
  model_id: string;
  dim: number;
  embedding: number[];
  updated_at: number;
};

let rows: FakeRow[] = [];

const execute = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.startsWith("INSERT")) {
    rows = rows.filter((r) => r.track_id !== (args[0] as string));
    rows.push({
      track_id: args[0] as string,
      lyrics_hash: args[1] as string,
      model_id: args[2] as string,
      dim: args[3] as number,
      embedding: args[4] as number[],
      updated_at: args[5] as number,
    });
  }
  return { rowsAffected: 1, lastInsertId: 0 };
});

const select = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.includes("track_id IN")) {
    return rows.filter((r) => (args as string[]).includes(r.track_id));
  }
  if (sql.includes("WHERE track_id = ?")) {
    return rows.filter((r) => r.track_id === (args[0] as string));
  }
  if (sql.includes("COUNT")) {
    return [
      {
        total: rows.length,
        with_embedding: rows.length,
        model_id: rows[0]?.model_id ?? null,
      },
    ];
  }
  if (sql.includes("SELECT id FROM library_tracks")) {
    return [];
  }
  return [];
});

const fake = { execute, select };

vi.mock("../client", () => ({
  getDb: async () => fake,
}));

import * as repo from "./lyricsEmbeddingsRepo";

function vec(...ns: number[]): Float32Array {
  return new Float32Array(ns);
}

function blob(v: Float32Array): number[] {
  return Array.from(new Uint8Array(v.buffer));
}

beforeEach(() => {
  rows = [];
  fake.execute.mockClear();
  fake.select.mockClear();
});

describe("lyricsEmbeddingsRepo", () => {
  it("upserts new row", async () => {
    await repo.upsert({
      trackId: "t1",
      lyricsHash: "abc",
      modelId: "zhipu:embedding-3",
      dim: 3,
      embedding: vec(1, 2, 3),
      updatedAt: 100,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].track_id).toBe("t1");
  });

  it("upsert overwrites on conflict", async () => {
    await repo.upsert({
      trackId: "t1",
      lyricsHash: "abc",
      modelId: "zhipu:embedding-3",
      dim: 3,
      embedding: vec(1, 2, 3),
      updatedAt: 100,
    });
    await repo.upsert({
      trackId: "t1",
      lyricsHash: "xyz",
      modelId: "openai:text-embedding-3-small",
      dim: 3,
      embedding: vec(4, 5, 6),
      updatedAt: 200,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].lyrics_hash).toBe("xyz");
    expect(rows[0].model_id).toBe("openai:text-embedding-3-small");
  });

  it("getBatch returns Map keyed by trackId", async () => {
    rows = [
      {
        track_id: "a",
        lyrics_hash: "h",
        model_id: "m",
        dim: 2,
        embedding: blob(vec(0.5, 0.5)),
        updated_at: 1,
      },
      {
        track_id: "b",
        lyrics_hash: "h",
        model_id: "m",
        dim: 2,
        embedding: blob(vec(0.1, 0.9)),
        updated_at: 2,
      },
    ];
    const out = await repo.getBatch(["a", "b", "missing"]);
    expect(out.size).toBe(2);
    expect(out.get("a")?.embedding[0]).toBeCloseTo(0.5);
    expect(out.get("b")?.embedding[1]).toBeCloseTo(0.9);
  });

  it("countCoverage reports totals", async () => {
    rows = [
      {
        track_id: "a",
        lyrics_hash: "h",
        model_id: "zhipu:embedding-3",
        dim: 2,
        embedding: blob(vec(0, 0)),
        updated_at: 1,
      },
    ];
    const cov = await repo.countCoverage();
    expect(cov.total).toBe(1);
    expect(cov.withEmbedding).toBe(1);
    expect(cov.modelId).toBe("zhipu:embedding-3");
  });
});
