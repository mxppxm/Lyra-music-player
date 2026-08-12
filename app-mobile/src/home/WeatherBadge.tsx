/**
 * WeatherBadge — 播放时顶部右侧天气角标。
 * 展开动效对齐歌词：同一张玻璃卡从角标矩形 morph 伸开到详情面板。
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { lightTap } from "./immersiveStatusBar";

export type WeatherContextLike = {
  condition: string;
  tempC: number;
  source: "user-input" | "api";
  code?: number;
  feelsLikeC?: number;
  humidityPct?: number;
  precipMm?: number;
  cloudCoverPct?: number;
  windSpeedKmh?: number;
  isDay?: boolean;
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

export function weatherIconKind(weather: WeatherContextLike): WeatherIconKind {
  if (weather.code !== undefined) {
    const byCode = CODE_TO_KIND[weather.code];
    if (byCode) return byCode;
  }
  const byCondition = CONDITION_TO_KIND[weather.condition];
  if (byCondition) return byCondition;
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

function ThermometerIcon({ hot }: { hot?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5a3 3 0 0 1 6 0v8.4a4.5 4.5 0 1 1-6 0z" />
      <path d="M12 8v6" />
      {hot ? <circle cx="12" cy="17.5" r="1.6" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5c0 0 6 7.2 6 11.2a6 6 0 1 1-12 0C6 10.7 12 3.5 12 3.5z" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10h11.5a3 3 0 1 0-3-3" />
      <path d="M3 14h14a3.5 3.5 0 1 1-3.5 3.5" />
      <path d="M3 18h7.5a2.5 2.5 0 1 0-2.5-2.5" />
    </svg>
  );
}

function PrecipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 4.5v4M12 3v4M16 4.5v4" />
      <path d="M7 14.5l1.2 3M12 13l1.2 3M17 14.5l1.2 3" />
      <path d="M5.5 11.5h13" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16.5 3.5A8.5 8.5 0 1 0 20.5 14 7 7 0 0 1 16.5 3.5z" />
    </svg>
  );
}

function WeatherKindIcon({ kind }: { kind: WeatherIconKind }) {
  if (kind === "sun") return <SunIcon />;
  if (kind === "cloudy") return <CloudIcon />;
  if (kind === "fog") return <FogIcon />;
  if (kind === "rain") return <RainIcon />;
  if (kind === "snow") return <SnowIcon />;
  if (kind === "thunder") return <ThunderIcon />;
  if (kind === "hot") return <ThermometerIcon hot />;
  return <ThermometerIcon />;
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

function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

type DetailRow = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
};

function buildDetailRows(weather: WeatherContextLike): DetailRow[] {
  const rows: DetailRow[] = [];
  if (weather.feelsLikeC != null) {
    rows.push({
      key: "feels",
      label: "体感",
      value: `${fmt1(weather.feelsLikeC)}°`,
      icon: <ThermometerIcon />,
    });
  }
  if (weather.humidityPct != null) {
    rows.push({
      key: "humidity",
      label: "湿度",
      value: `${Math.round(weather.humidityPct)}%`,
      icon: <DropletIcon />,
    });
  }
  if (weather.windSpeedKmh != null) {
    rows.push({
      key: "wind",
      label: "风速",
      value: `${fmt1(weather.windSpeedKmh)} km/h`,
      icon: <WindIcon />,
    });
  }
  if (weather.precipMm != null) {
    rows.push({
      key: "precip",
      label: "降水",
      value: `${fmt1(weather.precipMm)} mm`,
      icon: <PrecipIcon />,
    });
  }
  if (weather.cloudCoverPct != null) {
    rows.push({
      key: "cloud",
      label: "云量",
      value: `${Math.round(weather.cloudCoverPct)}%`,
      icon: <CloudIcon />,
    });
  }
  if (weather.isDay != null) {
    rows.push({
      key: "day",
      label: "昼夜",
      value: weather.isDay ? "白天" : "夜晚",
      icon: weather.isDay ? <SunIcon /> : <MoonIcon />,
    });
  }
  return rows;
}

type RectBox = { top: number; left: number; width: number; height: number };

function readRect(el: HTMLElement): RectBox {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function expandedTarget(origin: RectBox, rowCount: number): RectBox {
  const margin = 14;
  const width = Math.min(228, window.innerWidth - margin * 2);
  // 头部与角标同高，下方条件 + 详情行（内容一开始就在，靠 overflow 裁切露出）
  const body = 8 + 22 + (rowCount > 0 ? rowCount * 34 : 36) + 10;
  const height = Math.min(36 + body, window.innerHeight - margin * 2);
  const left = Math.min(
    Math.max(origin.left + origin.width - width, margin),
    window.innerWidth - margin - width,
  );
  const top = Math.min(
    Math.max(origin.top, margin),
    window.innerHeight - margin - height,
  );
  return { top, left, width, height };
}

function boxStyle(box: RectBox): CSSProperties {
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

export function WeatherBadge({ weather }: { weather: WeatherContextLike | null }) {
  const badgeRef = useRef<HTMLButtonElement>(null);
  const originRef = useRef<RectBox | null>(null);
  const morphGenRef = useRef(0);
  const morphOpenRef = useRef(false);
  const panelId = useId();

  const [morphMounted, setMorphMounted] = useState(false);
  const [morphOpen, setMorphOpen] = useState(false);
  const [originBox, setOriginBox] = useState<RectBox | null>(null);
  const [targetBox, setTargetBox] = useState<RectBox | null>(null);

  morphOpenRef.current = morphOpen;

  useEffect(() => {
    if (weather || !morphMounted) return;
    morphGenRef.current += 1;
    setMorphOpen(false);
    setMorphMounted(false);
    setOriginBox(null);
    setTargetBox(null);
    originRef.current = null;
  }, [weather, morphMounted]);

  const rows = weather ? buildDetailRows(weather) : [];
  const rowCount = rows.length;

  function closeExpand() {
    morphGenRef.current += 1;
    const origin =
      originRef.current ??
      (badgeRef.current ? readRect(badgeRef.current) : null);
    if (!origin) {
      setMorphOpen(false);
      setMorphMounted(false);
      setOriginBox(null);
      setTargetBox(null);
      return;
    }
    setOriginBox(origin);
    setMorphOpen(false);
  }

  function openExpand() {
    const el = badgeRef.current;
    if (!el || morphMounted) return;
    lightTap();
    const origin = readRect(el);
    const target = expandedTarget(origin, rowCount);
    originRef.current = origin;
    morphGenRef.current += 1;
    setOriginBox(origin);
    setTargetBox(target);
    setMorphMounted(true);
    setMorphOpen(false);
  }

  function onMorphTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    // 只认 width，避免 height/background 多次 end 抢跑卸层
    if (e.propertyName !== "width") return;
    if (morphOpenRef.current) return;
    setMorphMounted(false);
    setOriginBox(null);
    setTargetBox(null);
    originRef.current = null;
  }

  useEffect(() => {
    if (!morphMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeExpand();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [morphMounted]); // eslint-disable-line react-hooks/exhaustive-deps -- closeExpand closes over latest origin

  useLayoutEffect(() => {
    if (!morphMounted || morphOpenRef.current || !originBox || !targetBox) return;
    const gen = morphGenRef.current;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (gen !== morphGenRef.current) return;
        setMorphOpen(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [morphMounted]); // eslint-disable-line react-hooks/exhaustive-deps -- kick once per morph mount

  if (!weather) return null;

  const kind = weatherIconKind(weather);
  const label = KIND_LABEL[kind];
  const temp = Math.round(weather.tempC);

  const toggle = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation();
    if (morphMounted) {
      closeExpand();
      return;
    }
    openExpand();
  };

  const liveBox = morphOpen && targetBox ? targetBox : (originBox ?? targetBox);

  return (
    <>
      <button
        ref={badgeRef}
        type="button"
        className={[
          "lyra-mobile-weather-badge",
          morphMounted ? "lyra-mobile-weather-badge--morphing" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="weather-badge"
        aria-label={morphOpen ? `收起天气 ${label} ${temp}°` : `展开天气 ${label} ${temp}°`}
        aria-expanded={morphOpen}
        aria-controls={panelId}
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="lyra-mobile-weather-badge__icon" aria-hidden>
          <WeatherKindIcon kind={kind} />
        </span>
        <span className="lyra-mobile-weather-badge__temp" aria-hidden>
          {temp}°
        </span>
      </button>

      {morphMounted &&
        liveBox &&
        createPortal(
          <div
            className={[
              "lyra-mobile-weather-morph",
              morphOpen ? "lyra-mobile-weather-morph--open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid="weather-sheet"
          >
            <div
              className="lyra-mobile-weather-morph__backdrop"
              role="button"
              tabIndex={-1}
              aria-label="关闭天气详情"
              data-testid="weather-scrim"
              onClick={(e) => {
                e.stopPropagation();
                closeExpand();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <div
              id={panelId}
              className="lyra-mobile-weather-morph__card"
              style={boxStyle(liveBox)}
              data-testid="weather-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`天气详情 ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                closeExpand();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onTransitionEnd={onMorphTransitionEnd}
            >
              <div className="lyra-mobile-weather-morph__face">
                <div className="lyra-mobile-weather-morph__head">
                  <span className="lyra-mobile-weather-badge__icon" aria-hidden>
                    <WeatherKindIcon kind={kind} />
                  </span>
                  <span className="lyra-mobile-weather-badge__temp" aria-hidden>
                    {temp}°
                  </span>
                </div>
                <div className="lyra-mobile-weather-morph__body">
                  <p className="lyra-mobile-weather-panel__condition">{label}</p>
                  {rows.length > 0 ? (
                    <ul className="lyra-mobile-weather-panel__list">
                      {rows.map((row) => (
                        <li key={row.key} className="lyra-mobile-weather-panel__row">
                          <span className="lyra-mobile-weather-panel__row-icon" aria-hidden>
                            {row.icon}
                          </span>
                          <span className="lyra-mobile-weather-panel__row-label">{row.label}</span>
                          <span className="lyra-mobile-weather-panel__row-value">{row.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="lyra-mobile-weather-panel__empty">只有温度和天气概况</p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
