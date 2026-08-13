import { describe, it, expect, vi } from "vitest";
import { webFetch } from "./webFetch";

describe("webFetch", () => {
  it("returns stripped page text from https URLs", async () => {
    const getHtml = vi.fn(async () => {
      return `<html><head><style>p{color:red}</style></head>
        <body>
          <script>alert(1)</script>
          <p>故事的小黄花<br>从出生那年就飘着</p>
        </body></html>`;
    });
    const out = await webFetch("https://www.mulanci.org/lyric/sl1", getHtml);
    expect(out).toContain("故事的小黄花");
    expect(out).toContain("从出生那年就飘着");
    expect(out).not.toContain("alert");
    expect(out).not.toContain("color:red");
    expect(getHtml).toHaveBeenCalledWith("https://www.mulanci.org/lyric/sl1");
  });

  it("rejects non-https URLs", async () => {
    const getHtml = vi.fn(async () => "nope");
    await expect(webFetch("http://example.com/x", getHtml)).resolves.toMatch(
      /https/i,
    );
    expect(getHtml).not.toHaveBeenCalled();
  });
});
