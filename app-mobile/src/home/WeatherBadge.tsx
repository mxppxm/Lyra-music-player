/**
 * WeatherBadge — 播放时在画面顶部右侧克制地展示当前天气。
 *
 * 与感知/推荐层共用同一个 WeatherContext：WMO code → icon，温度数字。
 * 位置固定（stage 顶部右侧、不参与 content 布局），沉浸式模式下隐藏，
 * 不遮挡封面、不影响情绪光晕。
 */

export type WeatherContextLike = {
  condition: string;
  tempC: number;
  source: "user-input" | "api";
  code?: number;
};

export type WeatherIconKind =
  | "sun"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "thunder"
  | "hot"
  | "cold";

const CODE_TO_KIND: Record<number, WeatherIconKind> = {
  0: "sun",
  1: "cloudy",
  2: "cloudy",
  3: "cloudy",
  45: "fog",
  48: "fog",
  51: "rain",
  53: "rain",
  55: "rain",
  56: "rain",
  57: "rain",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "rain",
  67: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  80: "rain",
  81: "rain",
  82: "rain",
  85: "snow",
  86: "snow",
  95: "thunder",
  96: "thunder",
  99: "thunder",
};

const CONDITION_TO_KIND: Record<string, WeatherIconKind> = {
  晴: "sun",
  多云: "cloudy",
  雾: "fog",
  雨: "rain",
  阵雨: "rain",
  雪: "snow",
  阵雪: "snow",
  雷雨: "thunder",
};

/** 天气 icon 种类：优先 WMO code，退回 condition 关键词，再退回多云。 */
export function weatherIconKind(weather: WeatherContextLike): WeatherIconKind {
  if (weather.code !== undefined) {
    const byCode = CODE_TO_KIND[weather.code];
    if (byCode) return byCode;
  }
  const byCondition = CONDITION_TO_KIND[weather.condition];
  if (byCondition) return byCondition;
  // 温度边界：无明确天气词时，极端温度优先展示体感
  if (weather.tempC >= 30) return "hot";
  if (weather.tempC <= 5) return "cold";
  return "cloudy";
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 17.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.9 9.4 3.4 3.4 0 0 1 17.5 16z" />
    </svg>
  );
}

function FogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 8.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 15.9 4.9 3.4 3.4 0 0 1 16.5 11" />
      <path d="M4 15h16M4 18.5h16M4 22h10" />
    </svg>
  );
}

function RainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 13a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.9 5 3.4 3.4 0 0 1 17.5 11.5" />
      <path d="M8.5 15.5l-1 2.5M12.5 15.5l-1 2.5M16 15.5l-1 2.5" />
    </svg>
  );
}

function SnowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 13a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.9 5 3.4 3.4 0 0 1 17.5 11.5" />
      <path d="M9.5 16.5l.8 1.9M15 16.5l.8 1.9M12 15l.8 1.9" />
    </svg>
  );
}

function ThunderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 13a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.9 5 3.4 3.4 0 0 1 17.5 11.5" />
      <path d="M12.8 14.5l-2.6 4.6h3.4l-1.6 4" />
    </svg>
  );
}

function ThermometerIcon({ hot }: { hot: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5a3 3 0 0 1 6 0v8.4a4.5 4.5 0 1 1-6 0z" />
      <path d="M12 8v6" />
      {hot ? <circle cx="12" cy="17.5" r="1.6" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

const KIND_LABEL: Record<WeatherIconKind, string> = {
  sun: "晴",
  cloudy: "多云",
  fog: "雾",
  rain: "雨",
  snow: "雪",
  thunder: "雷雨",
  hot: "热",
  cold: "冷",
};

export function WeatherBadge({ weather }: { weather: WeatherContextLike | null }) {
  if (!weather) return null;
  const kind = weatherIconKind(weather);
  return (
    <div
      className="lyra-mobile-weather-badge"
      data-testid="weather-badge"
      aria-label={`天气 ${KIND_LABEL[kind]} ${Math.round(weather.tempC)}°`}
      role="img"
    >
      <span className="lyra-mobile-weather-badge__icon" aria-hidden>
        {kind === "sun" ? <SunIcon /> : null}
        {kind === "cloudy" ? <CloudIcon /> : null}
        {kind === "fog" ? <FogIcon /> : null}
        {kind === "rain" ? <RainIcon /> : null}
        {kind === "snow" ? <SnowIcon /> : null}
        {kind === "thunder" ? <ThunderIcon /> : null}
        {kind === "hot" ? <ThermometerIcon hot /> : null}
        {kind === "cold" ? <ThermometerIcon hot={false} /> : null}
      </span>
      <span className="lyra-mobile-weather-badge__temp" aria-hidden>
        {Math.round(weather.tempC)}°
      </span>
    </div>
  );
}
