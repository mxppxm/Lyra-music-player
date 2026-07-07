import { describe, it, expect } from "vitest";
import { songDisplayTitle, songDisplayArtist } from "./display";
import type { LibraryTrack } from "../types";

function track(overrides: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    id: "t",
    path: "/x.mp3",
    origin: "local",
    added_at: 0,
    ...overrides,
  };
}

describe("songDisplayTitle", () => {
  it("returns metadata title when present", () => {
    expect(songDisplayTitle(track({ title: "Nuvole Bianche" }))).toBe(
      "Nuvole Bianche",
    );
  });

  it("falls back to basename without extension when title is missing", () => {
    expect(
      songDisplayTitle(track({ path: "/Users/x/Music/nuvole-bianche.mp3" })),
    ).toBe("nuvole-bianche");
  });

  it("falls back for wav / flac / m4a", () => {
    expect(songDisplayTitle(track({ path: "/tmp/song-a.wav" }))).toBe("song-a");
    expect(songDisplayTitle(track({ path: "/tmp/foo.flac" }))).toBe("foo");
    expect(songDisplayTitle(track({ path: "/tmp/bar.m4a" }))).toBe("bar");
  });

  it("handles a filename without extension", () => {
    expect(songDisplayTitle(track({ path: "/tmp/noext" }))).toBe("noext");
  });

  it("treats empty/whitespace-only title as missing", () => {
    expect(
      songDisplayTitle(track({ title: "   ", path: "/tmp/fallback.mp3" })),
    ).toBe("fallback");
  });

  it("preserves unicode in title and in basename fallback", () => {
    expect(songDisplayTitle(track({ title: "后来" }))).toBe("后来");
    expect(songDisplayTitle(track({ path: "/tmp/《后来》.mp3" }))).toBe(
      "《后来》",
    );
  });
});

describe("songDisplayArtist", () => {
  it("returns artist when present", () => {
    expect(songDisplayArtist(track({ artist: "刘若英" }))).toBe("刘若英");
  });

  it("returns empty string when artist is missing", () => {
    expect(songDisplayArtist(track({}))).toBe("");
  });

  it("returns empty string for whitespace-only artist", () => {
    expect(songDisplayArtist(track({ artist: "   " }))).toBe("");
  });
});
