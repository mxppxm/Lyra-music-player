// daily/renderDayMoodHtml.ts — 按日心情总结 HTML（人话呈现，无斜体 / 无裸 PAD）

import type { DayMoodBrief } from "./buildDayMoodBrief";
import type { MoodSummaryJson } from "../moodSummary/MoodSummaryAgent";
import type { MoodSummaryData, PeriodAggregate } from "../moodSummary/summarizeMood";
import {
  padAxesFeel,
  padFeel,
  softPeriodLabel,
  volatilityFeel,
} from "./moodHumanize";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function padToHsl(pad: { p: number; a: number; d: number }): string {
  const h = Math.round(210 - 210 * clamp(pad.p, -1, 1));
  const s = Math.round(20 + 40 * Math.abs(clamp(pad.a, -1, 1)));
  const l = Math.round(70 + 10 * clamp(pad.d, -1, 1));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function renderTrajectoryBand(data: MoodSummaryData): string {
  const t = data.trajectory;
  return `<svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="mb" x1="0" x2="1">
      <stop offset="0%" stop-color="${padToHsl(t.start_pad)}" />
      <stop offset="100%" stop-color="${padToHsl(t.end_pad)}" />
    </linearGradient></defs>
    <rect x="0" y="0" width="100" height="6" fill="url(#mb)" />
  </svg>`;
}

function renderPeriods(periods: PeriodAggregate[]): string {
  if (periods.length === 0) return "";
  const maxCount = Math.max(...periods.map((p) => p.count), 1);
  const rows = periods
    .map((p) => {
      const w = Math.max(8, Math.round((p.count / maxCount) * 100));
      const label = softPeriodLabel(p.period);
      return `<div class="period">
        <span class="period-label">${esc(label)}<span class="period-n">· ${p.count}</span></span>
        <span class="period-bar"><span class="period-fill" style="width:${w}%;background:${padToHsl(p.mean_pad)}"></span></span>
        <span class="period-feel">${esc(padFeel(p.mean_pad))}</span>
      </div>`;
    })
    .join("");
  return `${rows}<p class="period-hint">条长短表示这段互动多少，不是心情轻重</p>`;
}

function renderConclusions(items: DayMoodBrief["conclusions"]): string {
  if (!items.length) return "";
  const lis = items
    .map(
      (c) =>
        `<li class="read"><p class="read-claim">${esc(c.claim)}</p>${
          c.evidence
            ? `<p class="read-ev">${esc(c.evidence)}</p>`
            : ""
        }</li>`,
    )
    .join("");
  return `<section class="reads">
    <p class="section-label">这一天的读解</p>
    <ul class="read-list">${lis}</ul>
  </section>`;
}

function renderPadAxes(mean: { p: number; a: number; d: number }): string {
  const axes = padAxesFeel(mean);
  return `<section class="axes">
    <p class="section-label">心情三轴</p>
    <div class="axes-row">
      <div class="stat"><span class="stat-k">愉悦</span><span class="stat-v">${esc(axes.pleasure)}</span></div>
      <div class="stat"><span class="stat-k">能量</span><span class="stat-v">${esc(axes.arousal)}</span></div>
      <div class="stat"><span class="stat-k">掌控</span><span class="stat-v">${esc(axes.dominance)}</span></div>
    </div>
  </section>`;
}

function renderSongs(songs: DayMoodBrief["songs"]): string {
  if (!songs.length) return "";
  const lis = songs
    .slice(0, 5)
    .map((s) => {
      const who = s.artist ? `<span class="song-artist">${esc(s.artist)}</span>` : "";
      return `<li class="song-item">
        <p class="song-title">《${esc(s.title)}》${who}</p>
        ${s.note ? `<p class="song-note-line">${esc(s.note)}</p>` : ""}
      </li>`;
    })
    .join("");
  return `<section class="songs">
    <p class="section-label">这一天的歌</p>
    <ul class="song-list">${lis}</ul>
  </section>`;
}

const STYLE = `
  body.day-mood{
    margin:0;
    padding:4px 22px 36px;
    color:#2a241c;
    background:#f3ebe0;
    font-family:"Lora","Songti SC","Songti TC",Georgia,"Times New Roman",serif;
    font-size:16px;
    line-height:1.7;
    -webkit-font-smoothing:antialiased;
  }
  .mast{
    padding:10px 0 18px;
    border-bottom:1px solid rgba(70,52,32,0.12);
    margin-bottom:18px;
  }
  .eyebrow{
    margin:0 0 6px;
    font-size:11px;
    letter-spacing:0.22em;
    text-transform:uppercase;
    color:rgba(70,52,32,0.45);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .title{
    margin:0;
    font-size:1.45rem;
    font-weight:500;
    letter-spacing:0.02em;
    color:#241e18;
    line-height:1.25;
  }
  .meta{
    margin:8px 0 0;
    font-size:13px;
    color:rgba(70,52,32,0.55);
  }
  .opener{margin:0 0 14px;color:rgba(70,52,32,0.72);font-size:0.98rem}
  .band{margin:8px 0 18px}
  .band svg{width:100%;height:6px;display:block;opacity:0.75}
  .body{margin:0 0 1em;white-space:pre-wrap;color:#2a241c}
  .song-note{
    margin:14px 0 0;
    color:rgba(70,52,32,0.62);
  }
  .stats{display:flex;gap:1.4rem;margin:22px 0 8px;flex-wrap:wrap}
  .stat{display:flex;flex-direction:column;min-width:4.5rem}
  .stat-k{
    font-size:11px;
    letter-spacing:0.12em;
    color:rgba(70,52,32,0.42);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .stat-v{font-weight:500;margin-top:0.15rem;font-size:0.92rem}
  .periods{margin:12px 0 4px}
  .period{display:flex;align-items:center;gap:0.7rem;padding:0.28rem 0}
  .period-label{width:5.2rem;color:rgba(70,52,32,0.5);font-size:0.85rem}
  .period-n{color:rgba(70,52,32,0.35);font-size:0.75rem;font-family:"SF Pro Text","PingFang SC",sans-serif}
  .period-bar{flex:1;height:8px;background:rgba(70,52,32,0.08);border-radius:4px;overflow:hidden}
  .period-fill{display:block;height:100%;border-radius:4px;opacity:0.8}
  .period-feel{min-width:5rem;text-align:right;color:rgba(70,52,32,0.45);font-size:0.8rem}
  .period-hint{
    margin:6px 0 0;
    font-size:11px;
    color:rgba(70,52,32,0.35);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .reads{margin:26px 0 0}
  .section-label{
    margin:0 0 10px;
    font-size:11px;
    letter-spacing:0.18em;
    color:rgba(70,52,32,0.42);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .read-list{list-style:none;margin:0;padding:0}
  .read{
    padding:10px 0;
    border-top:1px solid rgba(70,52,32,0.08);
  }
  .read:first-child{border-top:none;padding-top:2px}
  .read-claim{margin:0;color:#241e18;font-weight:500}
  .read-ev{
    margin:4px 0 0;
    font-size:12px;
    color:rgba(70,52,32,0.45);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .forward{
    margin:28px 0 0;
    color:rgba(70,52,32,0.5);
  }
  .axes{margin:22px 0 4px}
  .axes-row{display:flex;gap:1.4rem;flex-wrap:wrap}
  .songs{margin:26px 0 0}
  .song-list{list-style:none;margin:0;padding:0}
  .song-item{
    padding:10px 0;
    border-top:1px solid rgba(70,52,32,0.08);
  }
  .song-item:first-child{border-top:none;padding-top:2px}
  .song-title{margin:0;color:#241e18;font-weight:500}
  .song-artist{
    margin-left:0.35rem;
    font-weight:400;
    color:rgba(70,52,32,0.45);
    font-size:0.9em;
  }
  .song-note-line{
    margin:4px 0 0;
    font-size:12px;
    color:rgba(70,52,32,0.45);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .fallback-note{
    margin:10px 0 0;
    font-size:11px;
    color:rgba(70,52,32,0.38);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .sign{
    margin:28px 0 0;
    padding-top:16px;
    border-top:1px solid rgba(70,52,32,0.1);
    font-size:13px;
    color:rgba(70,52,32,0.4);
  }
`;

export function renderDayMoodHtml(input: {
  brief: DayMoodBrief;
  summary: MoodSummaryJson & { fallback?: boolean };
}): string {
  const { brief, summary } = input;
  const mood = brief.mood;
  const samples = mood?.trajectory.sample_count ?? 0;
  const metaBits = [brief.dayLabel];
  if (samples > 0) metaBits.push(`${samples} 次互动`);

  const band =
    mood != null
      ? `<section class="band">${renderTrajectoryBand(mood)}</section>`
      : "";
  const stats =
    mood != null
      ? `<section class="stats">
    <div class="stat"><span class="stat-k">起点</span><span class="stat-v" style="color:${padToHsl(mood.trajectory.start_pad)}">${esc(padFeel(mood.trajectory.start_pad))}</span></div>
    <div class="stat"><span class="stat-k">此刻</span><span class="stat-v" style="color:${padToHsl(mood.trajectory.end_pad)}">${esc(padFeel(mood.trajectory.end_pad))}</span></div>
    <div class="stat"><span class="stat-k">波动</span><span class="stat-v">${esc(volatilityFeel(mood.trajectory.volatility))}</span></div>
  </section>`
      : "";
  const periods =
    mood != null && mood.periods.length
      ? `<section class="periods">${renderPeriods(mood.periods)}</section>`
      : "";
  const axes =
    mood != null
      ? renderPadAxes(mood.trajectory.mean_pad)
      : "";
  const songs = renderSongs(brief.songs);

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>日报 · ${esc(brief.dayKey)}</title>
<style>${STYLE}</style>
</head>
<body class="day-mood day-mood-v2">
  <header class="mast">
    <p class="eyebrow">Lyra Daily</p>
    <h1 class="title">${esc(brief.headline)}</h1>
    <p class="meta">${esc(metaBits.join(" · "))}</p>
  </header>

  ${summary.opener ? `<p class="opener">${esc(summary.opener)}</p>` : ""}
  ${band}
  <section class="letter">
    <p class="body">${esc(summary.body)}</p>
    ${summary.song_note ? `<p class="song-note">${esc(summary.song_note)}</p>` : ""}
    ${summary.fallback ? `<p class="fallback-note">（模型暂不可用，这是按事实写下的简记）</p>` : ""}
  </section>
  ${axes}
  ${stats}
  ${periods}
  ${songs}
  ${renderConclusions(brief.conclusions)}
  ${summary.forward.trim() ? `<p class="forward">${esc(summary.forward)}</p>` : ""}
  <p class="sign">— Lyra</p>
</body>
</html>`;
}
