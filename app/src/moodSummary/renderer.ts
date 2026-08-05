// moodSummary/renderer.ts — 心情总结 HTML 渲染。
// 视觉语言与 weeklyRenderer 一致（同款色带、衬线字体、留白），
// 但内容专为「心情总结」设计：轨迹 + 时段分布 + 文案。

import type { MoodSummaryData, PeriodAggregate } from "@lyra/core/moodSummary/summarizeMood";
import type { MoodSummaryJson } from "@lyra/core/moodSummary/MoodSummaryAgent";

export type MoodSummaryRenderInput = {
  data: MoodSummaryData;
  summary: MoodSummaryJson;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// 与 weeklyRenderer.padToHsl 相同的 PAD → HSL 映射，保证两处观感一致。
export function padToHsl(pad: { p: number; a: number; d: number }): string {
  const h = Math.round(210 - 210 * clamp(pad.p, -1, 1));
  const s = Math.round(20 + 40 * Math.abs(clamp(pad.a, -1, 1)));
  const l = Math.round(70 + 10 * clamp(pad.d, -1, 1));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

/** 轨迹色带：起→终的渐变（与周信 pad-band 同款）。 */
function renderTrajectoryBand(data: MoodSummaryData): string {
  const t = data.trajectory;
  const stops = [
    `<stop offset="0%" stop-color="${padToHsl(t.start_pad)}" />`,
    `<stop offset="100%" stop-color="${padToHsl(t.end_pad)}" />`,
  ].join("");
  return `<svg viewBox="0 0 100 6" preserveAspectRatio="none">
    <defs><linearGradient id="mb" x1="0" x2="1">${stops}</linearGradient></defs>
    <rect x="0" y="0" width="100" height="6" fill="url(#mb)" />
  </svg>`;
}

/** 时段分布：每段一条色块 + 轮数。 */
function renderPeriods(periods: PeriodAggregate[]): string {
  if (periods.length === 0) return "";
  return periods
    .map((p) => {
      const w = Math.max(8, Math.round((p.count / Math.max(1, periods[0].count)) * 100));
      return `
      <div class="period">
        <span class="period-label">${escapeHtml(p.label)}</span>
        <span class="period-bar"><span class="period-fill" style="width:${w}%;background:${padToHsl(p.mean_pad)}"></span></span>
        <span class="period-count">${p.count} 轮</span>
      </div>`;
    })
    .join("");
}

export function renderMoodSummary(input: MoodSummaryRenderInput): string {
  const { data, summary } = input;
  const t = data.trajectory;
  const span = new Date(data.window_start).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  }) + " → " + new Date(data.window_end).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>心情总结 · ${escapeHtml(span)}</title>
<style>${STYLE}</style>
</head>
<body>
<article>
  <header class="win">心情总结 · ${escapeHtml(span)} · ${t.sample_count} 次对话</header>
  <section class="greeting">${escapeHtml(summary.opener)}</section>
  <section class="band">${renderTrajectoryBand(data)}</section>
  <section class="body">${escapeHtml(summary.body)}${summary.song_note ? `<p class="song-note">${escapeHtml(summary.song_note)}</p>` : ""}</section>
  <section class="stats">
    <div class="stat"><span class="stat-k">起点</span><span class="stat-v" style="color:${padToHsl(t.start_pad)}">${fmt(t.start_pad.p)} · ${fmt(t.start_pad.a)} · ${fmt(t.start_pad.d)}</span></div>
    <div class="stat"><span class="stat-k">现在</span><span class="stat-v" style="color:${padToHsl(t.end_pad)}">${fmt(t.end_pad.p)} · ${fmt(t.end_pad.a)} · ${fmt(t.end_pad.d)}</span></div>
    <div class="stat"><span class="stat-k">波动</span><span class="stat-v">${(t.volatility >= 0.5 ? "起伏不小" : t.volatility >= 0.2 ? "有些波动" : "挺平稳")}</span></div>
  </section>
  <section class="periods">${renderPeriods(data.periods)}</section>
  ${summary.forward.trim() ? `<footer class="closing">${escapeHtml(summary.forward)}</footer>` : ""}
</article>
</body>
</html>`;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { margin: 0; background: #fafaf7; color: #222; font-family: system-ui, "PingFang SC", "Noto Serif CJK SC", serif; line-height: 1.8; }
  article { max-width: 640px; margin: 6rem auto; padding: 0 1.5rem; }
  header.win { font-size: 0.9rem; color: #888; letter-spacing: 0.05em; margin-bottom: 3rem; }
  .greeting { font-size: 1.1rem; margin-bottom: 2rem; }
  .band svg { width: 100%; height: 6px; display: block; margin: 2rem 0; opacity: 0.7; }
  .body { margin-bottom: 2rem; white-space: pre-wrap; }
  .song-note { color: #555; font-style: italic; margin-top: 1.2rem; }
  .stats { display: flex; gap: 2rem; margin: 2.5rem 0; flex-wrap: wrap; }
  .stat { display: flex; flex-direction: column; }
  .stat-k { font-size: 0.8rem; color: #999; letter-spacing: 0.05em; }
  .stat-v { font-weight: 500; margin-top: 0.2rem; }
  .periods { margin: 2rem 0; }
  .period { display: flex; align-items: center; gap: 0.8rem; padding: 0.35rem 0; }
  .period-label { width: 4rem; color: #888; font-size: 0.9rem; }
  .period-bar { flex: 1; height: 10px; background: #eee; border-radius: 5px; overflow: hidden; }
  .period-fill { display: block; height: 100%; border-radius: 5px; opacity: 0.75; }
  .period-count { width: 3.5rem; text-align: right; color: #aaa; font-size: 0.8rem; }
  footer.closing { margin-top: 4rem; color: #888; font-style: italic; }
  @media print { body { background: white; } article { margin: 2rem auto; } }
`;
