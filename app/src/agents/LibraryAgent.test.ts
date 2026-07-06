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
});
