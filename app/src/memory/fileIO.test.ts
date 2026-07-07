import { describe, it, expect, vi, beforeEach } from "vitest";
import { readMemoryFile, writeMemoryFile } from "./fileIO";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

beforeEach(() => {
  (invoke as ReturnType<typeof vi.fn>).mockReset();
});

describe("readMemoryFile", () => {
  it("invokes memory_file_read and returns the string", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue("# Lyra Memory\n");
    const result = await readMemoryFile();
    expect(invoke).toHaveBeenCalledWith("memory_file_read");
    expect(result).toBe("# Lyra Memory\n");
  });

  it("returns empty string when Rust returns empty string", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue("");
    const result = await readMemoryFile();
    expect(result).toBe("");
  });
});

describe("writeMemoryFile", () => {
  it("invokes memory_file_write with the content", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await writeMemoryFile("hello");
    expect(invoke).toHaveBeenCalledWith("memory_file_write", { content: "hello" });
  });
});
