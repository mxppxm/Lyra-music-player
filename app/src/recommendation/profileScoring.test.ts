import { describe, it, expect } from "vitest";
import {
  profileQualityMultiplier,
  tagOverlap,
  profileSearchHaystack,
} from "./profileScoring";
import type { MusicProfile } from "../types/musicProfile";

describe("profileScoring", () => {
  it("boosts recognized profiles", () => {
    expect(profileQualityMultiplier({ recognized: true } as MusicProfile)).toBeGreaterThan(1);
    expect(profileQualityMultiplier({ llm_unknown: true } as MusicProfile)).toBeLessThan(0.7);
  });

  it("matches emotion labels to mood tags", () => {
    expect(tagOverlap(["疲惫"], [], ["平静", "疲惫"])).toBeGreaterThan(0);
  });

  it("includes canonical work in search haystack", () => {
    const hay = profileSearchHaystack(
      { title: "下雨天", artist: "南拳妈妈" },
      {
        canonical_work: "南拳妈妈 - 下雨天 (2008)",
        genre: ["mandopop"],
        mood: [],
        lyrical_themes: ["思念"],
      } as unknown as MusicProfile,
    );
    expect(hay).toContain("mandopop");
    expect(hay).toContain("思念");
  });
});
