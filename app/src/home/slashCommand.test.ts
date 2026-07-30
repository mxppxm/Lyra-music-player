import { describe, it, expect, vi } from "vitest";

vi.mock("../config/zeroConfig", () => ({
  isZeroConfigRelease: () => false,
}));

import { parseSlashCommand } from "./slashCommand";

describe("parseSlashCommand", () => {
  it("recognises /settings", () => {
    expect(parseSlashCommand("/settings")).toEqual({ kind: "settings" });
  });

  it("recognises /stats", () => {
    expect(parseSlashCommand("/stats")).toEqual({ kind: "stats" });
  });

  it("recognises /explorer", () => {
    expect(parseSlashCommand("/explorer")).toEqual({ kind: "explorer" });
  });

  it("recognises /help", () => {
    expect(parseSlashCommand("/help")).toEqual({ kind: "help" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSlashCommand("  /settings  ")).toEqual({ kind: "settings" });
  });

  it("rejects unknown slash commands", () => {
    expect(parseSlashCommand("/quit")).toBeNull();
  });

  it("rejects tokens after the command (strict match)", () => {
    // "/settings please" is meant for Lyra, not for the UI dispatcher.
    expect(parseSlashCommand("/settings please")).toBeNull();
  });

  it("rejects plain text without slash", () => {
    expect(parseSlashCommand("settings")).toBeNull();
    expect(parseSlashCommand("show me the settings")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseSlashCommand("")).toBeNull();
    expect(parseSlashCommand("   ")).toBeNull();
  });

  it("recognizes /week", () => {
    expect(parseSlashCommand("/week")).toEqual({ kind: "week" });
  });

  it("recognizes /week with surrounding whitespace", () => {
    expect(parseSlashCommand("  /week  ")).toEqual({ kind: "week" });
  });

  it("rejects /week with trailing content", () => {
    expect(parseSlashCommand("/week now")).toBeNull();
  });

  it("rejects /weeks (extra char)", () => {
    expect(parseSlashCommand("/weeks")).toBeNull();
  });
});
