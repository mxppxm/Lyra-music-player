/**
 * 时间上下文 —— 季节 / 星期 / 天气 + 原始时钟。
 *
 * 推荐打分与文案都不使用「清晨/午休/傍晚」等时段桶；
 * Companion 只收到本地时刻与气象事实，自行感受氛围。
 * period / PERIODS 仅留给 moodSummary 等统计聚合，不进 tags / 文案。
 */

export type TimePeriod =
  | "early-morning" // 6-9（仅统计用）
  | "morning" // 9-11
  | "lunch" // 11-14
  | "afternoon" // 14-18
  | "evening" // 18-20
  | "night" // 20-23
  | "late-night"; // 23-6

export type Season = "spring" | "summer" | "autumn" | "winter";

/** 天气上下文 —— 推荐与文案的天气维度（Open-Meteo / 用户输入）。 */
export type WeatherContext = {
  condition: string; // e.g. "晴", "雨", "多云"
  tempC: number;
  source: "user-input" | "api";
  /** Open-Meteo WMO 天气代码（source=api 时存在）。 */
  code?: number;
  /** 体感温度 °C。 */
  feelsLikeC?: number;
  /** 相对湿度 0–100。 */
  humidityPct?: number;
  /** 当前降水量 mm。 */
  precipMm?: number;
  /** 云量 0–100。 */
  cloudCoverPct?: number;
  /** 风速 km/h。 */
  windSpeedKmh?: number;
  /** 是否白天（来自 Open-Meteo is_day）。 */
  isDay?: boolean;
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

/** 天气 → 中文标签组，用于曲库 best_for 天气词匹配。 */
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
  if (weather.tempC >= 30) tags.push("炎热");
  else if (weather.tempC <= 5) tags.push("寒冷");
  if (weather.humidityPct != null && weather.humidityPct >= 80) tags.push("潮湿");
  if (weather.windSpeedKmh != null && weather.windSpeedKmh >= 25) tags.push("有风");
  if (weather.precipMm != null && weather.precipMm > 0) tags.push("有雨");
  if (weather.cloudCoverPct != null && weather.cloudCoverPct >= 85) tags.push("阴天");
  return tags;
}

const WEEKDAY_ZH_CLOCK = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(n % 1 === 0 ? 0 : 1);
}

/**
 * 给 Companion / 文案层的原始时钟 + 气象事实。
 * 不含「清晨/午休」等系统时段词。
 */
export function formatAmbientFactsForCompanion(
  now: Date = new Date(),
  weather?: WeatherContext,
): string {
  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const weekdayZh = WEEKDAY_ZH_CLOCK[now.getDay()] ?? "";
  const lines = [`本地时间: ${y}-${mo}-${d} ${h}:${mi}（${weekdayZh}）`];

  if (!weather) {
    lines.push("天气: （暂无）");
    return lines.join("\n");
  }

  const facts: string[] = [weather.condition, `气温 ${round1(weather.tempC)}°C`];
  if (weather.feelsLikeC != null) facts.push(`体感 ${round1(weather.feelsLikeC)}°C`);
  if (weather.humidityPct != null) facts.push(`湿度 ${Math.round(weather.humidityPct)}%`);
  if (weather.windSpeedKmh != null) facts.push(`风速 ${round1(weather.windSpeedKmh)} km/h`);
  if (weather.precipMm != null) facts.push(`降水 ${round1(weather.precipMm)} mm`);
  if (weather.cloudCoverPct != null) facts.push(`云量 ${Math.round(weather.cloudCoverPct)}%`);
  if (weather.isDay != null) facts.push(weather.isDay ? "白天" : "夜晚");
  lines.push(`天气事实: ${facts.join("，")}`);
  return lines.join("\n");
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
  /**
   * @deprecated 仅 moodSummary 统计用；不进推荐 tags / Companion 文案。
   */
  period: TimePeriod;
  /**
   * @deprecated 仅 moodSummary 统计用；不进推荐 tags / Companion 文案。
   */
  periodZh: string;
  /** 是否周一至周五（日历事实）。不进推荐文案。 */
  isWorkday: boolean;
  /** 是否工作日 9–18（日历窗口）。不进推荐文案。 */
  isWorkTime: boolean;
  /** 打分标签：季节 / 星期 / 天气（无时段词）。 */
  tags: string[];
  /** 无用户输入时的软心情种子（按钟点，不是时段名称）。 */
  defaultMoodTags: string[];
  /** 伪目标：原始时钟 + 天气事实（与 Companion 同源）。 */
  pseudoTarget: string;
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
  "early-morning": "6–9时",
  morning: "9–11时",
  lunch: "11–14时",
  afternoon: "14–18时",
  evening: "18–20时",
  night: "20–23时",
  "late-night": "23–6时",
};

/** 有序时段列表（含钟点区间标签），供 moodSummary 聚合展示。 */
export const PERIODS: ReadonlyArray<{ id: TimePeriod; label: string }> = [
  { id: "early-morning", label: PERIOD_ZH["early-morning"] },
  { id: "morning", label: PERIOD_ZH.morning },
  { id: "lunch", label: PERIOD_ZH.lunch },
  { id: "afternoon", label: PERIOD_ZH.afternoon },
  { id: "evening", label: PERIOD_ZH.evening },
  { id: "night", label: PERIOD_ZH.night },
  { id: "late-night", label: PERIOD_ZH["late-night"] },
];

