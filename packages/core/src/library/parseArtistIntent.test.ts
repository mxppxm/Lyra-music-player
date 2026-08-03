import { describe, it, expect } from "vitest";
import { parseArtistIntent, trackMatchesArtist } from "./parseArtistIntent";

describe("parseArtistIntent", () => {
  it("parses bare artist name", () => {
    expect(parseArtistIntent("梁博")).toBe("梁博");
    expect(parseArtistIntent("  朴树  ")).toBe("朴树");
  });

  it("parses explicit artist requests", () => {
    expect(parseArtistIntent("我想听梁博")).toBe("梁博");
    expect(parseArtistIntent("来首梁博的")).toBe("梁博");
    expect(parseArtistIntent("只听朴树")).toBe("朴树");
    expect(parseArtistIntent("换陈粒")).toBe("陈粒");
  });

  it("parses artist + mood tail", () => {
    expect(parseArtistIntent("梁博 安静点的")).toBe("梁博");
    expect(parseArtistIntent("朴树 有点累")).toBe("朴树");
  });

  it("returns null for mood-only utterances", () => {
    expect(parseArtistIntent("最近有点累")).toBeNull();
    expect(parseArtistIntent("想放空一下")).toBeNull();
    expect(parseArtistIntent("今天下雨了")).toBeNull();
  });

  it("returns null for generic play requests", () => {
    expect(parseArtistIntent("来一首歌")).toBeNull();
    expect(parseArtistIntent("随便")).toBeNull();
  });
});

describe("trackMatchesArtist", () => {
  it("matches artist field fuzzily", () => {
    expect(
      trackMatchesArtist({ title: "男孩", artist: "梁博" }, null, "梁博"),
    ).toBe(true);
    expect(
      trackMatchesArtist({ title: "其他", artist: "朴树" }, null, "梁博"),
    ).toBe(false);
  });

  it("falls back to canonical_work", () => {
    expect(
      trackMatchesArtist(
        { title: "cover", artist: "" },
        { canonical_work: "男孩 - 梁博" } as any,
        "梁博",
      ),
    ).toBe(true);
  });

  it("matches artist in title or bilibili tag when artist field is uploader", () => {
    expect(
      trackMatchesArtist(
        {
          title: "梁博《曾经是情侣》百万豪装录音棚大声听",
          artist: "帅哥黄绿红",
          metadata: { tag: "梁博,高音质,录音" },
        },
        null,
        "梁博",
      ),
    ).toBe(true);
  });
});
