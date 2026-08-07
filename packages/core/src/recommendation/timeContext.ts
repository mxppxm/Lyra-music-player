/**
 * 时间上下文 —— 把「现在是什么时候」翻译成推荐器能用的信号。
 *
 * 与 song-recommender skill 的策略对齐：季节 / 星期几 / 时段（早通勤→深夜）/
 * 上班或休息，派生一组中文标签 + 时段默认心情 + 一句伪目标文案。
 * 让「点我试试」和连播在没有用户输入时也有据可依，不再冷冰冰。
 */

export type TimePeriod =
  | "early-commute" // 早通勤 6-9（工作日）
  | "morning" // 上午 9-11
  | "lunch" // 午休 11-14
  | "afternoon" // 下午 14-18
  | "evening" // 傍晚 18-20
  | "night" // 夜晚 20-23
  | "late-night"; // 深夜 23-6

export type Season = "spring" | "summer" | "autumn" | "winter";

/** Reserved for future weather-aware recommendation. */
export type WeatherContext = {
  condition: string; // e.g. "晴", "雨", "多云"
  tempC: number;
  source: "user-input" | "api";
};

export type TimeContext = {
  /** 当前时刻（调用方注入，便于测试）。 */
  now: Date;
  /** 季节英文键。 */
  season: Season;
  /** 季节中文（春/夏/秋/冬）。 */
  seasonZh: string;
  /** 星期几，1=周一 … 7=周日。 */
  weekday: number;
  /** 星期几中文（周一 … 周日）。 */
  weekdayZh: string;
  /** 时段英文键。 */
  period: TimePeriod;
  /** 时段中文（早通勤/上午/午休/下午/傍晚/夜晚/深夜）。 */
  periodZh: string;
  /** 是否工作日（周一至周五）。 */
  isWorkday: boolean;
  /** 是否上班时间（工作日 9-18 且非午休场景仍算，此处宽松：工作日 9-18）。 */
  isWorkTime: boolean;
  /** 中文标签组 —— 用于匹配曲库的 best_for / mood / time_color。 */
  tags: string[];
  /** 时段默认心情标签 —— 用户没说话时当作心情入口。 */
  defaultMoodTags: string[];
  /** 伪目标文案 —— 「夏日的周三下午，上班时间」这类开场白。 */
  pseudoTarget: string;
  /** 天气上下文 —— 预留，后续接 wttr.in / Open-Meteo + 定位。 */
  weather?: WeatherContext;
};

const SEASON_BY_MONTH: Record<number, Season> = {
  3: "spring",
  4: "spring",
  5: "spring",
  6: "summer",
  7: "summer",
  8: "summer",
  9: "autumn",
  10: "autumn",
  11: "autumn",
  12: "winter",
  1: "winter",
  2: "winter",
};

const SEASON_ZH: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

const WEEKDAY_ZH = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
] as const;

const PERIOD_ZH: Record<TimePeriod, string> = {
  "early-commute": "早通勤",
  morning: "上午",
  lunch: "午休",
  afternoon: "下午",
  evening: "傍晚",
  night: "夜晚",
  "late-night": "深夜",
};

/** 有序时段列表（含中文标签），供 moodSummary 等模块聚合展示。 */
export const PERIODS: ReadonlyArray<{ id: TimePeriod; label: string }> = [
  { id: "early-commute", label: PERIOD_ZH["early-commute"] },
  { id: "morning", label: PERIOD_ZH.morning },
  { id: "lunch", label: PERIOD_ZH.lunch },
  { id: "afternoon", label: PERIOD_ZH.afternoon },
  { id: "evening", label: PERIOD_ZH.evening },
  { id: "night", label: PERIOD_ZH.night },
  { id: "late-night", label: PERIOD_ZH["late-night"] },
];

/** 按小时返回所在时段（0-23）。 */
export function periodOfHour(hour: number): TimePeriod {
  if (hour >= 6 && hour < 9) return "early-commute";
  if (hour >= 9 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "lunch";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 20) return "evening";
  if (hour >= 20 && hour < 23) return "night";
  return "late-night";
}

/**
 * 时段 → 默认心情标签。与 song-recommender 的心情映射表对齐的「无输入兜底」。
 */
const PERIOD_MOOD_TAGS: Record<TimePeriod, string[]> = {
  "early-commute": ["清醒", "出发", "赶路"],
  morning: ["专注", "清醒"],
  lunch: ["放松", "小憩"],
  afternoon: ["专注", "慵懒"],
  evening: ["释然", "疲惫"],
  night: ["放松", "社交"],
  "late-night": ["平静", "内省", "孤独"],
};

