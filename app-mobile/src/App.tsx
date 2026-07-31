import { useEffect, useState } from "react";
import { setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { bootProviders } from "@lyra/core/providers/boot";
import { createDefaultOrchestrator } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { MobileHomeView } from "./home/MobileHomeView";
import "./home/mobile.css";

export function App() {
  const [ready, setReady] = useState(false);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);

  useEffect(() => {
    try {
      setLyraPlatform(createIosPlatform());
      void bootProviders().then((report) => {
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
      <div className="lyra-mobile-stage lyra-mobile-stage--centered">
        <div className="lyra-mobile-idle-slogan">Lyra 在醒来的路上…</div>
      </div>
    );
  }

  if (!orchestrator) {
    return (
      <div className="lyra-mobile-stage lyra-mobile-stage--centered">
        <div className="lyra-mobile-idle-slogan">Lyra 还没准备好</div>
      </div>
    );
  }

  return <MobileHomeView orchestrator={orchestrator} />;
}
