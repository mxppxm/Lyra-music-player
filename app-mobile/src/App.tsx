import { useEffect, useState } from "react";
import { setLyraPlatform } from "@lyra/platform";
import { createIosPlatform } from "@lyra/platform-ios";
import { AudioSpike } from "./spike/AudioSpike";

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

  return <AudioSpike />;
}
