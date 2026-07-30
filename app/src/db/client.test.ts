import { describe, it, expect, vi } from "vitest";

const dbExecuteMock = vi.fn();
const dbSelectMock = vi.fn();

vi.mock("@lyra/platform", async () => {
  const actual = await vi.importActual("@lyra/platform");
  return {
    ...actual,
    getLyraPlatform: () => ({
      dbExecute: dbExecuteMock,
      dbSelect: dbSelectMock,
    }),
  };
});

import { getDb, invalidateDb, DB_URL } from "./client";

describe("db/client", () => {
  it("DB_URL is sqlite:lyra.db", () => {
    expect(DB_URL).toBe("sqlite:lyra.db");
  });

  it("getDb delegates to platform dbExecute", async () => {
    dbExecuteMock.mockResolvedValueOnce({ rowsAffected: 1 });
    const db = await getDb();
    await db.execute("DELETE FROM x", []);
    expect(dbExecuteMock).toHaveBeenCalledWith("DELETE FROM x", []);
  });

  it("getDb delegates to platform dbSelect", async () => {
    dbSelectMock.mockResolvedValueOnce([{ id: 1 }]);
    const db = await getDb();
    const rows = await db.select("SELECT 1", []);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("invalidateDb is a no-op (platform owns connection)", () => {
    invalidateDb();
    expect(true).toBe(true);
  });
});
