import { useEffect, useState } from "react";
import { getLyraPlatform, setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { bootProviders } from "@lyra/core/providers/boot";
import { createDefaultOrchestrator } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { MobileHomeView } from "./home/MobileHomeView";
import { AmbientBackground } from "./home/AmbientBackground";
import { BreathingGlow } from "./home/BreathingGlow";
import "./home/mobile.css";

const ZERO_PAD = { p: 0, a: 0, d: 0 };

/** Corner stamp so any screenshot proves exactly which build is installed. */
function BuildStamp() {
  return (
    <div
      data-testid="build-stamp"
      style={{
        position: "fixed",
        right: 8,
        bottom: 4,
        fontSize: 10,
        lineHeight: 1.2,
        opacity: 0.35,
        zIndex: 50,
        pointerEvents: "none",
        fontFamily: "monospace",
      }}
    >
      {__LYRA_BUILD_TIME__}
    </div>
  );
}

function BootScreen({
  caption,
  breathing = false,
}: {
  caption: string;
  breathing?: boolean;
}) {
  return (
    <AmbientBackground pad={ZERO_PAD}>
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

  useEffect(() => {
    try {
      setLyraPlatform(createIosPlatform());
      void getLyraPlatform()
        .copyBundledDbIfNeeded()
        .catch((e) => console.warn("[lyra-ios] db copy:", e))
        .then(() => getLyraPlatform().ensureMigrations())
        .catch((e) => console.warn("[lyra-ios] migrations:", e))
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

  const content = !ready ? (
    <BootScreen caption="在醒来的路上" breathing />
  ) : !orchestrator ? (
    <BootScreen caption="还没准备好" />
  ) : (
    <MobileHomeView orchestrator={orchestrator} />
  );

  return (
    <>
      {content}
      <BuildStamp />
    </>
  );
}
