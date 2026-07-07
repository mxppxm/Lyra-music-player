import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing trigger
vi.mock("../memory/fileIO", () => ({
  readMemoryFile: vi.fn(),
  writeMemoryFile: vi.fn(),
}));

vi.mock("../db/repo/turnRepo", () => ({
  listRecentTurns: vi.fn(),
}));

vi.mock("./ReflectAgent", () => ({
  ReflectAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

vi.mock("../memory/parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../memory/parser")>();
  return {
    ...actual,
    parseMemoryMd: vi.fn(actual.parseMemoryMd),
  };
});

vi.mock("../memory/writer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../memory/writer")>();
  return {
    ...actual,
    serializeMemoryMd: vi.fn(actual.serializeMemoryMd),
  };
});

vi.mock("./apply", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./apply")>();
  return {
    ...actual,
    applyReflectResult: vi.fn(actual.applyReflectResult),
  };
});

import { readMemoryFile, writeMemoryFile } from "../memory/fileIO";
import { listRecentTurns } from "../db/repo/turnRepo";
import { ReflectAgent } from "./ReflectAgent";
import { reflectNow } from "./trigger";
import type { ReflectResult } from "./ReflectAgent";

const MOCK_RESULT: ReflectResult = {
  factMutations: [
    { op: "add", tags: ["#mood"], conclusion: "user likes jazz", startConfidence: 0.7 },
    { op: "add", tags: ["#energy"], conclusion: "user is energetic", startConfidence: 0.6 },
  ],
  livingPortrait: "A curious soul who loves music.",
  dreamNarrative: "Floating through jazz clubs.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reflectNow", () => {
  it("reads memory, parses, fetches turns, runs agent, applies, serializes, writes, returns stats", async () => {
    // Setup mocks
    (readMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue("");
    (listRecentTurns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (writeMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Make ReflectAgent.run return a known result
    const mockRun = vi.fn().mockResolvedValue(MOCK_RESULT);
    (ReflectAgent as ReturnType<typeof vi.fn>).mockImplementation(() => ({ run: mockRun }));

    const result = await reflectNow();

    // Verify pipeline steps
    expect(readMemoryFile).toHaveBeenCalledOnce();
    expect(listRecentTurns).toHaveBeenCalledWith(30);
    expect(mockRun).toHaveBeenCalledOnce();
    expect(writeMemoryFile).toHaveBeenCalledOnce();

    // Verify return value
    expect(result.appliedFacts).toBe(2);
    expect(result.dreamAdded).toBe(true);
  });

  it("passes recentTurns and parsed memory into agent.run", async () => {
    const fakeTurns = [{ id: "t1" }] as any;
    (readMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue("");
    (listRecentTurns as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTurns);
    (writeMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mockRun = vi.fn().mockResolvedValue(MOCK_RESULT);
    (ReflectAgent as ReturnType<typeof vi.fn>).mockImplementation(() => ({ run: mockRun }));

    await reflectNow();

    const callArg = mockRun.mock.calls[0][0];
    expect(callArg.recentTurns).toBe(fakeTurns);
    expect(callArg.currentMemory).toMatchObject({ facts: [] });
    expect(typeof callArg.todayISO).toBe("string");
  });

  it("writes serialized content to file", async () => {
    (readMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue("");
    (listRecentTurns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (writeMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mockRun = vi.fn().mockResolvedValue(MOCK_RESULT);
    (ReflectAgent as ReturnType<typeof vi.fn>).mockImplementation(() => ({ run: mockRun }));

    await reflectNow();

    const [writtenContent] = (writeMemoryFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(typeof writtenContent).toBe("string");
    expect(writtenContent).toContain("# Lyra Memory");
  });

  it("uses EMPTY_MEMORY when file is empty string", async () => {
    (readMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue("");
    (listRecentTurns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (writeMemoryFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mockRun = vi.fn().mockResolvedValue({ ...MOCK_RESULT, factMutations: [] });
    (ReflectAgent as ReturnType<typeof vi.fn>).mockImplementation(() => ({ run: mockRun }));

    const result = await reflectNow();
    expect(result.appliedFacts).toBe(0);
  });
});
