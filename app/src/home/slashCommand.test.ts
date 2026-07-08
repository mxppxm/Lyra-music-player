import { describe, it, expect } from "vitest";
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
});
