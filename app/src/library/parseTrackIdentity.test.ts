import { describe, it, expect } from "vitest";
import { parseTrackIdentity } from "./parseTrackIdentity";

describe("parseTrackIdentity", () => {
  it("parses Song - Artist from repost title", () => {
    const id = parseTrackIdentity("下雨天 - 南拳妈妈", { uploader: "JLRS-LeoFM" });
    expect(id.songTitle).toBe("下雨天");
    expect(id.artist).toBe("南拳妈妈");
    expect(id.isStudioCover).toBe(true);
  });

  it("strips 百万豪装 branding and flags studio cover", () => {
    const id = parseTrackIdentity("【百万豪装录音棚】下雨天 - 南拳妈妈", {
      uploader: "JLRS-LeoFM",
    });
    expect(id.songTitle).toBe("下雨天");
    expect(id.artist).toBe("南拳妈妈");
    expect(id.isStudioCover).toBe(true);
  });

  it("parses 《title》artist form", () => {
    const id = parseTrackIdentity("南拳妈妈《下雨天》", { uploader: "JLRS-LeoFM" });
    expect(id.songTitle).toBe("下雨天");
    expect(id.artist).toBe("南拳妈妈");
  });

  it("does not treat uploader as artist", () => {
    const id = parseTrackIdentity("某首歌", { uploader: "JLRS-LeoFM" });
    expect(id.artist).toBe("");
    expect(id.uploader).toBe("JLRS-LeoFM");
  });
});
