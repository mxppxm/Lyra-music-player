import { useEffect, useState } from "react";
import { setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { bootProviders } from "@lyra/core/providers/boot";
import { AudioSpike } from "./spike/AudioSpike";

export function App() {
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    try {
      setLyraPlatform(createIosPlatform());
      void bootProviders().then((report) => {
        setProviders(report.registered);
        setReady(true);
      });
    } catch (e) {
      console.error("[lyra-ios] platform init failed:", e);
    }
  }, []);

  if (!ready) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        Lyra is waking up…
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: "8px 40px", fontSize: 12, color: "#666" }}>
        providers: {providers.join(", ") || "none"}
      </div>
      <AudioSpike />
    </div>
  );
}
