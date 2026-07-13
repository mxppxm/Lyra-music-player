import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const findByPathMock = vi.fn();
const insertTrackMock = vi.fn();
const listAllMock = vi.fn();
const deleteTrackCascadeMock = vi.fn();
vi.mock("../db/repo/libraryRepo", () => ({
  findByPath: (...args: unknown[]) => findByPathMock(...args),
  insertTrack: (...args: unknown[]) => insertTrackMock(...args),
  listAll: (...args: unknown[]) => listAllMock(...args),
  deleteTrackCascade: (...args: unknown[]) => deleteTrackCascadeMock(...args),
}));

// Sprint 10: neutralize the lyrics-embedding dynamic import so
// extractLyricsForTracks stays deterministic across tests.
vi.mock("../providers/embeddingProvider", () => ({
  createEmbeddingProvider: async () => null,
}));

import { scanLibrary, importLibrary, extractLyricsForTracks } from "./libraryScan";
import type { LibraryTrack } from "../types";

beforeEach(() => {
  invokeMock.mockReset();
  findByPathMock.mockReset();
  insertTrackMock.mockReset();
  listAllMock.mockReset();
  listAllMock.mockResolvedValue([]);
  deleteTrackCascadeMock.mockReset();
  deleteTrackCascadeMock.mockResolvedValue(undefined);
});

describe("libraryScan", () => {
  it("scanLibrary calls library_scan command with path", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await scanLibrary("/Users/x/Music");
    expect(invokeMock).toHaveBeenCalledWith("library_scan", { path: "/Users/x/Music" });
  });

  it("importLibrary inserts only NEW tracks (dedupes by path via findByPath)", async () => {
    invokeMock.mockResolvedValueOnce([
      { path: "/a.mp3", title: "A", artist: "AA", album: null, duration_ms: 100 },
      { path: "/b.mp3", title: "B", artist: "BB", album: null, duration_ms: 200 },
      { path: "/c.mp3", title: "C", artist: "CC", album: null, duration_ms: 300 },
    ]);
    findByPathMock.mockImplementation((p: string) =>
      p === "/b.mp3" ? Promise.resolve({ id: "existing" }) : Promise.resolve(null),
    );
    insertTrackMock.mockResolvedValue(undefined);
    const result = await importLibrary("/lib");
    expect(result.imported).toBe(2); // a and c are new; b already existed
    expect(result.pruned).toBe(0);
    expect(insertTrackMock).toHaveBeenCalledTimes(2);
    const insertedPaths = insertTrackMock.mock.calls.map((c) => c[0].path).sort();
    expect(insertedPaths).toEqual(["/a.mp3", "/c.mp3"]);
    const inserted = insertTrackMock.mock.calls.map((c) => c[0]);
    for (const t of inserted) {
      expect(t.origin).toBe("local");
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.added_at).toBe("number");
    }
  });

  it("importLibrary prunes a row whose path is under rootPath but not in the fresh scan", async () => {
    // Scan finds /lib/a.mp3 (still there) but not /lib/gone.mp3 — that row
    // used to live under the same root and is now stale. Prune it.
    invokeMock.mockResolvedValueOnce([
      { path: "/lib/a.mp3", title: "A", artist: null, album: null, duration_ms: 100 },
    ]);
    findByPathMock.mockResolvedValue({ id: "existing-a" });
    listAllMock.mockResolvedValueOnce([
      { id: "existing-a", path: "/lib/a.mp3", origin: "local", added_at: 0 },
      { id: "gone-b", path: "/lib/gone.mp3", origin: "local", added_at: 0 },
    ]);
    const result = await importLibrary("/lib");
    expect(result.imported).toBe(0);
    expect(result.pruned).toBe(1);
    expect(deleteTrackCascadeMock).toHaveBeenCalledTimes(1);
    expect(deleteTrackCascadeMock).toHaveBeenCalledWith("gone-b");
  });

  it("importLibrary does NOT prune when the fresh scan returned zero tracks (safety guard)", async () => {
    // Empty scan usually means the folder is unreachable, not that every file
    // vanished. Nuking the library in that case would be catastrophic.
    invokeMock.mockResolvedValueOnce([]);
    listAllMock.mockResolvedValueOnce([
      { id: "orphan-1", path: "/lib/song.mp3", origin: "local", added_at: 0 },
    ]);
    const result = await importLibrary("/lib");
    expect(result.imported).toBe(0);
    expect(result.pruned).toBe(0);
    expect(deleteTrackCascadeMock).not.toHaveBeenCalled();
  });

  it("importLibrary spares rows outside the current rootPath (no cross-root prune)", async () => {
    // A row under /other-lib is not the current scan's concern — it might
    // come back the next time the user points at that root.
    invokeMock.mockResolvedValueOnce([
      { path: "/lib/keep.mp3", title: "K", artist: null, album: null, duration_ms: 100 },
    ]);
    findByPathMock.mockResolvedValue({ id: "keep" });
    listAllMock.mockResolvedValueOnce([
      { id: "keep", path: "/lib/keep.mp3", origin: "local", added_at: 0 },
      { id: "elsewhere", path: "/other-lib/song.mp3", origin: "local", added_at: 0 },
      // /lib matched as prefix would be a false positive without the
      // trailing-slash guard; make sure that guard actually holds:
      { id: "prefix-collision", path: "/library/collision.mp3", origin: "local", added_at: 0 },
    ]);
    const result = await importLibrary("/lib");
    expect(result.imported).toBe(0);
    expect(result.pruned).toBe(0);
    expect(deleteTrackCascadeMock).not.toHaveBeenCalled();
  });

  it("extractLyricsForTracks returns 0 when no provider", async () => {
    const tracks: LibraryTrack[] = [
      { id: "t1", path: "/a.mp3", origin: "local", added_at: 0 },
    ];
    const n = await extractLyricsForTracks(tracks);
    expect(n).toBe(0);
  });
});
