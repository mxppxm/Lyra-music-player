// daily/deriveConclusions.ts — 有证据的规则结论

import type { DailyDigest } from "./buildDailyDigest";

export type DailyConclusion = {
  id: string;
  kind: "observation" | "pattern" | "anomaly" | "sparse";
  claim: string;
  evidence: Array<{ ref: string; display: string }>;
  confidence: "high" | "medium" | "low";
};

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分`;
}

export function deriveConclusions(digest: DailyDigest): DailyConclusion[] {
  const out: DailyConclusion[] = [];

  if (digest.sparse) {
    out.push({
      id: "sparse.day",
      kind: "sparse",
      claim: "这一天几乎没有可记录的使用痕迹。",
      evidence: [
        {
          ref: "eventCount",
          display: `事件 ${digest.eventCount} · 播放会话 ${digest.sessionCount}`,
        },
      ],
      confidence: "high",
    });
    return out;
  }

  if (digest.meta.lyraStartCount >= 2) {
    out.push({
      id: "meta.lyra_start_driven",
      kind: "observation",
      claim: `点了 ${digest.meta.lyraStartCount} 次「点我试试」。`,
      evidence: [
        {
          ref: "meta.lyraStartCount",
          display: `lyra_start × ${digest.meta.lyraStartCount}`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.meta.inputCount >= 3) {
    out.push({
      id: "meta.input_heavy",
      kind: "observation",
      claim: `主动输入了 ${digest.meta.inputCount} 次。`,
      evidence: [
        {
          ref: "meta.inputCount",
          display: `user_input × ${digest.meta.inputCount}`,
        },
      ],
      confidence: "high",
    });
  }

  const deepLock = digest.trackLock.songs.find(
    (s) => s.maxPlayCount >= 3 || s.lockListenMs >= 180_000,
  );
  if (deepLock) {
    out.push({
      id: "lock.deep",
      kind: "pattern",
      claim: `对一首歌开了锁定播放，最高循环到第 ${deepLock.maxPlayCount || "?"} 遍（锁定内约 ${fmtMs(deepLock.lockListenMs)}）。`,
      evidence: [
        {
          ref: `trackLock.songs.${deepLock.songId}`,
          display: `${deepLock.songId} · 最高遍数 ${deepLock.maxPlayCount} · ${fmtMs(deepLock.lockListenMs)}`,
        },
      ],
      confidence: "high",
    });
  } else if (digest.trackLock.onCount >= 1) {
    out.push({
      id: "lock.used",
      kind: "observation",
      claim: `用过锁定播放（开锁 ${digest.trackLock.onCount} 次）。`,
      evidence: [
        {
          ref: "trackLock.onCount",
          display: `track_lock_on × ${digest.trackLock.onCount}`,
        },
      ],
      confidence: "medium",
    });
  }

  const plays = digest.listening.playStarts;
  const completes = digest.listening.completes;
  const skips = digest.listening.skips;
  if (plays >= 5 && completes / Math.max(plays, 1) >= 0.65) {
    out.push({
      id: "listening.completion_high",
      kind: "observation",
      claim: "听得比较完整，多数开播都听到了结尾。",
      evidence: [
        {
          ref: "listening.completes",
          display: `完成 ${completes} / 开播 ${plays}`,
        },
      ],
      confidence: "medium",
    });
  }
  if (skips >= 3 && skips / Math.max(plays, 1) >= 0.5) {
    out.push({
      id: "listening.skip_heavy",
      kind: "observation",
      claim: "跳过比较多，在挑歌或对推荐不太合拍。",
      evidence: [
        {
          ref: "listening.skips",
          display: `跳过 ${skips} / 开播 ${plays}`,
        },
      ],
      confidence: "medium",
    });
  }

  const top = digest.listening.tracks[0];
  if (top && top.totalListenMs >= 60_000) {
    out.push({
      id: "listening.top_track",
      kind: "observation",
      claim: `听得最久的歌听了约 ${fmtMs(top.totalListenMs)}（${top.sessionCount} 次开播）。`,
      evidence: [
        {
          ref: `listening.tracks.0`,
          display: `${top.songId} · ${fmtMs(top.totalListenMs)} · ${top.sessionCount} sessions`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.lyrics.openCount >= 2) {
    out.push({
      id: "lyrics.engaged",
      kind: "observation",
      claim: `翻看歌词 ${digest.lyrics.openCount} 次。`,
      evidence: [
        {
          ref: "lyrics.openCount",
          display: `lyrics_open × ${digest.lyrics.openCount}`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.library.favoriteAdds >= 1) {
    out.push({
      id: "library.favorited",
      kind: "observation",
      claim: `新收藏了 ${digest.library.favoriteAdds} 首歌。`,
      evidence: [
        {
          ref: "library.favoriteAdds",
          display: `favorite_add × ${digest.library.favoriteAdds}`,
        },
      ],
      confidence: "high",
    });
  }

  return out.slice(0, 8);
}
