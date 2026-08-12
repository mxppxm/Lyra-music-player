import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WeatherBadge, weatherIconKind } from "./WeatherBadge";

vi.mock("./immersiveStatusBar", () => ({
  lightTap: vi.fn(),
  setImmersiveStatusBar: vi.fn(),
}));

const api = (code: number, tempC: number) => ({
  condition: "多云",
  tempC,
  source: "api" as const,
  code,
});

async function flushMorphOpen() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

describe("weatherIconKind", () => {
  it("maps WMO codes to icon kinds", () => {
    expect(weatherIconKind(api(0, 22))).toBe("sun");
    expect(weatherIconKind(api(3, 22))).toBe("cloudy");
    expect(weatherIconKind(api(45, 18))).toBe("fog");
    expect(weatherIconKind(api(61, 18))).toBe("rain");
    expect(weatherIconKind(api(71, 0))).toBe("snow");
    expect(weatherIconKind(api(85, 0))).toBe("snow");
    expect(weatherIconKind(api(95, 24))).toBe("thunder");
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
    expect(badge).toHaveAttribute("aria-label", "展开天气 雨 18°");
    expect(badge.textContent).toContain("18°");
  });

  it("exposes hot/cold via aria label", () => {
    render(<WeatherBadge weather={{ condition: "晴", tempC: 34, source: "api", code: 0 }} />);
    expect(screen.getByTestId("weather-badge")).toHaveAttribute(
      "aria-label",
      "展开天气 晴 34°",
    );
    render(
      <WeatherBadge weather={{ condition: "未知", tempC: 34, source: "api" }} />,
    );
    expect(screen.getAllByTestId("weather-badge")[1]).toHaveAttribute(
      "aria-label",
      "展开天气 热 34°",
    );
  });

  it("morphs open like lyrics sheet and closes via scrim", async () => {
    render(
      <WeatherBadge
        weather={{
          condition: "雨",
          tempC: 18.2,
          source: "api",
          code: 61,
          feelsLikeC: 16,
          humidityPct: 82,
          windSpeedKmh: 12,
          precipMm: 0.4,
          cloudCoverPct: 90,
          isDay: false,
        }}
      />,
    );

    const badge = screen.getByTestId("weather-badge");
    expect(badge).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("weather-sheet")).toBeNull();

    fireEvent.click(badge);
    expect(screen.getByTestId("weather-sheet")).toBeTruthy();
    expect(badge.className).toContain("lyra-mobile-weather-badge--morphing");

    await flushMorphOpen();

    expect(badge).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("weather-panel");
    expect(panel.className).toContain("lyra-mobile-weather-morph__card");
    expect(panel.textContent).toContain("雨");
    expect(panel.textContent).toContain("18°");
    expect(panel.textContent).toContain("湿度");
    expect(panel.textContent).toContain("82%");
    expect(panel.textContent).toContain("夜晚");
    // 头部复用角标同款 icon + 温度
    expect(panel.querySelector(".lyra-mobile-weather-morph__head .lyra-mobile-weather-badge__icon")).toBeTruthy();
    expect(panel.querySelector(".lyra-mobile-weather-morph__head .lyra-mobile-weather-badge__temp")).toBeTruthy();

    fireEvent.click(screen.getByTestId("weather-scrim"));
    expect(badge).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the floating panel itself is clicked", async () => {
    render(
      <WeatherBadge
        weather={{
          condition: "雨",
          tempC: 18,
          source: "api",
          code: 61,
          humidityPct: 80,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("weather-badge"));
    await flushMorphOpen();
    expect(screen.getByTestId("weather-badge")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByTestId("weather-panel"));
    expect(screen.getByTestId("weather-badge")).toHaveAttribute("aria-expanded", "false");
  });
});
