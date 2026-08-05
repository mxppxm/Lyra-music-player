// moodSummary/summarizeMood.ts — 心情总结数据层。
// 从最近一轮对话中提取情绪轨迹（pad_series），计算统计特征：
// 起点/终点/峰值/低谷/波动幅度/时段聚合。纯函数，无副作用。
// 数据本身不生成文案——文案由 MoodSummaryAgent（LLM）负责，这里只给
// LLM 和渲染层喂结构化的事实。

import type { DialogueTurn, PAD } from "../types/dialogue";
import { PERIODS, periodOfHour, type TimePeriod } from "../recommendation/timeContext";

export type PadPoint = { ts: number; pad: PAD };

/** 从 turns 中提取 pad 序列（保留时间戳，按时间排序）。 */
export function extractPadSeries(turns: DialogueTurn[]): PadPoint[] {
  return turns
    .filter((t) => t.current_emotion && t.current_emotion.pad)
    .map((t) => ({ ts: t.timestamp, pad: t.current_emotion.pad }))
    .sort((a, b) => a.ts - b.ts);
}

/** 一维 PAD 分量数值。 */
export type PadAxis = "p" | "a" | "d";

function axisOf(pad: PAD, axis: PadAxis): number {
  return pad[axis];
}

export type TrajectoryStat = {
  /** 该轴起点值（最早一轮）。 */
  start: number;
  /** 该轴终点值（最后一轮）。 */
  end: number;
  /** 全程最大/最小值。 */
  max: number;
  min: number;
  /** 均值。 */
  mean: number;
  /** 波动幅度 = max - min。 */
  spread: number;
};

/** 对单个 PAD 轴计算轨迹统计。 */
export function trajectoryStat(series: PadPoint[], axis: PadAxis): TrajectoryStat | null {
  if (series.length === 0) return null;
  const vals = series.map((p) => axisOf(p.pad, axis));
  const start = vals[0];
  const end = vals[vals.length - 1];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return { start, end, max, min, mean, spread: max - min };
}

export type MoodTrajectory = {
  /** 总轮数。 */
  sample_count: number;
  /** 起点 pad（最早一轮）。 */
  start_pad: PAD;
  /** 终点 pad（最后一轮）。 */
  end_pad: PAD;
  /** 全程均值 pad。 */
  mean_pad: PAD;
  /** 三个轴的轨迹统计。 */
  axes: Record<PadAxis, TrajectoryStat>;
  /** 情绪波动剧烈程度：0（平稳）~ 1（剧烈），由各轴 spread 加权。 */
  volatility: number;
};

/**
 * 计算整段情绪的轨迹统计。
 * volatility = (spread_p + spread_a + spread_d) / 6 —— 三个轴各占 [-1,1]，
 * 全幅摆荡为 2，三个轴全摆荡为 6。
 */
export function computeMoodTrajectory(series: PadPoint[]): MoodTrajectory | null {
  if (series.length === 0) return null;
  const axes = {
    p: trajectoryStat(series, "p"),
    a: trajectoryStat(series, "a"),
    d: trajectoryStat(series, "d"),
  } as Record<PadAxis, TrajectoryStat>;
  const spreadSum = axes.p.spread + axes.a.spread + axes.d.spread;
  const meanPad: PAD = {
    p: axes.p.mean,
    a: axes.a.mean,
    d: axes.d.mean,
  };
  return {
    sample_count: series.length,
    start_pad: series[0].pad,
    end_pad: series[series.length - 1].pad,
    mean_pad: meanPad,
    axes,
    volatility: Math.min(1, spreadSum / 6),
  };
}

export type PeriodAggregate = {
  period: TimePeriod;
  /** 时段中文名（来自 timeContext）。 */
  label: string;
  /** 该时段内的平均 pad。 */
  mean_pad: PAD;
  count: number;
};

/** 按时段（早通勤/上午/午餐/下午/傍晚/夜间/深夜）聚合平均情绪。 */
export function aggregateByPeriod(series: PadPoint[]): PeriodAggregate[] {
  const buckets = new Map<TimePeriod, PAD[]>();
  for (const p of series) {
    const id = periodOfHour(new Date(p.ts).getHours());
    const arr = buckets.get(id) ?? [];
    arr.push(p.pad);
    buckets.set(id, arr);
  }
  const labelOf = new Map(PERIODS.map((per) => [per.id, per.label]));
  return [...buckets.entries()]
    .map(([id, pads]) => ({
      period: id,
      label: labelOf.get(id) ?? id,
      mean_pad: {
        p: pads.reduce((s, v) => s + v.p, 0) / pads.length,
        a: pads.reduce((s, v) => s + v.a, 0) / pads.length,
        d: pads.reduce((s, v) => s + v.d, 0) / pads.length,
      },
      count: pads.length,
    }))
    .sort((x, y) => x.period.localeCompare(y.period));
}

export type MoodSummaryData = {
  /** 统计窗口内的对话轮数。 */
  turn_count: number;
  /** 窗口起止时间（ISO）。 */
  window_start: number;
  window_end: number;
  trajectory: MoodTrajectory;
  periods: PeriodAggregate[];
};

/** 顶层入口：turns → 结构化心情总结数据。 */
export function summarizeMood(turns: DialogueTurn[]): MoodSummaryData | null {
  const series = extractPadSeries(turns);
  if (series.length === 0) return null;
  const trajectory = computeMoodTrajectory(series);
  if (!trajectory) return null;
  const tss = turns.map((t) => t.timestamp);
  return {
    turn_count: turns.length,
    window_start: Math.min(...tss),
    window_end: Math.max(...tss),
    trajectory,
    periods: aggregateByPeriod(series),
  };
}
