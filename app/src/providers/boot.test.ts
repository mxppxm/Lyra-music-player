import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock secrets before importing boot
const getSecretMock = vi.fn();
vi.mock("../settings/secrets", () => ({
  SECRET_KEYS: {
    anthropicApiKey: "provider.anthropic.apiKey",
    deepseekApiKey: "provider.deepseek.apiKey",
  },
  getSecret: (...args: unknown[]) => getSecretMock(...args),
}));

// Mock registry so we can inspect register calls
const registerMock = vi.fn();
vi.mock("./registry", () => ({
  registry: { register: (...args: unknown[]) => registerMock(...args) },
}));

import { bootProviders } from "./boot";

beforeEach(() => {
  getSecretMock.mockReset();
  registerMock.mockReset();
});

describe("bootProviders", () => {
  it("registers anthropic when only its key is present; skips deepseek as no-key", async () => {
    getSecretMock.mockImplementation((key: string) =>
      key === "provider.anthropic.apiKey"
        ? Promise.resolve("sk-ant-123")
        : Promise.resolve(null),
    );

    const report = await bootProviders();

    expect(report.registered).toEqual(["anthropic"]);
    expect(report.skipped).toEqual([{ id: "deepseek", reason: "no-key" }]);
    expect(registerMock).toHaveBeenCalledOnce();
    expect(registerMock.mock.calls[0][0].id).toBe("anthropic");
  });

  it("registers deepseek when only its key is present; skips anthropic as no-key", async () => {
    getSecretMock.mockImplementation((key: string) =>
      key === "provider.deepseek.apiKey"
        ? Promise.resolve("ds-key-456")
        : Promise.resolve(null),
    );

    const report = await bootProviders();

    expect(report.registered).toEqual(["deepseek"]);
    expect(report.skipped).toEqual([{ id: "anthropic", reason: "no-key" }]);
    expect(registerMock).toHaveBeenCalledOnce();
    expect(registerMock.mock.calls[0][0].id).toBe("deepseek");
  });

  it("registers both providers when both keys are present", async () => {
    getSecretMock.mockImplementation((key: string) => {
      if (key === "provider.anthropic.apiKey") return Promise.resolve("sk-ant-abc");
      if (key === "provider.deepseek.apiKey") return Promise.resolve("ds-xyz");
      return Promise.resolve(null);
    });

    const report = await bootProviders();

    expect(report.registered).toEqual(["anthropic", "deepseek"]);
    expect(report.skipped).toEqual([]);
    expect(registerMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty registered + both skipped as no-key when neither key exists", async () => {
    getSecretMock.mockResolvedValue(null);

    const report = await bootProviders();

    expect(report.registered).toEqual([]);
    expect(report.skipped).toEqual([
      { id: "anthropic", reason: "no-key" },
      { id: "deepseek", reason: "no-key" },
    ]);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("reports keychain-error when getSecret rejects (distinguishable from no-key)", async () => {
    getSecretMock.mockImplementation((key: string) => {
      if (key === "provider.anthropic.apiKey") {
        return Promise.reject(new Error("keychain locked"));
      }
      return Promise.resolve("ds-xyz");
    });

    const report = await bootProviders();

    expect(report.registered).toEqual(["deepseek"]);
    expect(report.skipped).toEqual([
      { id: "anthropic", reason: "keychain-error" },
    ]);
  });
});
