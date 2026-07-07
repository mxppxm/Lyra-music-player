import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./App.css";
import { Settings } from "./settings/Settings";
import { HomeView } from "./home/HomeView";
import { bootProviders } from "./providers/boot";
import { createDefaultOrchestrator } from "./turn/createOrchestrator";
import type { Orchestrator } from "./turn/Orchestrator";
import { bindGlobalKeys } from "./home/keyboard";
import { reflectNow } from "./reflect/trigger";
import { readMemoryFile } from "./memory/fileIO";
import { parseMemoryMd, EMPTY_MEMORY } from "./memory/parser";
import { setMemoryContext } from "./memory/context";
import { onSongComplete } from "./audio/player";
import { DreamScheduler } from "./schedule/dreamScheduler";
import { SECRET_KEYS, getSecret } from "./settings/secrets";
import { ProactiveEngine } from "./proactive/engine";
import { createSulkStore } from "./proactive/sulkStore";
import { morningRule, careRule, anniversaryRule, shareRule, rhythmRule } from "./proactive/rules";
import type { PolitenessState } from "./proactive/types";
import { bus as perceptionBus } from "./perception/events";
import { installPerceptionListeners } from "./perception/install";
import { aggregate as aggregatePerception } from "./perception/aggregator";
import { PerceptionAgent } from "./perception/PerceptionAgent";

