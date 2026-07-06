import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const findByPathMock = vi.fn();
const insertTrackMock = vi.fn();
vi.mock("../db/repo/libraryRepo", () => ({
  findByPath: (...args: unknown[]) => findByPathMock(...args),
  insertTrack: (...args: unknown[]) => insertTrackMock(...args),
}));

import { scanLibrary, importLibrary } from "./libraryScan";

beforeEach(() => {
  invokeMock.mockReset();
  findByPathMock.mockReset();
  insertTrackMock.mockReset();
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
    const count = await importLibrary("/lib");
    expect(count).toBe(2); // a and c are new; b already existed
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
});
