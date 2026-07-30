import { describe, it, expect } from "vitest";
import { toRow, fromRow } from "./libraryTrack";
import type { LibraryTrack } from "../../types";

const sample: LibraryTrack = {
  id: "track-01",
  path: "/Users/x/Music/song.mp3",
  origin: "local",
  title: "Nuvole Bianche",
  artist: "Ludovico Einaudi",
  album: "Una Mattina",
  duration_ms: 358_000,
  added_at: 1730000000000,
  metadata: { bitrate_kbps: 320 },
};

describe("libraryTrack codec", () => {
  it("round-trips a fully populated track", () => {
    expect(fromRow(toRow(sample))).toEqual(sample);
  });

  it("round-trips a minimal track (only required fields)", () => {
    const t: LibraryTrack = {
      id: "t-min",
      path: "/x.mp3",
      origin: "local",
      added_at: 100,
    };
    const row = toRow(t);
    expect(row.title).toBeNull();
    expect(row.artist).toBeNull();
    expect(row.album).toBeNull();
    expect(row.duration_ms).toBeNull();
    expect(row.metadata_json).toBeNull();
    expect(fromRow(row)).toEqual(t);
  });

  it("preserves origin variants", () => {
    for (const origin of ["local", "web", "generated"] as const) {
      const t: LibraryTrack = { ...sample, origin };
      expect(fromRow(toRow(t)).origin).toBe(origin);
    }
  });

  it("preserves unicode in title/artist", () => {
    const t: LibraryTrack = { ...sample, title: "后来", artist: "刘若英" };
    expect(fromRow(toRow(t)).title).toBe("后来");
    expect(fromRow(toRow(t)).artist).toBe("刘若英");
  });
});
