import { describe, it, expect } from "vitest";
import { resolveZone, partitionByZone } from "./boundaryMap";

describe("resolveZone — red paths", () => {
  it("src/audio/ is red", () => {
    expect(resolveZone("src/audio/player.ts").zone).toBe("red");
  });

  it("src/security/ is red", () => {
    expect(resolveZone("src/security/keys.ts").zone).toBe("red");
  });

  it("src/engineer/ is red (cannot self-modify)", () => {
    expect(resolveZone("src/engineer/EngineerAgent.ts").zone).toBe("red");
  });

  it(".env file is red", () => {
    expect(resolveZone(".env").zone).toBe("red");
    expect(resolveZone(".env.local").zone).toBe("red");
  });

  it("config/secrets/ is red", () => {
    expect(resolveZone("config/secrets/openai.json").zone).toBe("red");
  });
});

describe("resolveZone — green paths", () => {
  it("agents/*/prompts/ is green", () => {
    expect(resolveZone("agents/companion/prompts/system.ts").zone).toBe("green");
  });

  it("themes/ is green", () => {
    expect(resolveZone("themes/dark.css").zone).toBe("green");
  });

  it("scripts/scrapers/ is green", () => {
    expect(resolveZone("scripts/scrapers/bandcamp.ts").zone).toBe("green");
  });

  it("plugins/ is green", () => {
    expect(resolveZone("plugins/lastfm/index.ts").zone).toBe("green");
  });

  it("content/ is green", () => {
    expect(resolveZone("content/release-notes.md").zone).toBe("green");
  });

  it("docs/generated/ is green", () => {
    expect(resolveZone("docs/generated/api.md").zone).toBe("green");
  });
});

describe("resolveZone — yellow paths (default)", () => {
  it("src/ui/ is yellow", () => {
    expect(resolveZone("src/ui/Button.tsx").zone).toBe("yellow");
  });

  it("src/db/ is yellow", () => {
    expect(resolveZone("src/db/repo/emotionRepo.ts").zone).toBe("yellow");
  });

  it("README.md is yellow", () => {
    expect(resolveZone("README.md").zone).toBe("yellow");
  });
});

describe("resolveZone — reason field", () => {
  it("red resolution includes a reason", () => {
    const r = resolveZone("src/audio/codec.ts");
    expect(r.reason).toBeTruthy();
    expect(r.zone).toBe("red");
  });

  it("green resolution includes a reason", () => {
    const r = resolveZone("themes/zen.css");
    expect(r.reason).toBeTruthy();
    expect(r.zone).toBe("green");
  });

  it("yellow resolution includes default reason", () => {
    const r = resolveZone("src/home/HomeView.tsx");
    expect(r.reason).toMatch(/yellow/);
  });
});

describe("partitionByZone", () => {
  it("correctly partitions a mixed list", () => {
    const paths = [
      "themes/zen.css",         // green
      "src/audio/player.ts",    // red
      "src/ui/Button.tsx",      // yellow
      "content/notes.md",       // green
      ".env",                   // red
    ];
    const { green, yellow, red } = partitionByZone(paths);
    expect(green).toContain("themes/zen.css");
    expect(green).toContain("content/notes.md");
    expect(yellow).toContain("src/ui/Button.tsx");
    expect(red).toContain("src/audio/player.ts");
    expect(red).toContain(".env");
  });

  it("returns empty arrays for an empty input", () => {
    const { green, yellow, red } = partitionByZone([]);
    expect(green).toHaveLength(0);
    expect(yellow).toHaveLength(0);
    expect(red).toHaveLength(0);
  });

  it("all-green list has no red or yellow entries", () => {
    const { red, yellow } = partitionByZone(["themes/a.css", "plugins/foo.ts"]);
    expect(red).toHaveLength(0);
    expect(yellow).toHaveLength(0);
  });

  it("all-red list has no green or yellow entries", () => {
    const { green, yellow } = partitionByZone(["src/audio/x.ts", "src/security/y.ts"]);
    expect(green).toHaveLength(0);
    expect(yellow).toHaveLength(0);
  });
});