/** 按小时返回所在统计桶（0-23）。仅 moodSummary 使用。 */
export function periodOfHour(hour: number): TimePeriod {
  if (hour >= 6 && hour < 9) return "early-morning";
  if (hour >= 9 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "lunch";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 20) return "evening";
  if (hour >= 20 && hour < 23) return "night";
  return "late-night";
}

/** 钟点 → 软心情种子（标签是情绪词，不是「清晨/午休」）。 */
function defaultMoodTagsForHour(hour: number): string[] {
  if (hour >= 6 && hour < 9) return ["清醒", "清爽"];
  if (hour >= 9 && hour < 11) return ["专注", "清醒"];
  if (hour >= 11 && hour < 14) return ["放松", "小憩"];
  if (hour >= 14 && hour < 18) return ["专注", "慵懒"];
  if (hour >= 18 && hour < 20) return ["释然", "疲惫"];
  if (hour >= 20 && hour < 23) return ["放松", "安静"];
  return ["平静", "内省", "孤独"];
}

/** 文案/曲库 time_color、best_for 与当前钟点是否同频（不用预设时段标签）。 */
function textMatchesClockHour(hour: number, text: string): "strong" | "weak" | null {
  const t = text.toLowerCase();
  const isNight = hour >= 22 || hour < 5;
  const isMorning = hour >= 5 && hour < 11;
  const isAfternoon = hour >= 11 && hour < 17;
  const isEvening = hour >= 17 && hour < 22;
  if (
    (isNight && /凌晨|深夜|夜晚|半夜|dark|night/i.test(t)) ||
    (isMorning && /早晨|清晨|早上|日出|morning|dawn/i.test(t)) ||
    (isAfternoon && /午后|下午|afternoon/i.test(t)) ||
    (isEvening && /傍晚|黄昏|晚上|dusk|evening/i.test(t))
  ) {
    return "strong";
  }
  if (
    (isNight && /晚/i.test(t)) ||
    (isMorning && /早|晨/i.test(t)) ||
    (isAfternoon && /午|太阳/i.test(t)) ||
    (isEvening && /晚|夕|暮/i.test(t))
  ) {
    return "weak";
  }
  return null;
}

export function computeTimeContext(
  now: Date = new Date(),
  weather?: WeatherContext,
): TimeContext {
  const month = now.getMonth() + 1; // 1-12
  const season: Season = SEASON_BY_MONTH[month] ?? "spring";
  const seasonZh = SEASON_ZH[season];

  const jsDay = now.getDay();
  const weekday = jsDay === 0 ? 7 : jsDay;
  const weekdayZh = WEEKDAY_ZH[weekday - 1];

  const hour = now.getHours();
  const isWorkday = weekday <= 5;
  const period = periodOfHour(hour);
  const periodZh = PERIOD_ZH[period];
  const isWorkTime = isWorkday && hour >= 9 && hour < 18;

  const weatherTags = weather ? weatherTagsFromWeather(weather) : [];
  // 无时段词：只保留季节、星期、天气
  const tags = [`${seasonZh}季`, `${seasonZh}天`, weekdayZh, ...weatherTags];

  const defaultMoodTags = defaultMoodTagsForHour(hour);
  const pseudoTarget = formatAmbientFactsForCompanion(now, weather);

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

/** @deprecated 与 formatAmbientFactsForCompanion 同源；保留别名。 */
export function timeContextToPseudoTarget(ctx: TimeContext): string {
  return ctx.pseudoTarget;
}

/**
 * 时间场景打分：季节/星期/天气 tags + 钟点对 time_color/best_for 的软匹配。
 * 不依赖「清晨/午休」等预设时段标签。
 */
export function timeContextScore(
  ctx: TimeContext,
  bestFor: string[],
  timeColor: string,
): number {
  let score = 0;
  const hour = ctx.now.getHours();

  // 1) tags（季节/星期，不含天气）vs best_for
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
    score += Math.min(hits / Math.min(bestFor.length, 4), 1) * 0.35;
  }

  // 2) 钟点 ↔ time_color
  const colorMatch = textMatchesClockHour(hour, timeColor);
  if (colorMatch === "strong") score += 0.5;
  else if (colorMatch === "weak") score += 0.25;

  // 3) 钟点 ↔ best_for（歌曲自己的场景词，不是我们塞的时段桶）
  if (bestFor.length > 0) {
    let strong = 0;
    let weak = 0;
    for (const b of bestFor) {
      const m = textMatchesClockHour(hour, b);
      if (m === "strong") strong++;
      else if (m === "weak") weak++;
    }
    if (strong > 0) {
      score += Math.min(strong / Math.min(bestFor.length, 4), 1) * 0.35;
    } else if (weak > 0) {
      score += Math.min(weak / Math.min(bestFor.length, 4), 1) * 0.15;
    }
  }

  // 4) 天气 ↔ best_for
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
