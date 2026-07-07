import { describe, it, expect, vi, beforeEach } from "vitest";

const readMemoryFileMock = vi.fn();
const writeMemoryFileMock = vi.fn();

vi.mock("./fileIO", () => ({
  readMemoryFile: () => readMemoryFileMock(),
  writeMemoryFile: (content: string) => writeMemoryFileMock(content),
}));

import { appendSalientMomentToMemoryMd } from "./appendSalient";
import type { SalientMoment } from "./types";

const sampleMoment: SalientMoment = {
  timestampISO: "2026-07-07T02:30:00.000Z",
  songTitle: "《夜来风雨声》",
  narrative: "《夜来风雨声》完整听完，沉默正向。",
  tags: ["#时段:深夜"],
};

beforeEach(() => {
  readMemoryFileMock.mockReset();
  writeMemoryFileMock.mockReset();
  writeMemoryFileMock.mockResolvedValue(undefined);
});

describe("appendSalientMomentToMemoryMd", () => {
  it("appends moment to an empty memory file", async () => {
    readMemoryFileMock.mockResolvedValueOnce("");

    await appendSalientMomentToMemoryMd(sampleMoment);

    expect(writeMemoryFileMock).toHaveBeenCalledOnce();
    const written: string = writeMemoryFileMock.mock.calls[0][0];
    expect(written).toContain("## Salient Moments");
    expect(written).toContain("2026-07-07T02:30:00.000Z");
    expect(written).toContain("《夜来风雨声》完整听完，沉默正向。");
    expect(written).toContain("#时段:深夜");
  });

  it("appends moment to existing memory preserving existing moments", async () => {
    // The parser regex matches T\d{2}:\d{2} so use that format for the existing entry
    const existing = `# Lyra Memory

## Facts (Conditional Preferences)

## Aversions

## Salient Moments
- **2026-07-06T10:00** #时段:早晨
  → 《某首歌》完整听完，沉默正向。

## Living Portrait

## Dreams

## Evolutions

## Our Songs

`;
    readMemoryFileMock.mockResolvedValueOnce(existing);

    await appendSalientMomentToMemoryMd(sampleMoment);

    expect(writeMemoryFileMock).toHaveBeenCalledOnce();
    const written: string = writeMemoryFileMock.mock.calls[0][0];
    // Both old and new should be present
    expect(written).toContain("2026-07-06T10:00");
    expect(written).toContain("2026-07-07T02:30:00.000Z");
    expect(written).toContain("《夜来风雨声》完整听完，沉默正向。");
  });

  it("gracefully handles read failure by writing fresh file with the moment", async () => {
    readMemoryFileMock.mockRejectedValueOnce(new Error("file not found"));

    await appendSalientMomentToMemoryMd(sampleMoment);

    expect(writeMemoryFileMock).toHaveBeenCalledOnce();
    const written: string = writeMemoryFileMock.mock.calls[0][0];
    expect(written).toContain("2026-07-07T02:30:00.000Z");
    expect(written).toContain("《夜来风雨声》完整听完，沉默正向。");
  });
});
