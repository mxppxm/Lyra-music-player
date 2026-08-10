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

  it("parses 王菲《主角》 studio-repost titles", () => {
    const id = parseTrackIdentity("王菲《主角》百万豪装录音棚大声听", {
      uploader: "JLRS-LeoFM",
    });
    expect(id.songTitle).toBe("主角");
    expect(id.artist).toBe("王菲");
  });

  it("strips lyric quotes and studio noise after 《title》- artist", () => {
    const id = parseTrackIdentity(
      "【Hi-Res无损音质】《主角》- 王菲“我站在舞台中央”百万豪装录音棚试听 大屏歌词版",
      { uploader: "蒸汽和弦" },
    );
    expect(id.songTitle).toBe("主角");
    expect(id.artist).toBe("王菲");
  });

  it("treats fullwidth ｜ as separator noise, not artist", () => {
    const id = parseTrackIdentity(
      "【Hi-Res无损音质】｜《主角》- 王菲“吞了流言，才算红了一遍”百万豪装录音棚试听",
      { uploader: "蒸汽和弦" },
    );
    expect(id.songTitle).toBe("主角");
    expect(id.artist).toBe("王菲");
  });
});
