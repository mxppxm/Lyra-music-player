import { useEffect, useRef, useState } from "react";
import { getLyraPlatform, setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { bootProviders } from "@lyra/core/providers/boot";
import { createDefaultOrchestrator } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { MobileHomeView } from "./home/MobileHomeView";
import { AmbientBackground } from "./home/AmbientBackground";
import { BreathingGlow } from "./home/BreathingGlow";
import { seedMobileLibraryIfNeeded } from "./db/seedLibrary";
import "./home/mobile.css";

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
      {__LYRA_BUILD_TIME__}
    </div>
  );
}

function BootScreen({
  caption,
  breathing = false,
  leaving = false,
}: {
  caption: string;
  breathing?: boolean;
  leaving?: boolean;
}) {
  return (
    <AmbientBackground
      pad={ZERO_PAD}
      className={leaving ? "lyra-mobile-ambient--boot-leaving" : undefined}
    >
      <div className="lyra-mobile-stage lyra-mobile-stage--centered">
        <div className="lyra-mobile-boot" data-testid="boot-screen">
          <div className="lyra-mobile-boot__brand">Lyra</div>
          <div className="lyra-mobile-boot__caption">{caption}</div>
          {breathing ? <BreathingGlow size="lg" tone="warm" /> : null}
        </div>
      </div>
    </AmbientBackground>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);
  /** boot → leaving (home mounted beneath, boot dissolves) → home */
  const [phase, setPhase] = useState<"boot" | "leaving" | "home">("boot");
  const bootMountedAtRef = useRef(0);

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

  const bootShown = phase !== "home";

  return (
    <>
      {phase !== "boot" && orchestrator && (
        <MobileHomeView orchestrator={orchestrator} />
      )}
      {bootShown && (
        <BootScreen
          caption={ready && !orchestrator ? "还没准备好" : "在醒来的路上"}
          breathing={bootShown}
          leaving={phase === "leaving"}
        />
      )}
      <BuildStamp />
    </>
  );
}
