import { describe, it, expect } from "vitest";
import { buildSharePayload } from "./share";
import type { LibraryTrack } from "@lyra/core";

function makeTrack(overrides: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    id: "bili:BV1m73t69E8E",
    path: "bili:__pending__:BV1m73t69E8E",
    origin: "web",
    title: "《程艾影》- 赵雷",
    artist: "蒸汽和弦",
    added_at: Date.now(),
    metadata: { bvid: "BV1m73t69E8E" },
    ...overrides,
  };
}

describe("buildSharePayload", () => {
  it("includes song title, artist, blurb and bilibili link in text + url", () => {
    const payload = buildSharePayload(makeTrack(), "没有奇迹 没有惊喜");
    expect(payload.title).toBe("Lyra | 《程艾影》- 赵雷");
    expect(payload.url).toBe("https://www.bilibili.com/video/BV1m73t69E8E");
    expect(payload.text).toContain("♫ 《程艾影》- 赵雷 - 蒸汽和弦");
    expect(payload.text).toContain("没有奇迹 没有惊喜");
    expect(payload.text).toContain("https://www.bilibili.com/video/BV1m73t69E8E");
  });

  it("falls back to a default blurb when rationale is empty/whitespace", () => {
    const payload = buildSharePayload(makeTrack(), "   ");
    expect(payload.text).toContain("Lyra 刚给我挑了这首，一起听。");
  });

  it("omits url when the track has no bvid", () => {
    const payload = buildSharePayload(makeTrack({ metadata: undefined }));
    expect(payload.url).toBeUndefined();
    expect(payload.text).not.toContain("bilibili.com");
  });

  it("omits artist segment when track has no artist", () => {
    const payload = buildSharePayload(
      makeTrack({ artist: undefined }),
      "",
    );
    expect(payload.text).toContain("♫ 《程艾影》- 赵雷");
    expect(payload.text).not.toContain(" - 蒸汽和弦");
  });
});