async function bootMemory(): Promise<void> {
  try {
    const content = await readMemoryFile();
    const parsed = parseMemoryMd(content);
    setMemoryContext(parsed);
  } catch {
    setMemoryContext(EMPTY_MEMORY);
  }
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const schedulerRef = useRef<DreamScheduler | null>(null);
  const sulkStoreRef = useRef(createSulkStore());
  const politenessStateRef = useRef<PolitenessState>({
    todayProactiveCount: 0,
    todayKindCount: {},
    lastKindFireAt: {},
    sulkUntil: null,
    isFocusOrSleep: () => false,
    isPlayingOtherSource: () => false,
  });
  const proactiveEngineRef = useRef<ProactiveEngine | null>(null);
  const todayFirstOpenRef = useRef(true);

  useEffect(() => {
    bootProviders()
      .catch(() => {})
      .then(() => bootMemory())
      .catch(() => {})
      .then(async () => {
        // Load scheduler config from keychain, fall back to defaults
        const [dt, dim] = await Promise.all([
          getSecret(SECRET_KEYS.dreamDailyTime).catch(() => null),
          getSecret(SECRET_KEYS.dreamIdleMinutes).catch(() => null),
        ]);
        const dailyTimeHHMM = dt ?? "03:14";
        const idleMinutes = dim !== null ? (Number(dim) || 0) : 30;
        const sched = new DreamScheduler({
          dailyTimeHHMM,
          idleMinutes,
          runReflect: () => reflectNow().then(() => undefined),
        });
        schedulerRef.current = sched;
        sched.start();
      })
      .catch(() => {})
      .finally(() => setBootDone(true));

    return () => {
      schedulerRef.current?.stop();
      schedulerRef.current = null;
    };
  }, []);

  const handleSchedulerUpdate = useCallback((dailyTime: string, idleMinutes: number) => {
    schedulerRef.current?.stop();
    const sched = new DreamScheduler({
      dailyTimeHHMM: dailyTime,
      idleMinutes,
      runReflect: () => reflectNow().then(() => undefined),
    });
    schedulerRef.current = sched;
    sched.start();
  }, []);

  // Re-evaluate after bootProviders completes so the orchestrator sees registered providers
  const orchestrator: Orchestrator | null = useMemo(
    () => (bootDone ? createDefaultOrchestrator() : null),
    [bootDone],
  );

  // Construct ProactiveEngine once orchestrator is ready
  useEffect(() => {
    if (!orchestrator) return;

    const engine = new ProactiveEngine({
      rules: [morningRule, careRule, anniversaryRule, shareRule, rhythmRule],
      politenessState: politenessStateRef.current,
      sulkStore: sulkStoreRef.current,
      fulfill: async (intent) => {
        // v0.2: ask orchestrator to pick a song via its internal logic
        // For now, emit proactive-pending with a placeholder — real
        // LibraryAgent/CompanionAgent wiring is T3's job.
        console.debug("[lyra] proactive fulfill intent:", intent);
        // Minimal: just log for now; T3 will add full song selection.
      },
    });
    proactiveEngineRef.current = engine;

    // Tick once after boot (in case app opened fresh this morning)
    void engine.tick({
      now: new Date(),
      lastAppOpenAt: null,
      todayFirstOpen: todayFirstOpenRef.current,
      sharedMemories: [],
      dreamSeeds: [],
      todayKindCount: { ...politenessStateRef.current.todayKindCount },
    });
    todayFirstOpenRef.current = false;
  }, [orchestrator]);

  // Tick on window focus
  useEffect(() => {
    const handleFocus = () => {
      const engine = proactiveEngineRef.current;
      if (!engine) return;
      void engine.tick({
        now: new Date(),
        lastAppOpenAt: null,
        todayFirstOpen: todayFirstOpenRef.current,
        sharedMemories: [],
        dreamSeeds: [],
        todayKindCount: { ...politenessStateRef.current.todayKindCount },
      });
      todayFirstOpenRef.current = false;
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleReflectNow = useCallback(() => {
    if (reflecting) return;
    setReflecting(true);
    reflectNow().finally(() => setReflecting(false));
  }, [reflecting]);

  useEffect(() => {
    return bindGlobalKeys({
      onTogglePlayback: () => {},
      onOpenSettings: () => setSettingsOpen(true),
      onReflectNow: handleReflectNow,
    });
  }, [handleReflectNow]);

  // Subscribe to Rust's audio-complete event so the orchestrator can
  // finalise the ended turn and continue to the next song. Rust only emits
  // this for NATURAL completions (not for stop() or superseded playbacks),
  // so the handler doesn't need to guard against "was this stopped?".
  useEffect(() => {
    if (!orchestrator) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onSongComplete(() => {
      if (!orchestrator) return;
      // Fire and forget — the orchestrator handles its own errors.
      void orchestrator.onSongComplete();
    })
      .then((off) => {
        if (cancelled) off();
        else unlisten = off;
      })
      .catch((err) => {
        console.warn("[lyra] failed to subscribe to audio-complete:", err);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [orchestrator]);

  // Perception loop: install window listeners, tick every 60s to infer a
  // PerceptionBias from the rolling event window, and push the latest bias
  // to the Orchestrator. Respects SECRET_KEYS.perceptionEnabled (default ON).
  useEffect(() => {
    if (!orchestrator) return;
    let cancelled = false;
    let uninstallListeners: (() => void) | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const stored = await getSecret(SECRET_KEYS.perceptionEnabled).catch(() => null);
      const enabled = stored !== "false";
      if (!enabled || cancelled) return;

      uninstallListeners = installPerceptionListeners(perceptionBus);
      const agent = new PerceptionAgent();

      const tick = () => {
        try {
          const features = aggregatePerception(perceptionBus);
          const bias = agent.infer(features);
          orchestrator.setPerceptionBias(bias.confidence > 0 ? bias : null);
          if (bias.confidence > 0) {
            console.debug("[lyra] perception bias:", bias);
          }
        } catch (err) {
          console.warn("[lyra] perception tick failed:", err);
        }
      };
      // Prime once and then tick every 60s.
      tick();
      tickTimer = setInterval(tick, 60_000);
    })().catch(() => {});

    return () => {
      cancelled = true;
      uninstallListeners?.();
      if (tickTimer) clearInterval(tickTimer);
      orchestrator.setPerceptionBias(null);
    };
  }, [orchestrator]);

  return (
    <>
      {reflecting && (
        <div
          data-testid="reflecting-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <span style={{ color: "#fff", fontSize: "1.5rem" }}>Lyra is dreaming…</span>
        </div>
      )}
      <HomeView
        onOpenSettings={() => setSettingsOpen(true)}
        orchestrator={orchestrator}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} onSchedulerUpdate={handleSchedulerUpdate} />
    </>
  );
}

export default App;
