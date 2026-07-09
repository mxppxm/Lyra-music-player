export type WeekWindow = {
  /** ISO string, inclusive lower bound (7 days before end) */
  start: string;
  /** ISO string, inclusive upper bound (usually now()) */
  end: string;
  /** "YYYY-Www" — informational, not used as key */
  iso_week: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function rolling7dWindow(now: Date): WeekWindow {
  const end = new Date(now.getTime());
  const start = new Date(now.getTime() - 7 * DAY_MS);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    iso_week: isoWeekLabel(end),
  };
}

// ISO-8601 week number label ("YYYY-Www"). Ceremony because JS lacks native
// week-of-year, but the label is display-only so we don't need to be exact
// to the Monday-start convention — nearest-day is fine.
function isoWeekLabel(d: Date): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / DAY_MS -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function filenameFor(window: WeekWindow): string {
  const s = window.start.slice(0, 10);
  const e = window.end.slice(0, 10);
  return `${s}_to_${e}.html`;
}

export async function resolveWeeklyDir(
  dirOverride: string | null,
  joiner: (a: string, b: string) => Promise<string>,
  appDataDir: () => Promise<string>,
): Promise<string> {
  if (typeof dirOverride === "string" && dirOverride.trim().length > 0) {
    return dirOverride;
  }
  const base = await appDataDir();
  return joiner(base, "weeklies");
}
