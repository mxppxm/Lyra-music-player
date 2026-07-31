import { useEffect, useState } from "react";
import { getLyraPlatform, setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { bootProviders } from "@lyra/core/providers/boot";
import { createDefaultOrchestrator } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { MobileHomeView } from "./home/MobileHomeView";
import { AmbientBackground } from "./home/AmbientBackground";
import "./home/mobile.css";

const ZERO_PAD = { p: 0, a: 0, d: 0 };

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

  if (!ready) {
    return (
      <AmbientBackground pad={ZERO_PAD}>
        <div className="lyra-mobile-stage lyra-mobile-stage--centered">
          <div className="lyra-mobile-idle-slogan">Lyra 在醒来的路上…</div>
        </div>
      </AmbientBackground>
    );
  }

  if (!orchestrator) {
    return (
      <AmbientBackground pad={ZERO_PAD}>
        <div className="lyra-mobile-stage lyra-mobile-stage--centered">
          <div className="lyra-mobile-idle-slogan">Lyra 还没准备好</div>
        </div>
      </AmbientBackground>
    );
  }

  return <MobileHomeView orchestrator={orchestrator} />;
}
