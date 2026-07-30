/**
 * Returns time-of-day tags for a given Date.
 *
 * Ranges (local hour):
 *   05:00–11:00 → #时段:早晨
 *   11:00–17:00 → #时段:午后
 *   17:00–22:00 → #时段:晚上
 *   22:00–05:00 → #时段:深夜
 */
export function currentTagsFor(d: Date): string[] {
  const hour = d.getHours();
  if (hour >= 5 && hour < 11) return ["#时段:早晨"];
  if (hour >= 11 && hour < 17) return ["#时段:午后"];
  if (hour >= 17 && hour < 22) return ["#时段:晚上"];
  return ["#时段:深夜"];
}
