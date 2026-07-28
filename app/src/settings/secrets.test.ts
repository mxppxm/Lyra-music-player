import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { setSecret, getSecret, deleteSecret, SECRET_KEYS } from "./secrets";

beforeEach(() => invokeMock.mockReset());

describe("settings/secrets", () => {
  it("setSecret calls secret_set", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await setSecret("k", "v");
    expect(invokeMock).toHaveBeenCalledWith("secret_set", { key: "k", value: "v" });
  });

  it("getSecret returns null when Rust returns null", async () => {
    invokeMock.mockResolvedValueOnce(null);
    await expect(getSecret("k")).resolves.toBeNull();
  });

  it("getSecret returns string when Rust returns string", async () => {
    invokeMock.mockResolvedValueOnce("v");
    await expect(getSecret("k")).resolves.toBe("v");
  });

  it("deleteSecret calls secret_delete", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await deleteSecret("k");
    expect(invokeMock).toHaveBeenCalledWith("secret_delete", { key: "k" });
  });

  it("exports SECRET_KEYS with anthropic/deepseek/zhipu/libraryRootPath entries", () => {
    expect(SECRET_KEYS.anthropicApiKey).toBe("provider.anthropic.apiKey");
    expect(SECRET_KEYS.deepseekApiKey).toBe("provider.deepseek.apiKey");
    expect(SECRET_KEYS.zhipuApiKey).toBe("provider.zhipu.apiKey");
    expect(SECRET_KEYS.libraryRootPath).toBe("library.rootPath");
  });

  it("exports dreamDailyTime and dreamIdleMinutes keys", () => {
    expect(SECRET_KEYS.dreamDailyTime).toBe("dream.dailyTime");
    expect(SECRET_KEYS.dreamIdleMinutes).toBe("dream.idleMinutes");
  });

  it("exports perceptionEnabled key", () => {
    expect(SECRET_KEYS.perceptionEnabled).toBe("perception.enabled");
  });

  it("exports weather perception keys", () => {
    expect(SECRET_KEYS.weatherEnabled).toBe("perception.weatherEnabled");
    expect(SECRET_KEYS.weatherLat).toBe("perception.weatherLat");
    expect(SECRET_KEYS.weatherLon).toBe("perception.weatherLon");
  });

  it("exports embedding secret keys", () => {
    expect(SECRET_KEYS.embeddingProvider).toBe("embedding.provider");
    expect(SECRET_KEYS.zhipuEmbeddingApiKey).toBe("embedding.zhipu.apiKey");
    expect(SECRET_KEYS.openaiApiKey).toBe("embedding.openai.apiKey");
  });
});
