import { describe, it, expect } from "vitest";
import {
  profileQualityMultiplier,
  tagOverlap,
  profileSearchHaystack,
  tokenize,
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

  describe("tokenize", () => {
    it("splits on spaces and punctuation", () => {
      expect(tokenize("hello world")).toEqual(["hello", "world"]);
    });

    it("generates bigrams for CJK segments longer than 2 chars", () => {
      const tokens = tokenize("深夜下班");
      expect(tokens).toContain("深夜");
      expect(tokens).toContain("夜下");
      expect(tokens).toContain("下班");
      expect(tokens).toContain("深夜下班"); // whole segment kept
    });

    it("keeps 2-char CJK segments as-is", () => {
      expect(tokenize("无聊")).toEqual(["无聊"]);
    });

    it("bigrams enable partial match against profile tags", () => {
      // "深夜下班" bigrams include "深夜" → "深夜独处".includes("深夜") === true
      const tokens = tokenize("深夜下班");
      const hay = "深夜独处";
      const hit = tokens.some((t) => hay.includes(t));
      expect(hit).toBe(true);
    });

    it("handles mixed CJK and Latin input", () => {
      const tokens = tokenize("想听 rock 深夜下班");
      expect(tokens).toContain("rock");
      expect(tokens).toContain("深夜");
      expect(tokens).toContain("下班");
    });
  });
});
