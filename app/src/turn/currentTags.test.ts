import { describe, it, expect } from "vitest";
import { currentTagsFor } from "./currentTags";

function makeDate(hour: number, minute = 0): Date {
  const d = new Date(2026, 6, 7, hour, minute, 0, 0); // 2026-07-07
  return d;
}

describe("currentTagsFor", () => {
  it("returns #时段:早晨 at 05:00", () => {
    expect(currentTagsFor(makeDate(5, 0))).toEqual(["#时段:早晨"]);
  });

  it("returns #时段:早晨 at 10:59", () => {
    expect(currentTagsFor(makeDate(10, 59))).toEqual(["#时段:早晨"]);
  });

  it("returns #时段:午后 at 11:00", () => {
    expect(currentTagsFor(makeDate(11, 0))).toEqual(["#时段:午后"]);
  });

  it("returns #时段:午后 at 16:59", () => {
    expect(currentTagsFor(makeDate(16, 59))).toEqual(["#时段:午后"]);
  });

  it("returns #时段:晚上 at 17:00", () => {
    expect(currentTagsFor(makeDate(17, 0))).toEqual(["#时段:晚上"]);
  });

  it("returns #时段:晚上 at 21:59", () => {
    expect(currentTagsFor(makeDate(21, 59))).toEqual(["#时段:晚上"]);
  });

  it("returns #时段:深夜 at 22:00", () => {
    expect(currentTagsFor(makeDate(22, 0))).toEqual(["#时段:深夜"]);
  });

  it("returns #时段:深夜 at 00:00 (midnight)", () => {
    expect(currentTagsFor(makeDate(0, 0))).toEqual(["#时段:深夜"]);
  });

  it("returns #时段:深夜 at 04:59", () => {
    expect(currentTagsFor(makeDate(4, 59))).toEqual(["#时段:深夜"]);
  });
});
