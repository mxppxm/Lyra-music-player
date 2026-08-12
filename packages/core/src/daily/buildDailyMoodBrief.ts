// daily/buildDailyMoodBrief.ts — 给 DailyMoodAgent 的事实简报（非用户可见）

import type { DialogueTurn } from "../types";
import type { DailyDigest } from "./buildDailyDigest";
import type { DailyConclusion } from "./deriveConclusions";

export type MoodBriefTurn = {
  time: string;
  utterance: string;
  labels: string[];
  pad: { p: number; a: number; d: number };
  songTitle: string;
  rationale: string;
};

export type DailyMoodBrief = {
  dayKey: string;
  dayLabel: string;
  sparse: boolean;
  turns: MoodBriefTurn[];
  companionSongs: Array<{ title: string; note: string }>;
  factNotes: string[];
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

/**
 * Pack day facts for the mood LLM. Titles must already be human-readable.
 */
export function buildDailyMoodBrief(input: {
  dayKey: string;
  digest: DailyDigest;
  conclusions: DailyConclusion[];
  turns: DialogueTurn[];
  titleOf: (songId: string) => string;
}): DailyMoodBrief {
  const { dayKey, digest, conclusions, turns, titleOf } = input;

  const moodTurns: MoodBriefTurn[] = turns
    .filter((t) => {
      const c = t.user_utterance.content?.trim() ?? "";
      const modality = t.user_utterance.modality;
      // Keep text inputs + meaningful proactive; skip empty replay shells.
      if (modality === "text" && c) return true;
      if (modality === "proactive-open" && (c || t.current_emotion.labels.length))
        return true;
      return Boolean(t.current_emotion.labels.length && t.agent_response.song_id);
    })
    .slice(0, 24)
    .map((t) => ({
      time: hhmm(t.timestamp),
      utterance:
        t.user_utterance.modality === "text"
          ? t.user_utterance.content.trim()
          : t.user_utterance.content.trim() || "（随便听听 / 连播）",
      labels: t.current_emotion.labels.slice(0, 4),
      pad: t.current_emotion.pad,
      songTitle: titleOf(t.agent_response.song_id),
      rationale: (t.agent_response.rationale || "").trim().slice(0, 120),
    }));

  const companionSongs = digest.listening.tracks.slice(0, 8).map((t) => {
    const bits: string[] = [];
    if (t.totalListenMs > 0) bits.push(`听了约 ${fmtListen(t.totalListenMs)}`);
    if (t.maxLockPlayCount >= 2) bits.push(`锁定循环到第 ${t.maxLockPlayCount} 遍`);
    else if (t.lockListenMs > 0) bits.push("有过锁定播放");
    if (t.skippedCount > 0 && t.completedCount === 0) bits.push("后来跳过");
    return {
      title: titleOf(t.songId),
      note: bits.join("，") || "有过停留",
    };
  });

  const factNotes = conclusions
    .filter((c) => c.kind !== "sparse")
    .slice(0, 6)
    .map((c) => c.claim);

  if (digest.trackLock.onCount > 0) {
    factNotes.push(`这一天开过 ${digest.trackLock.onCount} 次锁定播放`);
  }
  if (digest.lyrics.openCount > 0) {
    factNotes.push(`看过歌词 ${digest.lyrics.openCount} 次`);
  }
  if (digest.library.favoriteAdds > 0) {
    factNotes.push(`新收藏 ${digest.library.favoriteAdds} 首`);
  }

  return {
    dayKey,
    dayLabel: formatDayLabel(dayKey),
    sparse: digest.sparse,
    turns: moodTurns,
    companionSongs,
    factNotes,
  };
}

/** Serialize brief into the user message for DailyMoodAgent. */
export function formatMoodBriefForPrompt(brief: DailyMoodBrief): string {
  const lines: string[] = [
    `日期：${brief.dayLabel}（${brief.dayKey}）`,
    `数据稀少：${brief.sparse ? "是" : "否"}`,
    "",
    "【当天对话与情绪】",
  ];
  if (brief.turns.length === 0) {
    lines.push("（几乎没有留下可写的对话）");
  } else {
    for (const t of brief.turns) {
      const labels = t.labels.length ? t.labels.join("、") : "（无标签）";
      lines.push(
        `${t.time} · 你说：「${t.utterance}」· 情绪：${labels} · 歌：${t.songTitle}` +
          (t.rationale ? ` · 旁白：${t.rationale}` : ""),
      );
    }
  }
  lines.push("", "【停过的歌】");
  if (brief.companionSongs.length === 0) {
    lines.push("（没有清晰的听歌痕迹）");
  } else {
    for (const s of brief.companionSongs) {
      lines.push(`- ${s.title}（${s.note}）`);
    }
  }
  if (brief.factNotes.length) {
    lines.push("", "【可核对的轻事实】");
    for (const n of brief.factNotes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}
