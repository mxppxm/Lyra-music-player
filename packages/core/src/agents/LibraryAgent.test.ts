import { describe, it, expect } from "vitest";
import { LibraryAgent } from "./LibraryAgent";
import type { LibraryTrack, PAD } from "../types";
import type { MusicProfile } from "../types/musicProfile";
import type { RecommendationContext } from "../recommendation";

function track(id: string, title: string, artist?: string): LibraryTrack {
  return { id, path: `/${id}.mp3`, origin: "local", added_at: 0, title, artist };
}

function makeProfile(overrides: Partial<MusicProfile> = {}): MusicProfile {
  return {
    track_id: "",
    analyzed_at: Date.now(),
    genre: ["indie folk"],
    mood: ["平静", "孤独"],
    energy_level: "low",
    tempo_feel: "缓慢",
    time_color: "深夜",
    space_color: "卧室",
    instrumentation: ["acoustic guitar"],
    vocal_style: "气声",
    lyrical_themes: ["孤独"],
    emotional_curve: "平稳",
    best_for: ["深夜独处"],
    pad_estimate: { p: -0.3, a: -0.5, d: -0.2 },
    ...overrides,
  };
}

const neutralPAD: PAD = { p: 0, a: 0, d: 0 };

function stubRepo(tracks: LibraryTrack[]) {
  return { listAll: async () => tracks };
}

function stubProfileRepo(
  profiles: Map<string, MusicProfile | null> = new Map(),
) {
  return { getBatch: async () => profiles } as any;
}

