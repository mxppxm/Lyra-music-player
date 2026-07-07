import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMemoryFilePath } from "./path";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("memory/path", () => {
  it("returns app_data_dir + /memory.md", async () => {
    invokeMock.mockResolvedValueOnce("/Users/test/Library/Application Support/com.lyra.app");
    const result = await getMemoryFilePath();
    expect(invokeMock).toHaveBeenCalledWith("app_data_dir");
    expect(result).toBe("/Users/test/Library/Application Support/com.lyra.app/memory.md");
  });

  it("propagates errors from Rust command", async () => {
    invokeMock.mockRejectedValueOnce("path error");
    await expect(getMemoryFilePath()).rejects.toBe("path error");
  });
});
