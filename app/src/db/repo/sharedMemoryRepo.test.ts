import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../client", () => ({
  getDb: () => getDbMock(),
}));

import { insertSharedMemory, listRecent } from "./sharedMemoryRepo";
import type { SalientMoment } from "../../memory/types";

const sampleMoment: SalientMoment = {
  timestampISO: "2026-07-07T02:30:00.000Z",
  songTitle: "《夜来风雨声》",
  narrative: "《夜来风雨声》完整听完，沉默正向。",
  tags: ["#时段:深夜"],
};

beforeEach(() => {
  executeMock.mockReset();
  selectMock.mockReset();
  getDbMock.mockReset();
  getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
});

describe("sharedMemoryRepo", () => {
  describe("insertSharedMemory", () => {
    it("executes INSERT INTO shared_memory with correct columns", async () => {
      executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

      await insertSharedMemory(sampleMoment, "fixed-id-001");

      expect(executeMock).toHaveBeenCalledOnce();
      const [sql, args] = executeMock.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO shared_memory/i);
      expect(sql).toMatch(/id.*timestamp.*song_id.*context.*significance/i);
      expect(args[0]).toBe("fixed-id-001");
      // timestamp is epoch ms from ISO
      expect(typeof args[1]).toBe("number");
      expect(args[2]).toBe("《夜来风雨声》");
      expect(args[3]).toBe("《夜来风雨声》完整听完，沉默正向。");
      expect(args[4]).toBe("#时段:深夜");
    });

    it("uses crypto.randomUUID when no id provided", async () => {
      executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
      await insertSharedMemory(sampleMoment);
      const [, args] = executeMock.mock.calls[0];
      expect(typeof args[0]).toBe("string");
      expect(args[0].length).toBeGreaterThan(0);
    });

    it("stores fallback significance when tags is empty", async () => {
      executeMock.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
      const momentNoTags: SalientMoment = { ...sampleMoment, tags: [] };
      await insertSharedMemory(momentNoTags, "id-2");
      const [, args] = executeMock.mock.calls[0];
      expect(args[4]).toBe("salient");
    });
  });

  describe("listRecent", () => {
    it("returns parsed SalientMoments ordered by timestamp DESC", async () => {
      const ts = new Date("2026-07-07T02:30:00.000Z").getTime();
      selectMock.mockResolvedValueOnce([
        {
          id: "id-1",
          timestamp: ts,
          song_id: "《夜来风雨声》",
          context: "《夜来风雨声》完整听完，沉默正向。",
          significance: "#时段:深夜",
        },
      ]);

      const result = await listRecent(10);

      expect(selectMock).toHaveBeenCalledOnce();
      const [sql, args] = selectMock.mock.calls[0];
      expect(sql).toMatch(/ORDER BY timestamp DESC/i);
      expect(args[0]).toBe(10);

      expect(result).toHaveLength(1);
      expect(result[0].songTitle).toBe("《夜来风雨声》");
      expect(result[0].narrative).toBe("《夜来风雨声》完整听完，沉默正向。");
      expect(result[0].tags).toEqual(["#时段:深夜"]);
    });

    it("returns empty array when no rows found", async () => {
      selectMock.mockResolvedValueOnce([]);
      const result = await listRecent(5);
      expect(result).toEqual([]);
    });
  });
});
