// daily/buildDayMoodBrief.ts — 按日心情总结简报（喂 LLM + 读解）

import type { DialogueTurn } from "../types";
import {
  summarizeMood,
  type MoodSummaryData,
} from "../moodSummary/summarizeMood";
import type { DailyDigest } from "./buildDailyDigest";
import type { DailyConclusion } from "./deriveConclusions";
import { yesterdayDayKey } from "./dayKey";
import {
  padAxesFeel,
  padFeel,
  softPeriodLabel,
  volatilityFeel,
} from "./moodHumanize";

export type DayMoodSong = {
  title: string;
  artist: string | null;
  note: string;
};

export type DayMoodUtterance = {
  time: string;
  text: string;
  labels: string[];
};

export type DayMoodConclusionView = {
  claim: string;
  evidence: string;
};

export type DayMoodBrief = {
  dayKey: string;
  dayLabel: string;
  headline: string;
  sparse: boolean;
  mood: MoodSummaryData | null;
  utterances: DayMoodUtterance[];
  songs: DayMoodSong[];
  conclusions: DayMoodConclusionView[];
  behaviorNotes: string[];
};

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDayLabel(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  return `${Number(m[2])} 月 ${Number(m[3])} 日`;
}

function fmtListen(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分`;
}

function headlineFor(dayKey: string): string {
  if (dayKey === yesterdayDayKey()) return "昨天的心情";
  return "今天的心情";
}

/**
 * Pack day-scoped mood + behavior facts for MoodSummaryAgent / renderer.
 */
export function buildDayMoodBrief(input: {
  dayKey: string;
  digest: DailyDigest;
  conclusions: DailyConclusion[];
  turns: DialogueTurn[];
  titleOf: (songId: string) => string;
  artistOf?: (songId: string) => string | null;
}): DayMoodBrief {
  const { dayKey, digest, conclusions, turns, titleOf } = input;
  const artistOf = input.artistOf ?? (() => null);
  const mood = summarizeMood(turns);

  const utterances: DayMoodUtterance[] = turns
    .filter((t) => {
      const c = t.user_utterance.content?.trim() ?? "";
      if (t.user_utterance.modality === "text" && c) return true;
      return false;
    })
    .slice(0, 12)
    .map((t) => ({
      time: hhmm(t.timestamp),
      text: t.user_utterance.content.trim().slice(0, 80),
      labels: t.current_emotion.labels.slice(0, 4),
    }));

  const songs: DayMoodSong[] = digest.listening.tracks.slice(0, 8).map((t) => {
    const bits: string[] = [];
    if (t.totalListenMs > 0) bits.push(`听了约 ${fmtListen(t.totalListenMs)}`);
    if (t.maxLockPlayCount >= 2) bits.push(`锁定循环到第 ${t.maxLockPlayCount} 遍`);
    else if (t.lockListenMs > 0) bits.push("有过锁定播放");
    if (t.skippedCount > 0 && t.completedCount === 0) bits.push("后来跳过");
    if (t.completedCount > 0 && t.skippedCount === 0) bits.push("听得比较完整");
    return {
      title: titleOf(t.songId),
      artist: artistOf(t.songId),
      note: bits.join("，") || "有过停留",
    };
  });

  // Prefer songs that appear in turns if digest tracks empty but turns exist.
  if (songs.length === 0) {
    const seen = new Set<string>();
    for (const t of [...turns].reverse()) {
      const id = t.agent_response.song_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      songs.push({
        title: titleOf(id),
        artist: artistOf(id),
        note: "当天推荐过",
      });
      if (songs.length >= 5) break;
    }
  }

  const conclusionViews: DayMoodConclusionView[] = conclusions
    .filter((c) => c.kind !== "sparse")
    .slice(0, 5)
    .map((c) => {
      let claim = c.claim;
      if (c.id === "listening.top_locked") {
        const top = digest.listening.tracks[0];
        if (top) {
          claim = `《${titleOf(top.songId)}》被你故意锁着循环，最高到第 ${top.maxLockPlayCount || "?"} 遍——也是这一天听得最久的停留。`;
        }
      } else if (c.id === "lock.deep") {
        const deep = digest.trackLock.songs.find(
          (s) => s.maxPlayCount >= 3 || s.lockListenMs >= 180_000,
        );
        if (deep) {
          claim = `《${titleOf(deep.songId)}》被你故意锁着循环，最高到第 ${deep.maxPlayCount || "?"} 遍——不像路过，更像停住。`;
        }
      } else if (c.id === "listening.top_track") {
        const top = digest.listening.tracks[0];
        if (top) {
          claim = `听得最久的是《${titleOf(top.songId)}》，停了约 ${fmtListen(top.totalListenMs)}，是这一天里最明显的停留。`;
        }
      }
      const evidence = c.evidence
        .map((e) => {
          let d = e.display;
          for (const t of digest.listening.tracks) {
            if (d.includes(t.songId)) d = d.split(t.songId).join(titleOf(t.songId));
          }
          return d;
        })
        .join(" · ");
      return { claim, evidence: evidence || c.id };
    });

  const behaviorNotes: string[] = [];
  if (digest.trackLock.onCount > 0) {
    behaviorNotes.push(`开过 ${digest.trackLock.onCount} 次锁定播放`);
  }
  if (digest.lyrics.openCount > 0) {
    behaviorNotes.push(`看过歌词 ${digest.lyrics.openCount} 次`);
  }
  if (digest.library.favoriteAdds > 0) {
    behaviorNotes.push(`新收藏 ${digest.library.favoriteAdds} 首`);
  }
  if (
    digest.immersion.enterCount >= 2 &&
    digest.immersion.enterCount <= 12
  ) {
    behaviorNotes.push(`进入沉浸 ${digest.immersion.enterCount} 次`);
  }
  if (digest.listening.backgroundListenMs >= 60_000) {
    behaviorNotes.push(
      `后台续播约 ${fmtListen(digest.listening.backgroundListenMs)}`,
    );
  }

  return {
    dayKey,
    dayLabel: formatDayLabel(dayKey),
    headline: headlineFor(dayKey),
    sparse: digest.sparse && !mood && songs.length === 0,
    mood,
    utterances,
    songs,
    conclusions: conclusionViews,
    behaviorNotes,
  };
}

/** Serialize brief into the user message for MoodSummaryAgent. */
export function formatDayMoodBriefForPrompt(brief: DayMoodBrief): string {
  const lines: string[] = [
    `【窗口】${brief.dayLabel} · ${brief.headline}`,
    `数据稀少：${brief.sparse ? "是" : "否"}`,
    "",
  ];

  if (brief.mood) {
    const t = brief.mood.trajectory;
    const axes = padAxesFeel(t.mean_pad);
    lines.push(
      "【情绪感受（已转成人话，不要写数字）】",
      `- 互动轮数：${t.sample_count}（含「随便听听」等，不全是文字对话）`,
      `- 起点感觉：${padFeel(t.start_pad)}`,
      `- 终点感觉：${padFeel(t.end_pad)}`,
      `- 整体：${volatilityFeel(t.volatility)}`,
      `- 愉悦：${axes.pleasure}`,
      `- 能量：${axes.arousal}`,
      `- 掌控：${axes.dominance}`,
      "",
      "【大概落在哪一段（只有真正有互动的时段；条长短＝互动多少，不是心情轻重）】",
    );
    if (brief.mood.periods.length === 0) {
      lines.push("（无）");
    } else {
      for (const p of brief.mood.periods) {
        const ax = padAxesFeel(p.mean_pad);
        lines.push(
          `- ${softPeriodLabel(p.period)}（${p.count} 轮互动）：${padFeel(p.mean_pad)}；${ax.pleasure}，${ax.arousal}，${ax.dominance}`,
        );
      }
    }
  } else {
    lines.push("【情绪感受】", "（这一天几乎没有可统计的情绪轨迹）");
  }

  lines.push("", "【你说过的话】（时间戳是唯一允许写进文案的具体钟点来源）");
  if (brief.utterances.length === 0) {
    lines.push("（几乎没有留下可写的对话）");
  } else {
    for (const u of brief.utterances) {
      const labels = u.labels.length ? u.labels.join("、") : "（无标签）";
      lines.push(`${u.time} · 「${u.text}」· 情绪：${labels}`);
    }
  }

  lines.push("", "【听过的歌（带行为）】");
  if (brief.songs.length === 0) {
    lines.push("（没有清晰的听歌痕迹）");
  } else {
    for (const s of brief.songs) {
      lines.push(
        `- ${s.title}${s.artist ? `（${s.artist}）` : ""}：${s.note}`,
      );
    }
  }

  if (brief.conclusions.length) {
    lines.push("", "【可写进读解的分析要点】");
    for (const c of brief.conclusions) {
      lines.push(`- ${c.claim}`);
      if (c.evidence) lines.push(`  （依据：${c.evidence}）`);
    }
  }

  if (brief.behaviorNotes.length) {
    lines.push("", "【其它行为要点】");
    for (const n of brief.behaviorNotes) lines.push(`- ${n}`);
  }

  lines.push(
    "",
    '请输出 JSON：{ "opener": "...", "body": "...", "song_note": "...", "forward": "..." }',
    "要求：写这一自然日的心情与音乐；歌名必须来自列表；结合锁定/听时把 song_note 写具体。",
    "正文写心情弧线与歌为什么陪着走（结合愉悦/能量/掌控的人话），像朋友回忆，不要写成数据清单。",
    "禁止在正文里罗列次数与秒数（如「随便听听 N 次」「翻歌词 N 次」「沉浸 N 次」「听了 N 分」）；具体数字留给页面其它区块。",
    "同一首歌只写一个听时口径：优先「合计听了约…」；若有锁定，写「锁着循环到第 N 遍，合计约…」，不要并列两套分钟数——但这些数字优先放进 song_note，不要堆进 body。",
    "时段轮数多只代表互动更密，不代表心情更重；整体平稳且各时段感受相同时，禁止写「午后更明显/更闷」之类递进。",
    "禁止：PAD 数字、事件名、技术字段；禁止编造素材里没有的具体钟点（例如素材没有 14:xx 就不要写「下午两点」）；不要用「14–18时」这类钟点区间当叙事。",
  );

  return lines.join("\n");
}
