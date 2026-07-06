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

  it("exports SECRET_KEYS with anthropic/deepseek entries", () => {
    expect(SECRET_KEYS.anthropicApiKey).toBe("provider.anthropic.apiKey");
    expect(SECRET_KEYS.deepseekApiKey).toBe("provider.deepseek.apiKey");
  });
});
