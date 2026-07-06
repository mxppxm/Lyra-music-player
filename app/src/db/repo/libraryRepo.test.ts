import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { insertTrack, getTrack, listAll, findByPath } from "./libraryRepo";
import type { LibraryTrack } from "../../types";

const sample: LibraryTrack = {
  id: "t1",
  path: "/Users/x/Music/song.mp3",
  origin: "local",
  title: "Nuvole Bianche",
  artist: "Ludovico Einaudi",
  album: "Una Mattina",
  duration_ms: 358_000,
  added_at: 1730000000000,
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("libraryRepo", () => {
  it("insertTrack inserts 9 columns", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await insertTrack(sample);
    const [sql, args] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO library_tracks/i);
    expect(args).toHaveLength(9);
    expect(args?.[0]).toBe("t1");
    expect(args?.[1]).toBe("/Users/x/Music/song.mp3");
    expect(args?.[2]).toBe("local");
  });

  it("getTrack returns null when not found", async () => {
    selectMock.mockResolvedValueOnce([]);
    expect(await getTrack("missing")).toBeNull();
  });

  it("getTrack round-trips a track", async () => {
    selectMock.mockResolvedValueOnce([
      {
        id: sample.id, path: sample.path, origin: sample.origin,
        title: sample.title, artist: sample.artist, album: sample.album,
        duration_ms: sample.duration_ms, added_at: sample.added_at,
        metadata_json: null,
      },
    ]);
    expect(await getTrack("t1")).toEqual(sample);
  });

  it("listAll returns hydrated tracks[]", async () => {
    selectMock.mockResolvedValueOnce([
      { id: "t1", path: "/a.mp3", origin: "local", title: null, artist: null, album: null, duration_ms: null, added_at: 1, metadata_json: null },
      { id: "t2", path: "/b.mp3", origin: "generated", title: null, artist: null, album: null, duration_ms: null, added_at: 2, metadata_json: null },
    ]);
    const rows = await listAll();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("t1");
    expect(rows[1].origin).toBe("generated");
  });

  it("findByPath queries by path", async () => {
    selectMock.mockResolvedValueOnce([]);
    await findByPath("/x.mp3");
    const [sql, args] = selectMock.mock.calls[0];
    expect(sql).toContain("WHERE path = ?");
    expect(args?.[0]).toBe("/x.mp3");
  });
});
