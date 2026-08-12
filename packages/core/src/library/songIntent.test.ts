import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSongIntent } from "./songIntent";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as bilibiliApi from "../bilibili/api";
import type { LibraryTrack } from "../types";

vi.mock("../db/repo/libraryRepo", () => ({
  findByTitle: vi.fn(async () => []),
  batchInsertTracks: vi.fn(async () => 1),
}));

vi.mock("../bilibili/api", () => ({
  searchBilibili: vi.fn(async () => ({ tracks: [] })),
  searchBilibiliOpen: vi.fn(async () => ({ tracks: [] })),
  searchBilibiliByPlayCount: vi.fn(async () => ({ tracks: [] })),
}));

const localTrack = (id: string, title: string): LibraryTrack => ({
  id,
  path: `/local/${id}.mp3`,
  origin: "local",
  added_at: 0,
  title,
  metadata: { play_count: 100 },
});

const biliTrack = (bvid: string, title: string): any => ({
  bvid,
  aid: 123,
  title,
  author: "百万豪装录音棚",
  duration_ms: 240000,
  play_count: 50,
  cover: "//x",
  tag: "音乐",
});

beforeEach(() => {
  vi.mocked(libraryRepo.findByTitle).mockReset();
  vi.mocked(libraryRepo.findByTitle).mockResolvedValue([]);
  vi.mocked(libraryRepo.batchInsertTracks).mockReset();
  vi.mocked(libraryRepo.batchInsertTracks).mockResolvedValue(1);
  vi.mocked(bilibiliApi.searchBilibili).mockReset();
  vi.mocked(bilibiliApi.searchBilibili).mockResolvedValue({ tracks: [] });
  vi.mocked(bilibiliApi.searchBilibiliOpen).mockReset();
  vi.mocked(bilibiliApi.searchBilibiliOpen).mockResolvedValue({
    tracks: [],
  });
});

describe("resolveSongIntent — local match", () => {
  it("《》强制点歌：本地命中返回 source=local", async () => {
    vi.mocked(libraryRepo.findByTitle).mockResolvedValue([
      localTrack("bili:BV1", "《山丘》"),
    ]);
    const out = await resolveSongIntent("放一首《山丘》");
    expect(out).toMatchObject({ kind: "song", source: "local" });
    expect(bilibiliApi.searchBilibili).not.toHaveBeenCalled();
  });

  it("短文本启发式：本地命中（如输入「山丘」）", async () => {
    vi.mocked(libraryRepo.findByTitle).mockResolvedValue([
      localTrack("bili:BV2", "李宗盛《山丘》"),
    ]);
    const out = await resolveSongIntent("山丘");
    expect(out).toMatchObject({ kind: "song", source: "local" });
  });

  it("心情/功能词不误判为歌名，不发 B站请求", async () => {
    const out = await resolveSongIntent("来点开心的");
    expect(out.kind).toBe("mood");
    expect(libraryRepo.findByTitle).not.toHaveBeenCalled();
    expect(bilibiliApi.searchBilibili).not.toHaveBeenCalled();
  });
});

describe("resolveSongIntent — Bilibili fallback", () => {
  it("本地未命中 → 限定频道并按歌名搜（forceKeyword 附歌名）→ 取第一条入库返回 source=bilibili", async () => {
    vi.mocked(bilibiliApi.searchBilibili).mockResolvedValue({
      tracks: [biliTrack("BV111", "《冷门歌》- 某歌手 百万豪装录音棚")],
    });

    const out = await resolveSongIntent("《冷门歌》");
    expect(out.kind).toBe("song");
    if (out.kind === "song") {
      expect(out.source).toBe("bilibili");
      expect(out.song.id).toBe("bili:BV111");
      expect(out.song.path).toBe("bili:__pending__:BV111");
    }
    // 限定频道并按歌名搜，避免退化返回频道任意最新曲目
    expect(bilibiliApi.searchBilibili).toHaveBeenCalledWith(
      "百万豪装录音棚",
      5,
      "百万豪装录音棚 冷门歌",
    );
    expect(libraryRepo.batchInsertTracks).toHaveBeenCalledOnce();
  });

  it("短文本本地未命中 → 回落 mood，不发 B站请求（避免劫持日常输入）", async () => {
    // 默认 findByTitle 返回 []（本地未命中）
    const out = await resolveSongIntent("愿得一人心");
    expect(out.kind).toBe("mood");
    expect(bilibiliApi.searchBilibili).not.toHaveBeenCalled();
    expect(libraryRepo.batchInsertTracks).not.toHaveBeenCalled();
  });

  it("B站搜索失败 → 降级 mood，不抛错", async () => {
    vi.mocked(bilibiliApi.searchBilibili).mockRejectedValue(new Error("network"));

    const out = await resolveSongIntent("《山丘》");
    expect(out.kind).toBe("mood");
    expect(libraryRepo.batchInsertTracks).not.toHaveBeenCalled();
  });
});

describe("resolveStrictSongSearch — ♪ precise mode", () => {
  it("本地 includes 命中", async () => {
    const { resolveStrictSongSearch } = await import("./songIntent");
    vi.mocked(libraryRepo.findByTitle).mockResolvedValue([
      localTrack("bili:BV1", "李宗盛《山丘》"),
    ]);
    const out = await resolveStrictSongSearch("山丘");
    expect(out).toMatchObject({ kind: "song", source: "local" });
    expect(bilibiliApi.searchBilibiliOpen).not.toHaveBeenCalled();
  });

  it("本地未命中 → 通搜综合排序，不加频道限定词", async () => {
    const { resolveStrictSongSearch } = await import("./songIntent");
    vi.mocked(bilibiliApi.searchBilibiliOpen).mockResolvedValue({
      tracks: [biliTrack("BV999", "山丘 - 李宗盛")],
    });
    const out = await resolveStrictSongSearch("山丘");
    expect(out.kind).toBe("song");
    if (out.kind === "song") {
      expect(out.source).toBe("bilibili");
      expect(out.song.id).toBe("bili:BV999");
    }
    expect(bilibiliApi.searchBilibiliOpen).toHaveBeenCalledWith("山丘", 5);
    expect(bilibiliApi.searchBilibili).not.toHaveBeenCalled();
  });

  it("双未命中 → miss，不回落 mood", async () => {
    const { resolveStrictSongSearch } = await import("./songIntent");
    const out = await resolveStrictSongSearch("根本没有的歌xyz");
    expect(out.kind).toBe("miss");
  });
});
