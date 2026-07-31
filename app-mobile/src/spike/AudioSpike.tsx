import { useState } from "react";
import { getLyraPlatform } from "@lyra/platform";
import { searchBilibili, getVideoCid, getAudioUrl } from "@lyra/core/bilibili/api";

export function AudioSpike() {
  const [status, setStatus] = useState("idle");

  const testPlay = async () => {
    setStatus("searching bilibili…");
    try {
      const { tracks } = await searchBilibili("", 1);
      const t = tracks[0];
      if (!t) throw new Error("no tracks");
      setStatus(`resolving ${t.bvid}…`);
      const cid = await getVideoCid(t.bvid);
      const url = await getAudioUrl(t.bvid, cid);
      if (!url) throw new Error("no audio url");
      setStatus("playing…");
      const id = await getLyraPlatform().playUrl(url, t.duration_ms);
      setStatus(`playing id=${id} — lock your phone to test background`);
    } catch (e) {
      console.error("[spike] play failed:", e);
      setStatus(`error: ${String(e)}`);
    }
  };

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Lyra iOS Audio Spike</h1>
      <button onClick={testPlay} style={{ fontSize: 18, padding: "12px 24px" }}>
        Play first Bilibili track
      </button>
      <p style={{ marginTop: 20 }}>{status}</p>
    </div>
  );
}
