import { describe, it, expect, vi } from "vitest";

const loadMock = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: (...args: unknown[]) => loadMock(...args) },
}));

import { getDb, invalidateDb, DB_URL } from "./client";

describe("db/client", () => {
  it("DB_URL is sqlite:lyra.db", () => {
    expect(DB_URL).toBe("sqlite:lyra.db");
  });

  it("getDb loads via plugin with DB_URL", async () => {
    const fake = { execute: vi.fn(), select: vi.fn() };
    loadMock.mockResolvedValueOnce(fake);
    const db = await getDb();
    expect(loadMock).toHaveBeenCalledWith("sqlite:lyra.db");
    expect(db).toBe(fake);
  });

  it("getDb memoizes the connection", async () => {
    loadMock.mockClear();
    const fake = { execute: vi.fn(), select: vi.fn() };
    loadMock.mockResolvedValue(fake);
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
    // NOTE: memoization can span tests; ensure loadMock was invoked at most once
    // in this describe execution (0 acceptable if prior test already loaded)
    expect(loadMock.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("invalidateDb clears the cached connection", async () => {
    const callsBefore = loadMock.mock.calls.length;
    invalidateDb();
    const fake = { execute: vi.fn(), select: vi.fn() };
    loadMock.mockResolvedValueOnce(fake);
    const db = await getDb();
    expect(db).toBe(fake);
    expect(loadMock.mock.calls.length).toBe(callsBefore + 1);
  });
});
