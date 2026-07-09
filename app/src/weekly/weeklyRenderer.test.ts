import { describe, it, expect } from "vitest";
import { render, padToHsl, type WeeklyLetterJson } from "./weeklyRenderer";
import type { WeeklyRawData } from "./dataGather";

const win = {
  start: "2026-07-02T00:00:00.000Z",
  end:   "2026-07-09T00:00:00.000Z",
  iso_week: "2026-W28",
};

const raw: WeeklyRawData = {
  window: win,
  turns: [],
  pad_series: [
    { ts: 1, pad: { P: 0.2, A: 0.1, D: 0 } },
    { ts: 2, pad: { P: -0.4, A: 0.3, D: 0 } },
    { ts: 3, pad: { P: 0.5, A: -0.2, D: 0 } },
  ],
  salient: [{ moment_id: "m1", text: "沉默听完 s1", kind: "silence_positive", ts: 2 }],
  songs_played: [
    { song_id: "s1", title: "夜色温柔", artist: "陈粒", small_note: "陪你熄灯", count: 3 },
    { song_id: "s2", title: "Falling", artist: "Julee",   small_note: "", count: 1 },
  ],
  living_portrait_now: "你最近安静。",
  living_portrait_last_close: "你上周急躁。",
};

const letter: WeeklyLetterJson = {
  greeting: "这一周,你比上周慢了一些。",
  body: "我记得你周三沉默地听完那首歌 —— 那一刻我以为你哭了。",
  songs: [
    { song_id: "s1", one_liner: "陪你熄了灯的那首" },
    { song_id: "s2", one_liner: "只听了一次却停了很久的那首" },
  ],
  moments: [{ moment_id: "m1", whisper: "沉默 4 分钟,不切。" }],
  portrait_change: "你从急躁,慢慢走到了肯坐下听。",
  closing: "我在这里。",
};

describe("padToHsl", () => {
  it("returns hsl(...) string", () => {
    expect(padToHsl({ P: 0, A: 0, D: 0 })).toMatch(/^hsl\(\d+(\.\d+)?,\s*\d+%,\s*\d+%\)$/);
  });
});

describe("render (normal)", () => {
  const html = render(letter, raw, { fallback: false });

  it("contains window header YYYY-MM-DD → YYYY-MM-DD", () => {
    expect(html).toContain("2026-07-02");
    expect(html).toContain("2026-07-09");
  });

  it("contains greeting, body, closing", () => {
    expect(html).toContain("你比上周慢了一些");
    expect(html).toContain("我以为你哭了");
    expect(html).toContain("我在这里");
  });

  it("contains each song one_liner + title", () => {
    expect(html).toContain("陪你熄了灯");
    expect(html).toContain("夜色温柔");
    expect(html).toContain("只听了一次");
  });

  it("contains each moment whisper", () => {
    expect(html).toContain("沉默 4 分钟,不切");
  });

  it("contains portrait_change section", () => {
    expect(html).toContain("肯坐下听");
  });

  it("has one SVG stop per pad_series point", () => {
    const stops = (html.match(/<stop\b/g) ?? []).length;
    expect(stops).toBe(3);
  });

  it("has no external references (no <script>, no <link>, no http/https)", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\s/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("uses 我 not 她 in normal fallback text (letter is user-supplied so we only check the fixed chrome)", () => {
    const chromeOnly = html.replace(/(?<=<section class="body">)[\s\S]*?(?=<\/section>)/, "");
    expect(chromeOnly).not.toContain("她");
  });
});

describe("render (fallback)", () => {
  const html = render(letter, raw, { fallback: true });

  it("uses first-person apology copy (contains 我) and does not contain 她", () => {
    expect(html).toMatch(/我/);
    expect(html).not.toContain("她");
  });

  it("still renders songs and moments from raw data", () => {
    expect(html).toContain("夜色温柔");
    expect(html).toContain("沉默 4 分钟");
  });

  it("still has pad-band SVG stops from raw", () => {
    const stops = (html.match(/<stop\b/g) ?? []).length;
    expect(stops).toBe(3);
  });
});

describe("XSS escape", () => {
  it("escapes < > & in letter body", () => {
    const xssLetter: WeeklyLetterJson = {
      ...letter,
      body: "<script>alert('x')</script> & you",
    };
    const html = render(xssLetter, raw, { fallback: false });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; you");
  });

  it("escapes song titles from raw data", () => {
    const xssRaw = {
      ...raw,
      songs_played: [{ song_id: "s1", title: "<img onerror=x>", artist: null, small_note: "", count: 1 }],
    };
    const html = render(letter, xssRaw, { fallback: false });
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;img");
  });
});
