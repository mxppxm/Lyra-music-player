import { useEffect, useRef, useState } from "react";
import { getLyraPlatform, setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { bootProviders } from "@lyra/core/providers/boot";
import { ensureWeatherSnapshot } from "@lyra/core/perception/weather";
import { weatherZhFromCode } from "@lyra/core/recommendation/timeContext";
import type { WeatherContext } from "@lyra/core/recommendation/timeContext";
import { createDefaultOrchestrator } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { runDaily } from "@lyra/core/daily/runDaily";
import { yesterdayDayKey } from "@lyra/core/daily/dayKey";
import { MobileHomeView } from "./home/MobileHomeView";
import { AmbientBackground } from "./home/AmbientBackground";
import { seedMobileLibraryIfNeeded } from "./db/seedLibrary";
import "./home/mobile.css";

/**
 * Debug log overlay (OnScreenLog) is compiled OUT of normal builds.
 * Enable with VITE_LYRA_DEBUG_LOG=true in app-mobile/.env.production.local
 * then rebuild — see README.md "Mobile Debug Log Panel". */
const LYRA_DEBUG_LOG = import.meta.env.VITE_LYRA_DEBUG_LOG === "true";

const ZERO_PAD = { p: 0, a: 0, d: 0 };

/** How long the boot screen must hold before the home may take over, so the
 *  caption reads instead of flashing (fade-in 200→700ms, then dwell). */
const MIN_BOOT_DWELL_MS = 800;
/** Matches the --lyra-duration-exit dissolve in mobile.css. */
const BOOT_LEAVE_MS = 300;

/** Build stamp centered at bottom — easy to read in screenshots. */
function BuildStamp() {
  return (
    <div
      data-testid="build-stamp"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 6,
        fontSize: 11,
        lineHeight: 1.2,
        opacity: 0.45,
        zIndex: 50,
        pointerEvents: "none",
        fontFamily: "monospace",
        textAlign: "center",
      }}
    >
      version：{__LYRA_BUILD_TIME__}
    </div>
  );
}

function BootScreen({
  caption,
  leaving = false,
}: {
  caption: string;
  leaving?: boolean;
}) {
  return (
    <AmbientBackground
      pad={ZERO_PAD}
      className={leaving ? "lyra-mobile-ambient--boot-leaving" : undefined}
    >
      <div className="lyra-mobile-stage lyra-mobile-stage--centered">
        <div className="lyra-mobile-boot" data-testid="boot-screen">
          <div className="lyra-mobile-boot__caption">{caption}</div>
        </div>
      </div>
    </AmbientBackground>
  );
}

/** Rivets a floating translucent console onto the screen so mobile logs
 *  (no Xcode console needed) are visible in real time. */
type LogLine = { key: number; text: string; level: "log" | "warn" | "error" };

function safeString(a: unknown): string {
  if (a === null) return "null";
  if (a === undefined) return "undefined";
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    const s = JSON.stringify(a);
    return s === undefined ? String(a) : s;
  } catch {
    return String(a);
  }
}

