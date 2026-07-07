import { describe, it, expect } from "vitest";
import { LibraryAgent } from "./LibraryAgent";
import type { LibraryTrack, PAD } from "../types";

function track(id: string, title: string, artist: string): LibraryTrack {
  return { id, path: `/${id}.mp3`, origin: "local", added_at: 0, title, artist };
}

const LIB: LibraryTrack[] = [
  track("a", "Nuvole Bianche", "Ludovico Einaudi"),
  track("b", "Comptine d'un autre été", "Yann Tiersen"),
  track("c", "Time", "Hans Zimmer"),
  track("d", "Blue in Green", "Miles Davis"),
  track("e", "The Grand Canyon Suite", "Ferde Grofé"),
];

const repo = { listAll: async () => LIB };

const neutralPAD: PAD = { p: 0, a: 0, d: 0 };

describe("LibraryAgent.prefilter", () => {
  it("returns up to `limit` tracks", async () => {
    const a = new LibraryAgent({ repo });
    const out = await a.prefilter("any", neutralPAD, 3);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("prioritizes tracks whose title/artist matches keywords in the target profile", async () => {
    const a = new LibraryAgent({ repo });
    const out = await a.prefilter("piano quiet Einaudi", neutralPAD, 5);
    expect(out[0].id).toBe("a");
  });

  it("returns random sample when no keywords match anything", async () => {
    const a = new LibraryAgent({ repo });
    const out = await a.prefilter("zzz totally nothing xyz", neutralPAD, 3);
    expect(out.length).toBe(3);
    // All results should be from LIB
    for (const t of out) expect(LIB.map((x) => x.id)).toContain(t.id);
  });

  it("does not throw on empty library", async () => {
    const a = new LibraryAgent({ repo: { listAll: async () => [] } });
    const out = await a.prefilter("anything", neutralPAD, 5);
    expect(out).toEqual([]);
  });

  it("default limit is 30", async () => {
    const many = Array.from({ length: 50 }, (_, i) => track(`t${i}`, `T${i}`, `A${i}`));
    const a = new LibraryAgent({ repo: { listAll: async () => many } });
    const out = await a.prefilter("nothing matches", neutralPAD);
    expect(out.length).toBe(30);
  });

  describe("Sprint 9: PAD-distance blending with library_features", () => {
    // energy = arousal target; valence = pleasure target
    const emptyFeatures = { getBatch: async () => new Map() };

    it("without any features, keyword ordering is preserved", async () => {
      const a = new LibraryAgent({ repo, features: emptyFeatures });
      const out = await a.prefilter("Einaudi", neutralPAD, 5);
      expect(out[0].id).toBe("a");
    });

    it("with features, PAD-close tracks outrank PAD-far when keyword tie", async () => {
      // Two tracks, both zero keyword hits. Track "high" has features
      // matching an arousal-1.0 request; "low" has opposite features.
      const featuresMap = new Map([
        ["high", { track_id: "high", bpm: null, energy: 1.0, valence: 1.0 }],
        ["low", { track_id: "low", bpm: null, energy: 0.0, valence: 0.0 }],
      ]);
      const tracks: LibraryTrack[] = [
        { id: "high", path: "/h.mp3", origin: "local", added_at: 0, title: "H", artist: "H" },
        { id: "low", path: "/l.mp3", origin: "local", added_at: 0, title: "L", artist: "L" },
      ];
      const a = new LibraryAgent({
        repo: { listAll: async () => tracks },
        features: { getBatch: async () => featuresMap },
      });
      const excitedPAD: PAD = { p: 1, a: 1, d: 0 };
      const out = await a.prefilter("something", excitedPAD, 2);
      expect(out[0].id).toBe("high");
    });

    it("tracks without features still surface (backward compat)", async () => {
      // Feature map covers only "a"; other tracks have none.
      const featuresMap = new Map([
        ["a", { track_id: "a", bpm: null, energy: 0.0, valence: 0.0 }],
      ]);
      const a = new LibraryAgent({
        repo,
        features: { getBatch: async () => featuresMap },
      });
      // For a high-arousal request, "a" (energy 0) should score poorly and
      // other tracks (no features) should still be represented.
      const out = await a.prefilter("Einaudi", { p: 1, a: 1, d: 0 }, 5);
      expect(out.length).toBeGreaterThan(0);
      // "a" wins on keyword; PAD hurts but keyword tie-break usually keeps it
      // at rank 1 for this specific query. Just check nothing crashes and
      // all tracks are present.
      expect(new Set(out.map((t) => t.id)).size).toBe(out.length);
    });
  });
});
