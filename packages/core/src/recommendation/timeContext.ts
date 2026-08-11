/**
 * 时间上下文 —— 把「现在是什么时候」翻译成推荐器能用的信号。
 *
 * 季节 / 星期几 / 时段（清晨→深夜）/ 天气 → 中文标签 + 时段默认心情 + 伪目标文案。
 * 不推断「在不在上班」：场所与人生剧本留给用户自己说（后续可接场所锚点）。
 */

export type TimePeriod =
  | "early-morning" // 清晨 6-9
  | "morning" // 上午 9-11
  | "lunch" // 中午 11-14
  | "afternoon" // 下午 14-18
  | "evening" // 傍晚 18-20
  | "night" // 夜晚 20-23
  | "late-night"; // 深夜 23-6

export type Season = "spring" | "summer" | "autumn" | "winter";

/** 天气上下文 —— 推荐与文案的天气维度（Open-Meteo / 用户输入）。 */
export type WeatherContext = {
  condition: string; // e.g. "晴", "雨", "多云"
  tempC: number;
  source: "user-input" | "api";
  /** Open-Meteo WMO 天气代码（source=api 时存在）。 */
  code?: number;
};

/** WMO 天气代码 → 中文天气词（0 晴 / 1-3 多云 / 45-48 雾 / 51-67 雨 / 71-77 雪 / 80-82 阵雨 / 85-86 阵雪 / 95-99 雷雨）。 */
export function weatherZhFromCode(code: number | undefined): string {
  if (code === 0) return "晴";
  if (code !== undefined && code >= 1 && code <= 3) return "多云";
  if (code === 45 || code === 48) return "雾";
  if (code !== undefined && code >= 51 && code <= 67) return "雨";
  if (
    code !== undefined &&
    ((code >= 71 && code <= 77) || code === 85 || code === 86)
  )
    return "雪";
  if (code !== undefined && code >= 80 && code <= 82) return "阵雨";
  if (code !== undefined && code >= 95 && code <= 99) return "雷雨";
  return "多云";
}

/** 天气词 → 适合文案的自然标签（雨天/雪天/晴天…）。 */
const WEATHER_LABELS: Record<string, string> = {
  晴: "晴天",
  多云: "多云",
  雾: "雾天",
  雨: "雨天",
  阵雨: "阵雨天",
  雪: "雪天",
  雷雨: "雷雨天",
};

function weatherLabel(weather: WeatherContext): string {
  const word =
    weather.code !== undefined ? weatherZhFromCode(weather.code) : weather.condition;
  return WEATHER_LABELS[word] ?? `${word}天`;
}

/** 天气 → 中文标签组，用于曲库 best_for / time_color 场景匹配（雨天 → [雨天,下雨,雨]）。 */
export function weatherTagsFromWeather(weather: WeatherContext): string[] {
  const word = weather.code !== undefined ? weatherZhFromCode(weather.code) : weather.condition;
  const base: Record<string, string[]> = {
    晴: ["晴天", "晴"],
    多云: ["多云"],
    雾: ["雾天", "雾"],
    雨: ["雨天", "下雨", "雨"],
    阵雨: ["阵雨", "雨天", "雨"],
    雪: ["雪天", "下雪", "雪"],
    雷雨: ["雷雨", "雷雨天"],
  };
  const tags = [...(base[word] ?? [`${word}天`, word])];
  // 温度边界 → 极热/极冷标签（配合「夏天/冬天」场景词）。
  if (weather.tempC >= 30) tags.push("炎热");
  else if (weather.tempC <= 5) tags.push("寒冷");
  return tags;
}

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
  /** 时段中文（清晨/上午/中午/下午/傍晚/夜晚/深夜）。 */
  periodZh: string;
  /**
   * 是否周一至周五（日历事实，不表示「在上班」）。
   * 保留字段供统计等使用；不进入推荐 tags / 文案。
   */
  isWorkday: boolean;
  /**
   * 是否工作日 9–18（日历窗口，不表示真实场所）。
   * 保留字段；不进入推荐 tags / 文案。
   */
  isWorkTime: boolean;
  /** 中文标签组 —— 用于匹配曲库的 best_for / mood / time_color（无上班/通勤推断）。 */
  tags: string[];
  /** 时段默认心情标签 —— 用户没说话时当作心情入口。 */
  defaultMoodTags: string[];
  /** 伪目标文案 —— 「夏日的周三下午，下雨天」这类开场白（不含上班状态）。 */
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
  "early-morning": "清晨",
  morning: "上午",
  lunch: "中午",
  afternoon: "下午",
  evening: "傍晚",
  night: "夜晚",
  "late-night": "深夜",
};

