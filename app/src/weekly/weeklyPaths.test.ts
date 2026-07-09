import { describe, it, expect } from "vitest";
import { rolling7dWindow, filenameFor, resolveWeeklyDir } from "./weeklyPaths";

describe("rolling7dWindow", () => {
  it("start is 7 days before end (ms exact)", () => {
    const now = new Date("2026-07-09T03:14:00Z");
    const w = rolling7dWindow(now);
    expect(w.end).toBe("2026-07-09T03:14:00.000Z");
    expect(w.start).toBe("2026-07-02T03:14:00.000Z");
  });

  it("iso_week matches YYYY-Www", () => {
    const w = rolling7dWindow(new Date("2026-07-09T00:00:00Z"));
    expect(w.iso_week).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("filenameFor", () => {
  it("formats as YYYY-MM-DD_to_YYYY-MM-DD.html", () => {
    expect(filenameFor({
      start: "2026-07-02T03:14:00.000Z",
      end:   "2026-07-09T03:14:00.000Z",
      iso_week: "2026-W28",
    })).toBe("2026-07-02_to_2026-07-09.html");
  });
});

describe("resolveWeeklyDir", () => {
  it("returns override when non-empty", async () => {
    const dir = await resolveWeeklyDir(
      "/custom/dir",
      async (a, b) => `${a}/${b}`,
      async () => "/app-data",
    );
    expect(dir).toBe("/custom/dir");
  });

  it("falls back to <appDataDir>/weeklies when override empty", async () => {
    const dir = await resolveWeeklyDir(
      null,
      async (a, b) => `${a}/${b}`,
      async () => "/app-data",
    );
    expect(dir).toBe("/app-data/weeklies");
  });

  it("treats empty string override as 'no override'", async () => {
    const dir = await resolveWeeklyDir(
      "",
      async (a, b) => `${a}/${b}`,
      async () => "/app-data",
    );
    expect(dir).toBe("/app-data/weeklies");
  });
});
