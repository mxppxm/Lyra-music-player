// daily/deriveConclusions.ts — 有证据的规则结论（用户可读分析，禁事件名）

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
      claim: "这一天几乎没有可写的听歌与对话痕迹。",
      evidence: [
        {
          ref: "eventCount",
          display: "几乎没有打开或听歌记录",
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
      claim: "更常点「随便听听」，像是把选歌交给我，而不是先把心情说清楚。",
      evidence: [
        {
          ref: "meta.lyraStartCount",
          display: `「随便听听」点了 ${digest.meta.lyraStartCount} 次`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.meta.inputCount >= 3) {
    out.push({
      id: "meta.input_heavy",
      kind: "observation",
      claim: "主动说了好几次，这一天的心情有被你自己点出来。",
      evidence: [
        {
          ref: "meta.inputCount",
          display: `主动输入 ${digest.meta.inputCount} 次`,
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
      claim: `有一首歌被你故意锁着循环，最高到第 ${deepLock.maxPlayCount || "?"} 遍——不像路过，更像停住。`,
      evidence: [
        {
          ref: `trackLock.songs.${deepLock.songId}`,
          display: `锁定内听了约 ${fmtMs(deepLock.lockListenMs)}，最高第 ${deepLock.maxPlayCount} 遍`,
        },
      ],
      confidence: "high",
    });
  } else if (digest.trackLock.onCount >= 1) {
    out.push({
      id: "lock.used",
      kind: "observation",
      claim: "试过锁定播放，但没有真正沉进去循环很久。",
      evidence: [
        {
          ref: "trackLock.onCount",
          display: `开过锁定 ${digest.trackLock.onCount} 次`,
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
      claim: "多数歌都听到了尾，听感比较完整，不太像在慌着挑。",
      evidence: [
        {
          ref: "listening.completes",
          display: `${plays} 次开播里听完了 ${completes} 次`,
        },
      ],
      confidence: "medium",
    });
  }
  if (skips >= 3 && skips / Math.max(plays, 1) >= 0.5) {
    out.push({
      id: "listening.skip_heavy",
      kind: "observation",
      claim: "跳得比较勤，像是在找合拍的那一首，还没落地。",
      evidence: [
        {
          ref: "listening.skips",
          display: `${plays} 次开播里跳过了 ${skips} 次`,
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
      claim: `听得最久的那首停了约 ${fmtMs(top.totalListenMs)}，是这一天里最明显的停留。`,
      evidence: [
        {
          ref: `listening.tracks.0`,
          display: `开播 ${top.sessionCount} 次，合计约 ${fmtMs(top.totalListenMs)}`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.lyrics.openCount >= 2) {
    out.push({
      id: "lyrics.engaged",
      kind: "observation",
      claim: "不止听旋律，还翻过歌词——对词有停留。",
      evidence: [
        {
          ref: "lyrics.openCount",
          display: `翻看歌词 ${digest.lyrics.openCount} 次`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.library.favoriteAdds >= 1) {
    out.push({
      id: "library.favorited",
      kind: "observation",
      claim: "有歌被你留下了，不只是听过就算。",
      evidence: [
        {
          ref: "library.favoriteAdds",
          display: `新收藏 ${digest.library.favoriteAdds} 首`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.library.historyReplays >= 1) {
    out.push({
      id: "library.history_revisit",
      kind: "observation",
      claim: "翻回历史里重听，像是在找回已经熟悉的声音。",
      evidence: [
        {
          ref: "library.historyReplays",
          display: `历史重播 ${digest.library.historyReplays} 次`,
        },
      ],
      confidence: "high",
    });
  }

  if (digest.immersion.enterCount >= 2) {
    out.push({
      id: "immersion.used",
      kind: "observation",
      claim: "进过几次沉浸，听的时候更愿意待在歌里。",
      evidence: [
        {
          ref: "immersion.enterCount",
          display: `进入沉浸 ${digest.immersion.enterCount} 次`,
        },
      ],
      confidence: "medium",
    });
  }

  const bg = digest.listening.backgroundListenMs;
  const total = digest.listening.totalListenMs;
  if (bg >= 120_000 && total > 0 && bg / total >= 0.3) {
    out.push({
      id: "immersion.background",
      kind: "observation",
      claim: "不少时间歌在后台接着响，像是伴着你做别的事。",
      evidence: [
        {
          ref: "listening.backgroundListenMs",
          display: `后台续播约 ${fmtMs(bg)}（总听约 ${fmtMs(total)}）`,
        },
      ],
      confidence: "medium",
    });
  }

  return out.slice(0, 8);
}