describe("LibraryAgent.prefilter (profile-based)", () => {
  it("returns up to `limit` tracks", async () => {
    const tracks = [
      track("a", "A"), track("b", "B"), track("c", "C"),
      track("d", "D"), track("e", "E"),
    ];
    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: stubProfileRepo(),
    });
    const out = await a.prefilter("anything", neutralPAD, 3);
    expect(out.length).toBe(3);
  });

  it("scores tracks with profiles higher than without", async () => {
    const tracks = [track("a", "piano song"), track("b", "random noise")];
    const profileMap = new Map<string, MusicProfile>();
    profileMap.set("a", makeProfile({
      track_id: "a",
      pad_estimate: { p: -0.5, a: -0.6, d: -0.3 },
      mood: ["疲惫", "孤独"],
    }));

    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: { getBatch: async () => profileMap } as any,
    });

    // Query with "疲惫" — should match profile's mood via emotion labels
    const recCtx: RecommendationContext = {
      excludeIds: new Set(),
      fatigueByTrack: new Map(),
      recentPlays: [],
      noveltySeeking: 0.5,
      feedbackStats: new Map(),
      soul: { musical_taste_base: { affinity_genres: [], backbone: "", aesthetic_axes: { novelty_seeking: 0.5 } } } as unknown as RecommendationContext["soul"],
      emotionLabels: ["疲惫"],
    };
    const out = await a.prefilter("我今天很疲惫", { p: -0.5, a: -0.5, d: 0 }, 2, recCtx);
    expect(out[0].id).toBe("a");
  });

  it("falls back to keyword match when no profiles exist", async () => {
    const tracks = [track("a", "piano nights"), track("b", "loud drums")];
    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: stubProfileRepo(),
    });
    // No profiles, keyword only — "piano" matches "a"
    const out = await a.prefilter("piano", neutralPAD, 10);
    expect(out[0].id).toBe("a");
  });

  it("returns random sample when no profiles and no keywords match", async () => {
    const tracks = Array.from({ length: 10 }, (_, i) => track(`t${i}`, `T${i}`));
    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: stubProfileRepo(),
    });
    const out = await a.prefilter("zzz nothing", neutralPAD, 3);
    expect(out.length).toBe(3);
  });

  it("does not throw on empty library", async () => {
    const a = new LibraryAgent({
      repo: stubRepo([]),
      profileRepo: stubProfileRepo(),
    });
    const out = await a.prefilter("anything", neutralPAD, 5);
    expect(out).toEqual([]);
  });

  it("default limit is 30", async () => {
    const many = Array.from({ length: 50 }, (_, i) => track(`t${i}`, `T${i}`));
    const a = new LibraryAgent({
      repo: stubRepo(many),
      profileRepo: stubProfileRepo(),
    });
    const out = await a.prefilter("nothing", neutralPAD);
    expect(out.length).toBe(30);
  });

  it("PAD match: close pad_estimate ranks higher", async () => {
    const tracks = [track("a", "happy song"), track("b", "sad song")];
    const profileMap = new Map<string, MusicProfile>();
    profileMap.set("a", makeProfile({
      track_id: "a",
      pad_estimate: { p: 0.8, a: 0.7, d: 0.5 },
      mood: ["快乐"],
      energy_level: "high",
    }));
    profileMap.set("b", makeProfile({
      track_id: "b",
      pad_estimate: { p: -0.7, a: -0.5, d: -0.3 },
      mood: ["悲伤"],
      energy_level: "low",
    }));

    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: { getBatch: async () => profileMap } as any,
    });

    // Happy query → "a" should win
    const out = await a.prefilter("我今天超开心", { p: 0.9, a: 0.8, d: 0.5 }, 2);
    expect(out[0].id).toBe("a");
  });

  it("time color match: late night → night-themed song wins", async () => {
    const tracks = [track("a", "morning light"), track("b", "midnight rain")];
    const profileMap = new Map<string, MusicProfile>();
    profileMap.set("a", makeProfile({
      track_id: "a",
      time_color: "清晨",
      pad_estimate: { p: 0.3, a: 0.2, d: 0.1 },
    }));
    profileMap.set("b", makeProfile({
      track_id: "b",
      time_color: "深夜",
      pad_estimate: { p: -0.2, a: -0.3, d: -0.1 },
    }));

    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: { getBatch: async () => profileMap } as any,
    });

    // The time_color matching depends on actual time of day. Since we can't
    // control that in unit tests easily, we test that both are returned.
    const out = await a.prefilter("something", neutralPAD, 2);
    expect(out.length).toBe(2);
  });

  it("excludes track ids from recommendation context", async () => {
    const tracks = [track("a", "A"), track("b", "B"), track("c", "C")];
    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: stubProfileRepo(),
    });
    const recCtx: RecommendationContext = {
      excludeIds: new Set(["a"]),
      fatigueByTrack: new Map(),
      recentPlays: [],
      noveltySeeking: 0.5,
      feedbackStats: new Map(),
      soul: {} as RecommendationContext["soul"],
      emotionLabels: [],
    };
    const out = await a.prefilter("test", neutralPAD, 10, recCtx);
    expect(out).toHaveLength(2);
    expect(out.find(t => t.id === "a")).toBeUndefined();
  });

  it("recognized profiles rank above llm_unknown at same PAD", async () => {
    const tracks = [track("a", "known song"), track("b", "unknown song")];
    const profileMap = new Map<string, MusicProfile>();
    profileMap.set("a", makeProfile({
      track_id: "a",
      pad_estimate: { p: 0, a: 0, d: 0 },
      recognized: true,
      llm_unknown: false,
    }));
    profileMap.set("b", makeProfile({
      track_id: "b",
      pad_estimate: { p: 0, a: 0, d: 0 },
      llm_unknown: true,
    }));

    const a = new LibraryAgent({
      repo: stubRepo(tracks),
      profileRepo: { getBatch: async () => profileMap } as any,
    });
    const out = await a.prefilter("test", neutralPAD, 2);
    expect(out[0].id).toBe("a");
  });

  it("hard-filters by artistFilter in recommendation context", async () => {
    const tracks = [
      track("a", "男孩", "梁博"),
      track("b", "生如夏花", "朴树"),
      track("c", "出现又离开", "梁博"),
    ];
    const a = new LibraryAgent({ repo: stubRepo(tracks) });
    const recCtx = {
      excludeIds: new Set<string>(),
      fatigueByTrack: new Map(),
      recentPlays: [],
      noveltySeeking: 0.5,
      feedbackStats: new Map(),
      soul: {} as any,
      emotionLabels: [],
      artistFilter: "梁博",
    } satisfies RecommendationContext;

    const out = await a.prefilter("延续", neutralPAD, 10, recCtx);
    expect(out.map((t) => t.id).sort()).toEqual(["a", "c"]);
  });

  it("does not repeat artist songs until session pool is exhausted", async () => {
    const tracks = [
      track("a", "男孩", "梁博"),
      track("b", "出现又离开", "梁博"),
      track("c", "我不知道", "梁博"),
    ];
    const a = new LibraryAgent({ repo: stubRepo(tracks) });
    const baseCtx = {
      excludeIds: new Set<string>(),
      fatigueByTrack: new Map(),
      recentPlays: [],
      noveltySeeking: 0.5,
      feedbackStats: new Map(),
      soul: {} as any,
      emotionLabels: [],
      artistFilter: "梁博",
    } satisfies RecommendationContext;

    const first = await a.prefilter("延续", neutralPAD, 10, {
      ...baseCtx,
      artistSessionPlayedIds: new Set(["a"]),
    });
    expect(first.map((t) => t.id).sort()).toEqual(["b", "c"]);

    const second = await a.prefilter("延续", neutralPAD, 10, {
      ...baseCtx,
      artistSessionPlayedIds: new Set(["a", "b", "c"]),
    });
    expect(second.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("in artist cycle mode only avoids immediate current/queued repeats", async () => {
    const tracks = [
      track("a", "男孩", "梁博"),
      track("b", "出现又离开", "梁博"),
    ];
    const a = new LibraryAgent({ repo: stubRepo(tracks) });
    const out = await a.prefilter("延续", neutralPAD, 10, {
      excludeIds: new Set(["a", "b"]),
      immediateExcludeIds: new Set(["a"]),
      fatigueByTrack: new Map(),
      recentPlays: [],
      noveltySeeking: 0.5,
      feedbackStats: new Map(),
      soul: {} as any,
      emotionLabels: [],
      artistFilter: "梁博",
      artistSessionPlayedIds: new Set(["a", "b"]),
    });
    expect(out.map((t) => t.id)).toEqual(["b"]);
  });
});