/** 各时段在曲库 best_for 里常见的中文场景词（用于打分匹配）。 */
const PERIOD_SCENE_TAGS: Record<TimePeriod, string[]> = {
  "early-commute": ["通勤", "上班", "早高峰", "路上"],
  morning: ["上午", "早上", "清晨", "专注", "工作"],
  lunch: ["午休", "中午", "小憩"],
  afternoon: ["下午", "午后", "下午茶"],
  evening: ["傍晚", "黄昏", "下班", "回家"],
  night: ["夜晚", "晚上", "夜跑", "晚餐"],
  "late-night": ["深夜", "凌晨", "独处", "睡前"],
};

export function computeTimeContext(now: Date = new Date()): TimeContext {
  const month = now.getMonth() + 1; // 1-12
  const season: Season = SEASON_BY_MONTH[month] ?? "spring";
  const seasonZh = SEASON_ZH[season];

  // JS getDay(): 0=周日 … 6=周六 → 转成 1=周一 … 7=周日
  const jsDay = now.getDay();
  const weekday = jsDay === 0 ? 7 : jsDay;
  const weekdayZh = WEEKDAY_ZH[weekday - 1];

  const hour = now.getHours();
  const isWorkday = weekday <= 5;

  let period: TimePeriod;
  if (hour >= 6 && hour < 9) {
    period = "early-commute";
  } else if (hour >= 9 && hour < 11) {
    period = "morning";
  } else if (hour >= 11 && hour < 14) {
    period = "lunch";
  } else if (hour >= 14 && hour < 18) {
    period = "afternoon";
  } else if (hour >= 18 && hour < 20) {
    period = "evening";
  } else if (hour >= 20 && hour < 23) {
    period = "night";
  } else {
    period = "late-night";
  }

  const periodZh = PERIOD_ZH[period];
  const isWorkTime = isWorkday && hour >= 9 && hour < 18;

  // 标签组：季节 + 星期 + 时段 + 工作/休息 + 场景词
  const tags = [
    `${seasonZh}季`,
    `${seasonZh}天`,
    weekdayZh,
    periodZh,
    isWorkTime ? "上班时间" : isWorkday ? "工作时间之外" : "休息日",
    ...PERIOD_SCENE_TAGS[period],
  ];

  const defaultMoodTags = [...PERIOD_MOOD_TAGS[period]];

  // 伪目标文案：如「夏日的周三下午，上班时间」
  const dayWord = isWorkday ? (isWorkTime ? "上班时间" : "下班后的") : "休息日";
  const pseudoTarget = `${seasonZh}日的${weekdayZh}${periodZh}，${dayWord}`;

  return {
    now,
    season,
    seasonZh,
    weekday,
    weekdayZh,
    period,
    periodZh,
    isWorkday,
    isWorkTime,
    tags,
    defaultMoodTags,
    pseudoTarget,
  };
}

/** 给 Companion/文案层一段简短的时间氛围描述。 */
export function timeContextToPseudoTarget(ctx: TimeContext): string {
  return ctx.pseudoTarget;
}

/** 时间场景打分：ctx.tags 与曲库 best_for / time_color 的匹配度（0-1）。 */
export function timeContextScore(
  ctx: TimeContext,
  bestFor: string[],
  timeColor: string,
): number {
  let score = 0;
  const lowerColor = timeColor.toLowerCase();

  // 1) best_for 场景词匹配（每个命中 +0.5，封顶 1）
  if (bestFor.length > 0) {
    let hits = 0;
    for (const t of ctx.tags) {
      for (const b of bestFor) {
        const lowerB = b.toLowerCase();
        if (lowerB.includes(t.toLowerCase()) || t.toLowerCase().includes(lowerB)) {
          hits++;
          break;
        }
      }
    }
    score += Math.min(hits / Math.min(bestFor.length, 4), 1) * 0.5;
  }

  // 2) time_color 时段匹配（复用现有小时规则的强化版）
  const hour = ctx.now.getHours();
  const isNight = hour >= 22 || hour < 5;
  const isMorning = hour >= 5 && hour < 11;
  const isAfternoon = hour >= 11 && hour < 17;
  const isEvening = hour >= 17 && hour < 22;
  if (
    (isNight && /凌晨|深夜|夜晚|半夜|dark|night/i.test(lowerColor)) ||
    (isMorning && /早晨|清晨|早上|日出|morning|dawn/i.test(lowerColor)) ||
    (isAfternoon && /午后|下午|afternoon/i.test(lowerColor)) ||
    (isEvening && /傍晚|黄昏|晚上|dusk|evening/i.test(lowerColor))
  ) {
    score += 0.5;
  } else if (
    (isNight && /晚/i.test(lowerColor)) ||
    (isMorning && /早|晨/i.test(lowerColor)) ||
    (isAfternoon && /午|太阳/i.test(lowerColor)) ||
    (isEvening && /晚|夕|暮/i.test(lowerColor))
  ) {
    score += 0.25;
  }

  return Math.min(score, 1);
}
