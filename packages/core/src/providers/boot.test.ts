import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSecretMock = vi.fn();

vi.mock("./resolveSecret", () => ({
  resolveSecret: (...args: unknown[]) => resolveSecretMock(...args),
}));

const registerMock = vi.fn();
vi.mock("./registry", () => ({
  registry: { register: (...args: unknown[]) => registerMock(...args) },
}));

import { bootProviders } from "./boot";

beforeEach(() => {
  resolveSecretMock.mockReset();
  registerMock.mockReset();
});

describe("bootProviders", () => {
  it("registers only anthropic when only its key is present", async () => {
    resolveSecretMock.mockImplementation((key: string) =>
      key === "provider.anthropic.apiKey"
        ? Promise.resolve("sk-ant-123")
        : Promise.resolve(null),
    );

    const report = await bootProviders();

    expect(report.registered).toEqual(["anthropic"]);
    expect(report.skipped).toEqual([
      { id: "deepseek", reason: "no-key" },
      { id: "zhipu", reason: "no-key" },
    ]);
    expect(registerMock).toHaveBeenCalledOnce();
    expect(registerMock.mock.calls[0][0].id).toBe("anthropic");
  });

  it("registers all three providers when all keys are present", async () => {
    resolveSecretMock.mockImplementation((key: string) => {
      if (key === "provider.anthropic.apiKey") return Promise.resolve("sk-ant-abc");
      if (key === "provider.deepseek.apiKey") return Promise.resolve("ds-xyz");
      if (key === "provider.zhipu.apiKey") return Promise.resolve("zp-abc");
      return Promise.resolve(null);
    });

    const report = await bootProviders();

    expect(report.registered).toEqual(["anthropic", "deepseek", "zhipu"]);
    expect(report.skipped).toEqual([]);
    expect(registerMock).toHaveBeenCalledTimes(3);
  });

  it("returns empty registered when no keys exist", async () => {
    resolveSecretMock.mockResolvedValue(null);

    const report = await bootProviders();

    expect(report.registered).toEqual([]);
    expect(report.skipped).toHaveLength(3);
    expect(registerMock).not.toHaveBeenCalled();
  });
});
