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
  it("registers anthropic when key is present", async () => {
    getSecretMock.mockImplementation((key: string) =>
      key === "provider.anthropic.apiKey" ? Promise.resolve("sk-ant-123") : Promise.resolve(null)
    );

    const report = await bootProviders();

    expect(report.anthropic).toBe(true);
    expect(report.deepseek).toBe(false);
    expect(registerMock).toHaveBeenCalledOnce();
    expect(registerMock.mock.calls[0][0].id).toBe("anthropic");
  });

  it("registers deepseek when key is present", async () => {
    getSecretMock.mockImplementation((key: string) =>
      key === "provider.deepseek.apiKey" ? Promise.resolve("ds-key-456") : Promise.resolve(null)
    );

    const report = await bootProviders();

    expect(report.anthropic).toBe(false);
    expect(report.deepseek).toBe(true);
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

    expect(report.anthropic).toBe(true);
    expect(report.deepseek).toBe(true);
    expect(registerMock).toHaveBeenCalledTimes(2);
  });

  it("registers no providers and returns false/false when both keys are absent", async () => {
    getSecretMock.mockResolvedValue(null);

    const report = await bootProviders();

    expect(report.anthropic).toBe(false);
    expect(report.deepseek).toBe(false);
    expect(registerMock).not.toHaveBeenCalled();
  });
});
