import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchJson = vi.fn();

vi.mock("@lyra/platform", () => ({
  getLyraPlatform: () => ({ fetchJson }),
}));

import { searchBilibiliOpen } from "./api";

beforeEach(() => {
  fetchJson.mockReset();
});

describe("searchBilibiliOpen", () => {
  it("uses raw title as keyword and totalrank (no studio channel / no click sort)", async () => {
    fetchJson.mockResolvedValue({
      data: {
        result: [
          {
            bvid: "BV1top",
            aid: 1,
            title: "山丘",
            author: "y",
            duration: "4:20",
            pic: "",
            tag: "",
            play: 100,
          },
          {
            bvid: "BV1hi",
            aid: 2,
            title: "山丘 高播放",
            author: "x",
            duration: "3:00",
            pic: "",
            tag: "",
            play: 9999,
          },
        ],
      },
    });

    const { tracks } = await searchBilibiliOpen("山丘", 5);
    expect(fetchJson).toHaveBeenCalled();
    const firstUrl = String(fetchJson.mock.calls[0][0]);
    expect(firstUrl).toContain("keyword=%E5%B1%B1%E4%B8%98");
    expect(firstUrl).not.toContain("%E7%99%BE%E4%B8%87%E8%B1%AA%E8%A3%85"); // 百万豪装
    expect(firstUrl).toContain("order=totalrank");
    expect(firstUrl).not.toContain("order=click");
    // Keep API综合排序 order — do not re-rank by play_count
    expect(tracks[0]?.bvid).toBe("BV1top");
  });
});
