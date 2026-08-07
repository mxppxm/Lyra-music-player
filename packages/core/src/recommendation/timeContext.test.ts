import { describe, it, expect } from "vitest";
import {
  computeTimeContext,
  timeContextScore,
  timeContextToPseudoTarget,
  weatherZhFromCode,
  weatherTagsFromWeather,
} from "./timeContext";

// 2026-08-05 是周三（工作日）
function at(hour: number, weekday: number = 3, month: number = 8): Date {
  // weekday: 1=周一 … 7=周日 → JS getDay: 0=周日 … 6=周六
  const jsDay = weekday % 7;
  return new Date(2026, month - 1, 5 + ((jsDay - new Date(2026, month - 1, 5).getDay() + 7) % 7), hour, 0, 0);
}

describe("computeTimeContext", () => {
  it("工作日周三下午 → 上班时间、下午标签", () => {
    const ctx = computeTimeContext(at(15, 3, 8));
    expect(ctx.seasonZh).toBe("夏");
    expect(ctx.weekdayZh).toBe("周三");
    expect(ctx.periodZh).toBe("下午");
    expect(ctx.isWorkday).toBe(true);
    expect(ctx.isWorkTime).toBe(true);
    expect(ctx.tags).toContain("上班时间");
    expect(ctx.tags).toContain("下午");
  });

  it("周六 → 休息日、非上班时间", () => {
    const ctx = computeTimeContext(at(10, 6, 1));
    expect(ctx.isWorkday).toBe(false);
    expect(ctx.isWorkTime).toBe(false);
    expect(ctx.tags).toContain("休息日");
    expect(ctx.weekdayZh).toBe("周六");
    expect(ctx.seasonZh).toBe("冬");
  });

  it("深夜 → late-night + 默认心情 平静/内省/孤独", () => {
    const ctx = computeTimeContext(at(1, 5, 7));
    expect(ctx.period).toBe("late-night");
    expect(ctx.periodZh).toBe("深夜");
    expect(ctx.defaultMoodTags).toContain("平静");
    expect(ctx.defaultMoodTags).toContain("内省");
  });

  it("早通勤（工作日 7 点）→ early-commute + 清醒", () => {
    const ctx = computeTimeContext(at(7, 2, 4));
    expect(ctx.period).toBe("early-commute");
    expect(ctx.periodZh).toBe("早通勤");
    expect(ctx.defaultMoodTags).toContain("清醒");
  });

  it("周日凌晨是深夜且休息日", () => {
    const ctx = computeTimeContext(at(2, 7, 3));
    expect(ctx.period).toBe("late-night");
    expect(ctx.isWorkday).toBe(false);
  });

  it("伪目标文案包含季节、星期、时段、状态", () => {
    const ctx = computeTimeContext(at(15, 3, 8));
    const t = timeContextToPseudoTarget(ctx);
    expect(t).toContain("夏日");
    expect(t).toContain("周三");
    expect(t).toContain("下午");
    expect(t).toContain("上班");
  });

  it("注入雨天天气 → 标签含 雨天/下雨，伪目标文案含 雨天", () => {
    const ctx = computeTimeContext(at(15, 3, 8), {
      condition: "雨",
      tempC: 18,
      source: "api",
      code: 61,
    });
    expect(ctx.tags).toContain("雨天");
    expect(ctx.tags).toContain("下雨");
    expect(ctx.weather?.code).toBe(61);
    const t = timeContextToPseudoTarget(ctx);
    expect(t).toContain("雨天");
  });

  it("极热/极冷天气 → 炎热/寒冷标签", () => {
    const hot = computeTimeContext(at(15, 3, 8), {
      condition: "晴",
      tempC: 33,
      source: "api",
      code: 0,
    });
    expect(hot.tags).toContain("炎热");
    expect(hot.tags).toContain("晴天");

    const cold = computeTimeContext(at(15, 3, 8), {
      condition: "雪",
      tempC: -3,
      source: "api",
      code: 71,
    });
    expect(cold.tags).toContain("寒冷");
    expect(cold.tags).toContain("雪天");
  });
});

describe("weather helpers", () => {
  it("WMO code → 中文天气词", () => {
    expect(weatherZhFromCode(0)).toBe("晴");
    expect(weatherZhFromCode(3)).toBe("多云");
    expect(weatherZhFromCode(45)).toBe("雾");
    expect(weatherZhFromCode(61)).toBe("雨");
    expect(weatherZhFromCode(71)).toBe("雪");
    expect(weatherZhFromCode(80)).toBe("阵雨");
    expect(weatherZhFromCode(85)).toBe("雪"); // 阵雪
    expect(weatherZhFromCode(86)).toBe("雪"); // 阵雪
    expect(weatherZhFromCode(95)).toBe("雷雨");
    expect(weatherZhFromCode(undefined)).toBe("多云");
  });

  it("天气标签组覆盖场景词变体", () => {
    expect(weatherTagsFromWeather({ condition: "雨", tempC: 18, source: "api", code: 61 })).toEqual(
      expect.arrayContaining(["雨天", "下雨", "雨"]),
    );
    expect(weatherTagsFromWeather({ condition: "雪", tempC: 0, source: "api", code: 71 })).toEqual(
      expect.arrayContaining(["雪天", "下雪"]),
    );
    // 无 code（用户输入 source）→ 从 condition 派生
    expect(weatherTagsFromWeather({ condition: "晴", tempC: 22, source: "user-input" })).toEqual(
      expect.arrayContaining(["晴天"]),
    );
  });
});

describe("timeContextScore", () => {
  it("best_for 命中深夜场景词 → 高分", () => {
    const ctx = computeTimeContext(at(23, 3, 8)); // 深夜
    const score = timeContextScore(ctx, ["深夜独处", "睡前"], "深夜");
    expect(score).toBeGreaterThan(0.7);
  });

  it("best_for 完全不相关 → 低分", () => {
    const ctx = computeTimeContext(at(23, 3, 8));
    const score = timeContextScore(ctx, ["晨跑", "清晨"], "清晨");
    expect(score).toBeLessThan(0.4);
  });

  it("上班时间命中 通勤/工作 → 加分", () => {
    const ctx = computeTimeContext(at(9, 1, 8)); // 周一上午
    const score = timeContextScore(ctx, ["通勤路上", "工作专注"], "");
    expect(score).toBeGreaterThan(0.3);
  });

  it("分数封顶 1", () => {
    const ctx = computeTimeContext(at(15, 3, 8));
    expect(timeContextScore(ctx, ["下午茶", "午后"], "午后")).toBeLessThanOrEqual(1);
  });

  it("雨天天气 → best_for 命中 雨天通勤 加分（高于无天气）", () => {
    const rainy = computeTimeContext(at(15, 3, 8), {
      condition: "雨",
      tempC: 18,
      source: "api",
      code: 61,
    });
    const plain = computeTimeContext(at(15, 3, 8));
    // 同一首歌，天气场景词只在雨天命中
    const withRain = timeContextScore(rainy, ["雨天通勤", "安静"], "");
    const withoutRain = timeContextScore(plain, ["雨天通勤", "安静"], "");
    expect(withRain).toBeGreaterThan(withoutRain);
    expect(withRain).toBeLessThanOrEqual(1);
  });
});
