import { describe, it, expect, vi } from "vitest";
import { webSearch } from "./webSearch";

const LITE_HTML = `
<html><body>
<table>
  <tr>
    <td>
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.mulanci.org%2Flyric%2Fsl114692%2F&rut=abc" class='result-link'>晴天-歌词-周杰伦</a>
    </td>
  </tr>
  <tr>
    <td class='result-snippet'>故事的小黄花 从出生那年就飘着</td>
  </tr>
</table>
</body></html>
`;

const HTML_ENDPOINT = `
<html><body>
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="https://lyrics.net.cn/lyrics/71311">晴天 周杰伦 歌词</a>
  </h2>
  <a class="result__snippet" href="#">童年的荡秋千随记忆一直晃到现在</a>
</body></html>
`;

describe("webSearch", () => {
  it("hits DuckDuckGo lite first and decodes uddg= redirect URLs", async () => {
    const getHtml = vi.fn(async (url: string) => {
      if (url.includes("lite.duckduckgo.com")) return LITE_HTML;
      return "";
    });

    const out = await webSearch("晴天 周杰伦 歌词", getHtml);
    expect(out).toContain("晴天-歌词-周杰伦");
    expect(out).toContain("https://www.mulanci.org/lyric/sl114692/");
    expect(out).toContain("故事的小黄花");
    expect(out).not.toContain("uddg=");

    const firstUrl = String(getHtml.mock.calls[0]![0]);
    expect(firstUrl).toContain("lite.duckduckgo.com/lite/");
    expect(firstUrl).toContain(encodeURIComponent("晴天 周杰伦 歌词"));
    expect(getHtml.mock.calls.some(([u]) => String(u).includes("baidu.com"))).toBe(
      false,
    );
  });

  it("falls back to html.duckduckgo.com when lite has no results", async () => {
    const getHtml = vi.fn(async (url: string) => {
      if (url.includes("lite.duckduckgo.com")) return "<html><body>empty</body></html>";
      if (url.includes("html.duckduckgo.com")) return HTML_ENDPOINT;
      return "";
    });

    const out = await webSearch("晴天 歌词", getHtml);
    expect(out).toContain("lyrics.net.cn");
    expect(out).toContain("晴天 周杰伦 歌词");
    expect(
      getHtml.mock.calls.some(([u]) => String(u).includes("html.duckduckgo.com")),
    ).toBe(true);
  });

  it("does not fetch result pages itself", async () => {
    const getHtml = vi.fn(async (url: string) => {
      if (url.includes("lite.duckduckgo.com")) return LITE_HTML;
      throw new Error(`unexpected fetch: ${url}`);
    });
    const out = await webSearch("晴天 歌词", getHtml);
    expect(out).toContain("mulanci.org");
    expect(getHtml).toHaveBeenCalledOnce();
  });

  it("reports an empty result set", async () => {
    const getHtml = vi.fn(async () => "<html><body>nothing</body></html>");
    await expect(webSearch("不存在的歌 xyzzy", getHtml)).resolves.toMatch(
      /no results/i,
    );
  });
});
