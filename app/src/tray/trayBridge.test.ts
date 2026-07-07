import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core before importing the module under test
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { setBreathing } from "./trayBridge";

describe("trayBridge.setBreathing", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("invokes tray_set_breathing with on=true", async () => {
    await setBreathing(true);
    expect(invoke).toHaveBeenCalledWith("tray_set_breathing", { on: true });
  });

  it("invokes tray_set_breathing with on=false", async () => {
    await setBreathing(false);
    expect(invoke).toHaveBeenCalledWith("tray_set_breathing", { on: false });
  });

  it("is callable multiple times (idempotency is on Rust side)", async () => {
    await setBreathing(true);
    await setBreathing(true);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
