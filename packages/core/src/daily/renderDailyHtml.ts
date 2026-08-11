// daily/renderDailyHtml.ts — 心情日信呈现（非数据看板）

import type { DailyMoodBrief } from "./buildDailyMoodBrief";
import type { DailyMoodLetter } from "../agents/DailyMoodAgent";
import { yesterdayDayKey } from "./dayKey";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDayLabel(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  return `${Number(m[2])} 月 ${Number(m[3])} 日`;
}

function paras(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="p">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export function renderDailyHtml(input: {
  dayKey: string;
  letter: DailyMoodLetter;
  brief: DailyMoodBrief;
}): string {
  const { dayKey, letter, brief } = input;
  const dayLabel = formatDayLabel(dayKey);
  const isYesterday = dayKey === yesterdayDayKey();
  const headline = isYesterday ? "昨天的心情" : "今天的心情";

  const songsHtml = brief.companionSongs.length
    ? `<ul class="songs">${brief.companionSongs
        .map(
          (s) =>
            `<li class="song"><span class="song-t">${esc(s.title)}</span></li>`,
        )
        .join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>日报 · ${esc(dayKey)}</title>
<style>
  body.daily-letter{
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
    margin-bottom:22px;
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
    font-size:1.5rem;
    font-weight:500;
    letter-spacing:0.02em;
    color:#241e18;
    line-height:1.25;
  }
  .date{
    margin:8px 0 0;
    font-size:13px;
    color:rgba(70,52,32,0.55);
    font-style:italic;
  }
  .arc{
    display:inline-block;
    margin:14px 0 0;
    padding:4px 10px;
    border-radius:999px;
    font-size:12px;
    letter-spacing:0.06em;
    color:rgba(70,52,32,0.62);
    background:rgba(255,252,246,0.65);
    border:1px solid rgba(70,52,32,0.08);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .letter{margin:8px 0 8px}
  .g{
    margin:0 0 12px;
    color:rgba(70,52,32,0.55);
    font-size:0.95rem;
  }
  .p{margin:0 0 1.05em;color:#2a241c}
  .p:last-child{margin-bottom:0}
  .close{
    margin:18px 0 0;
    color:rgba(70,52,32,0.5);
    font-style:italic;
  }
  .section{margin:28px 0 0}
  .section-label{
    margin:0 0 10px;
    font-size:11px;
    letter-spacing:0.18em;
    color:rgba(70,52,32,0.42);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
  .songs{list-style:none;margin:0;padding:0}
  .song{
    padding:10px 0;
    border-top:1px solid rgba(70,52,32,0.08);
  }
  .song:first-child{border-top:none;padding-top:2px}
  .song-t{font-weight:500;color:#241e18}
  .sign{
    margin:28px 0 0;
    padding-top:16px;
    border-top:1px solid rgba(70,52,32,0.1);
    font-size:13px;
    color:rgba(70,52,32,0.4);
    font-style:italic;
    letter-spacing:0.04em;
  }
  .fallback-note{
    margin:10px 0 0;
    font-size:11px;
    color:rgba(70,52,32,0.38);
    font-family:"SF Pro Text","PingFang SC",sans-serif;
  }
</style>
</head>
<body class="daily-letter daily-letter-v4">
  <header class="mast">
    <p class="eyebrow">Lyra Daily</p>
    <h1 class="title">${esc(headline)}</h1>
    <p class="date">${esc(dayLabel)}</p>
    ${letter.mood_arc ? `<span class="arc">${esc(letter.mood_arc)}</span>` : ""}
  </header>

  <section class="letter">
    ${letter.greeting ? `<p class="g">${esc(letter.greeting)}</p>` : ""}
    ${paras(letter.body)}
    ${letter.closing ? `<p class="close">${esc(letter.closing)}</p>` : ""}
    ${
      letter.fallback
        ? `<p class="fallback-note">（模型暂不可用，这是按事实写下的简记）</p>`
        : ""
    }
  </section>

  ${
    songsHtml
      ? `<section class="section">
    <p class="section-label">停过的歌</p>
    ${songsHtml}
  </section>`
      : ""
  }

  <p class="sign">— Lyra</p>
</body>
</html>`;
}