function OnScreenLog({ lines }: { lines: LogLine[] }) {
  // Default closed — tap the tiny "日志(off)" button to reopen during
  // debugging. Toggling needs no rebuild.
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 8,
          bottom: 8,
          zIndex: 999,
          fontSize: 11,
          opacity: 0.85,
          background: "#000c",
          color: "#fff",
          border: "1px solid #555",
          borderRadius: 6,
          padding: "4px 8px",
          fontFamily: "monospace",
        }}
      >
        📜 日志(off)
      </button>
    );
  }
  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        bottom: 8,
        maxHeight: "46%",
        overflowY: "auto",
        background: "rgba(0,0,0,0.78)",
        color: "#dfe6ee",
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 1.4,
        padding: "8px 10px",
        borderRadius: 10,
        zIndex: 999,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        border: "1px solid #333",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          display: "flex",
          justifyContent: "space-between",
          background: "rgba(0,0,0,0.9)",
          paddingBottom: 4,
          fontWeight: 700,
        }}
      >
        <span>🎛 lyra 日志（点面板收起）</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
      {lines.length === 0 && <div style={{ opacity: 0.5 }}>（还没有前后台日志…）</div>}
      {lines.map((l) => (
        <div
          key={l.key}
          style={{
            color:
              l.level === "error" ? "#ff7b7b" : l.level === "warn" ? "#ffcf6b" : "#bfe3ff",
            marginBottom: 2,
          }}
        >
          {l.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);
  /** boot → leaving (home mounted beneath, boot dissolves) → home */
  const [phase, setPhase] = useState<"boot" | "leaving" | "home">("boot");
  /** 当前天气 —— 天气 tick 拉取后同时注入 orchestrator 并交给 UI 展示。 */
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  /** The single Lyra wordmark hides once a playback session starts. */
  const [brandHidden, setBrandHidden] = useState(false);
  const bootMountedAtRef = useRef(0);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const logKeyRef = useRef(0);

  // Capture console output on-screen so real-device logs need no Xcode.
  // Only active in debug builds (VITE_LYRA_DEBUG_LOG=true) — production
  // builds skip both the interception and the overlay entirely.
  useEffect(() => {
    if (!LYRA_DEBUG_LOG) return;
    const orig = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    const bump = (kind: "log" | "warn" | "error") => {
      (console as any)[kind] = (...args: unknown[]) => {
        orig[kind](...args);
        const text = args
          .map((a) => (typeof a === "string" ? a : safeString(a)))
          .join(" ");
        if (!/\[lyra/i.test(text)) return; // only surface Lyra diagnostics
        const key = logKeyRef.current++;
        const line: LogLine = { key, text, level: kind };
        setLogLines((prevLines) => {
          const next = prevLines.concat(line);
          return next.length > 200 ? next.slice(next.length - 200) : next;
        });
      };
    };
    bump("log");
    bump("warn");
    bump("error");
    return () => {
      console.log = orig.log as any;
      console.warn = orig.warn as any;
      console.error = orig.error as any;
    };
  }, []);

  useEffect(() => {
    bootMountedAtRef.current = performance.now();
    try {
      setLyraPlatform(createIosPlatform());
      void getLyraPlatform()
        .copyBundledDbIfNeeded()
        .catch((e) => console.warn("[lyra-ios] db copy:", e))
        .then(() => getLyraPlatform().ensureMigrations())
        .catch((e) => console.warn("[lyra-ios] migrations:", e))
        .then(() => seedMobileLibraryIfNeeded())
        .catch((e) => console.warn("[lyra-ios] library seed:", e))
        .then(() => bootProviders())
        .then((report) => {
          console.log("[lyra-ios] providers registered:", report.registered);
          console.log("[lyra-ios] providers skipped:", report.skipped);
          const orch = createDefaultOrchestrator();
          setOrchestrator(orch);
          setReady(true);
          // Cold-start补跑昨天日报（已有则跳过）；旁路，不影响开播。
          void runDaily({ dayKey: yesterdayDayKey() }).catch((e) =>
            console.warn("[lyra-ios] runDaily:", e),
          );
        });
    } catch (e) {
      console.error("[lyra-ios] platform init failed:", e);
    }
  }, []);

  // Hold the boot screen for a readable minimum before handing over, so the
  // caption is never flashed; the boot layer then dissolves over the freshly
  // mounted home (see .lyra-mobile-ambient--boot-leaving in mobile.css).
  useEffect(() => {
    if (!ready || !orchestrator) return;
    const wait = Math.max(
      0,
      MIN_BOOT_DWELL_MS - (performance.now() - bootMountedAtRef.current),
    );
    let clearLeave: (() => void) | undefined;
    const t = window.setTimeout(() => {
      setPhase("leaving");
      const t2 = window.setTimeout(() => setPhase("home"), BOOT_LEAVE_MS);
      clearLeave = () => window.clearTimeout(t2);
    }, wait);
    return () => {
      window.clearTimeout(t);
      clearLeave?.();
    };
  }, [ready, orchestrator]);

  // The wordmark is one always-mounted element (see the brand layer below),
  // so mirror the old in-home hidden state from the turn kind instead of
  // rendering a second mark inside the home.
  useEffect(() => {
    if (!orchestrator) return;
    setBrandHidden(orchestrator.getState().kind !== "idle");
    return orchestrator.subscribe((s) => setBrandHidden(s.kind !== "idle"));
  }, [orchestrator]);

  // 天气 tick —— 复用 @lyra/core 的 Open-Meteo 拉取（内置 45min 缓存），
  // 周期把天气注入 orchestrator，让推荐打分与伪目标文案感知天气。
  // 定位走 WKWebView 的 navigator.geolocation（Info.plist 已声明权限）；
  // 授权失败时静默降级（返回 null，不打扰）。
  useEffect(() => {
    if (!orchestrator) return;
    let cancelled = false;
    const pushWeather = async () => {
      try {
        const snap = await ensureWeatherSnapshot({ enabled: true });
        if (cancelled || !snap) return;
        const wx: WeatherContext = {
          condition: weatherZhFromCode(snap.weatherCode),
          tempC: snap.temperatureC,
          source: "api",
          code: snap.weatherCode,
        };
        orchestrator.setWeatherContext(wx);
        setWeather(wx);
        console.log(
          `[lyra-ios] weather: code=${snap.weatherCode} temp=${snap.temperatureC}°C source=${snap.source}`,
        );
      } catch (err) {
        console.warn("[lyra-ios] weather tick failed:", err);
      }
    };
    void pushWeather();
    const t = window.setInterval(pushWeather, 45 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [orchestrator]);

  const bootShown = phase !== "home";

  return (
    <>
      {phase !== "boot" && orchestrator && (
        <MobileHomeView orchestrator={orchestrator} weather={weather} />
      )}
      {bootShown && (
        <BootScreen
          caption={ready && !orchestrator ? "还没准备好" : "在醒来的路上"}
          leaving={phase === "leaving"}
        />
      )}
      <div className="lyra-mobile-brand-layer" aria-hidden="true">
        <div
          className={[
            "lyra-mobile-brand",
            brandHidden ? "lyra-mobile-brand--hidden" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Lyra
        </div>
      </div>
      <BuildStamp />
      {LYRA_DEBUG_LOG && <OnScreenLog lines={logLines} />}
    </>
  );
}
