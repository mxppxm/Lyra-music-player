import type { PAD } from "../lib/color";
import type { TraceStripItem } from "./TraceStrip";

export const FAKE_PAD: PAD = { p: 0.2, a: -0.1, d: 0.2 };

export const FAKE_SAMPLES: PAD[] = Array.from({ length: 20 }, (_, i) => ({
  p: Math.sin(i / 3) * 0.4 + 0.1,
  a: Math.cos(i / 5) * 0.3,
  d: 0.15,
}));

export const FAKE_TITLE = "Nuvole Bianche";
export const FAKE_ARTIST = "Ludovico Einaudi";
export const FAKE_COVER_URL: string | null = null;

export const FAKE_RATIONALE =
  "看到希望的抬起。前 20 秒克制，大提琴出现的时候不是高兴，是那种被接住的抬起。";

export const FAKE_TRACE: TraceStripItem[] = [
  { id: "turn-3", coverUrl: null },
  { id: "turn-2", coverUrl: null },
  { id: "turn-1", coverUrl: null },
];
