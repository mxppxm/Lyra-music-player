import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherBadge, weatherIconKind } from "./WeatherBadge";

const api = (code: number, tempC: number) => ({
  condition: "多云",
  tempC,
  source: "api" as const,
  code,
});

describe("weatherIconKind", () => {
  it("maps WMO codes to icon kinds", () => {
    expect(weatherIconKind(api(0, 22))).toBe("sun"); // 晴
    expect(weatherIconKind(api(3, 22))).toBe("cloudy"); // 多云
    expect(weatherIconKind(api(45, 18))).toBe("fog"); // 雾
    expect(weatherIconKind(api(61, 18))).toBe("rain"); // 雨
    expect(weatherIconKind(api(71, 0))).toBe("snow"); // 雪
    expect(weatherIconKind(api(85, 0))).toBe("snow"); // 阵雪
    expect(weatherIconKind(api(95, 24))).toBe("thunder"); // 雷雨
  });

  it("falls back to condition keyword when code is absent (user input)", () => {
    expect(
      weatherIconKind({ condition: "晴", tempC: 26, source: "user-input" }),
    ).toBe("sun");
    expect(
      weatherIconKind({ condition: "雪", tempC: -2, source: "user-input" }),
    ).toBe("snow");
  });

  it("falls back to temperature extremes when no weather word matches", () => {
    expect(
      weatherIconKind({ condition: "未知", tempC: 35, source: "api" }),
    ).toBe("hot");
    expect(
      weatherIconKind({ condition: "未知", tempC: -4, source: "api" }),
    ).toBe("cold");
    expect(
      weatherIconKind({ condition: "未知", tempC: 22, source: "api" }),
    ).toBe("cloudy");
  });
});

describe("WeatherBadge", () => {
  it("renders nothing when weather is null", () => {
    const { container } = render(<WeatherBadge weather={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders icon + temperature with a readable aria label", () => {
    render(<WeatherBadge weather={api(61, 18)} />);
    const badge = screen.getByTestId("weather-badge");
    expect(badge).toHaveAttribute("aria-label", "天气 雨 18°");
    expect(badge.textContent).toContain("18°");
  });

  it("exposes hot/cold via aria label", () => {
    render(<WeatherBadge weather={{ condition: "晴", tempC: 34, source: "api", code: 0 }} />);
    expect(screen.getByTestId("weather-badge")).toHaveAttribute(
      "aria-label",
      "天气 晴 34°",
    );
    // 温度极端但天气词明确时仍优先天气词（晴），体感由温度数字传达
    render(
      <WeatherBadge weather={{ condition: "未知", tempC: 34, source: "api" }} />,
    );
    expect(screen.getAllByTestId("weather-badge")[1]).toHaveAttribute(
      "aria-label",
      "天气 热 34°",
    );
  });
});
