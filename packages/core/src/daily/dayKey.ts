// daily/dayKey.ts — 本地日历日键 YYYY-MM-DD

/** Local calendar day key for activity / digest windows. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Yesterday's local day key. */
export function yesterdayDayKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return dayKey(d);
}

/** Local [startMs, endMs) for a day_key. */
export function dayKeyBounds(key: string): { startMs: number; endMs: number } {
  const [y, m, d] = key.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}
