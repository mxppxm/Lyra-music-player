import { useEffect, useState } from "react";
import { setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLyraPlatform(createIosPlatform());
      setReady(true);
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
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Lyra iOS</h1>
      <p>Platform shell ready. Next: wire Orchestrator.</p>
    </div>
  );
}