/** 有序时段列表（含中文标签），供 moodSummary 等模块聚合展示。 */
export const PERIODS: ReadonlyArray<{ id: TimePeriod; label: string }> = [
  { id: "early-morning", label: PERIOD_ZH["early-morning"] },
  { id: "morning", label: PERIOD_ZH.morning },
  { id: "lunch", label: PERIOD_ZH.lunch },
  { id: "afternoon", label: PERIOD_ZH.afternoon },
  { id: "evening", label: PERIOD_ZH.evening },
  { id: "night", label: PERIOD_ZH.night },
  { id: "late-night", label: PERIOD_ZH["late-night"] },
];

/** 按小时返回所在时段（0-23）。 */
export function periodOfHour(hour: number): TimePeriod {
  if (hour >= 6 && hour < 9) return "early-morning";
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
  "early-morning": ["清醒", "清爽"],
  morning: ["专注", "清醒"],
  lunch: ["放松", "小憩"],
  afternoon: ["专注", "慵懒"],
  evening: ["释然", "疲惫"],
  night: ["放松", "安静"],
  "late-night": ["平静", "内省", "孤独"],
};

/** 各时段在曲库 best_for 里常见的中文场景词（用于打分匹配；不含上班/通勤推断）。 */
const PERIOD_SCENE_TAGS: Record<TimePeriod, string[]> = {
  "early-morning": ["清晨", "早上", "早晨"],
  morning: ["上午", "早上", "清晨", "专注"],
  lunch: ["中午", "午后", "小憩"],
  afternoon: ["下午", "午后", "下午茶"],
  evening: ["傍晚", "黄昏"],
  night: ["夜晚", "晚上", "夜色"],
  "late-night": ["深夜", "凌晨", "独处", "睡前"],
};

export function computeTimeContext(
  now: Date = new Date(),
  weather?: WeatherContext,
): TimeContext {
  const month = now.getMonth() + 1; // 1-12
  const season: Season = SEASON_BY_MONTH[month] ?? "spring";
  const seasonZh = SEASON_ZH[season];

  // JS getDay(): 0=周日 … 6=周六 → 转成 1=周一 … 7=周日
  const jsDay = now.getDay();
  const weekday = jsDay === 0 ? 7 : jsDay;
  const weekdayZh = WEEKDAY_ZH[weekday - 1];

  const hour = now.getHours();
  const isWorkday = weekday <= 5;
  const period = periodOfHour(hour);
  const periodZh = PERIOD_ZH[period];
  // 日历窗口，不表示真实场所；不写入 tags / pseudoTarget。
  const isWorkTime = isWorkday && hour >= 9 && hour < 18;

  // 标签组：季节 + 星期 + 时段 + 场景词 + 天气（无上班/休息推断）
  const weatherTags = weather ? weatherTagsFromWeather(weather) : [];
  const tags = [
    `${seasonZh}季`,
    `${seasonZh}天`,
    weekdayZh,
    periodZh,
    ...PERIOD_SCENE_TAGS[period],
    ...weatherTags,
  ];

  const defaultMoodTags = [...PERIOD_MOOD_TAGS[period]];

  // 伪目标文案：如「夏日的周三下午，下雨天」
  const pseudoTarget = [
    `${seasonZh}日的${weekdayZh}${periodZh}`,
    weather ? weatherLabel(weather) : null,
  ]
    .filter((s): s is string => Boolean(s))
    .join("，");

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
    weather,
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

  // 1) best_for 场景词匹配（每个命中 +0.5，封顶 1）—— 天气标签不在此计分，
  //    由下方第 3 维度单独计分，避免同一 best_for 天气词被计两次。
  if (bestFor.length > 0) {
    const weatherTagSet = ctx.weather
      ? new Set(weatherTagsFromWeather(ctx.weather))
      : new Set<string>();
    let hits = 0;
    for (const t of ctx.tags) {
      if (weatherTagSet.has(t)) continue;
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

  // 3) 天气场景匹配：best_for 命中 雨天/下雪/晴/炎热 等天气词 → 加分。
  //    曲库画像里的 best_for 常见「雨天通勤」「下雪天」「大晴天」这类场景。
  if (ctx.weather) {
    const wxTags = weatherTagsFromWeather(ctx.weather);
    let wxHits = 0;
    for (const t of wxTags) {
      for (const b of bestFor) {
        const lb = b.toLowerCase();
        if (lb.includes(t) || t.includes(lb)) {
          wxHits++;
          break;
        }
      }
    }
    if (wxHits > 0) {
      score += Math.min(wxHits / Math.min(wxTags.length, 3), 1) * 0.25;
    }
  }

  return Math.min(score, 1);
}
