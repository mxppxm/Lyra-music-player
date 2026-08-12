// daily/moodHumanize.ts — 用户可见文案：把 PAD / 时段桶转成人话

import type { PAD } from "../types/dialogue";
import type { TimePeriod } from "../recommendation/timeContext";

/** Soft day-part names for mood UI / prompts — never clock ranges. */
const PERIOD_SOFT: Record<TimePeriod, string> = {
  "early-morning": "清晨",
  morning: "上午",
  lunch: "中午前后",
  afternoon: "午后",
  evening: "傍晚",
  night: "夜里",
  "late-night": "深夜",
};

export function softPeriodLabel(period: TimePeriod | string): string {
  return PERIOD_SOFT[period as TimePeriod] ?? String(period);
}

/** One short feel phrase from a PAD (for users — no numbers). */
export function padFeel(pad: PAD): string {
  const { p, a } = pad;
  let valence: string;
  if (p <= -0.45) valence = "偏低落";
  else if (p <= -0.2) valence = "有点闷";
  else if (p < 0.15) valence = "平淡";
  else if (p < 0.4) valence = "略轻松";
  else valence = "比较开朗";

  let energy = "";
  if (a <= -0.35) energy = "、偏安静";
  else if (a >= 0.35) energy = "、偏躁动";

  return `${valence}${energy}`;
}

export function volatilityFeel(v: number): string {
  if (v >= 0.5) return "起伏不小";
  if (v >= 0.2) return "有些波动";
  return "挺平稳";
}
