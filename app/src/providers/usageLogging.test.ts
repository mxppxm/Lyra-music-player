import { describe, it, expect, vi } from "vitest";
import type { ModelProvider } from "../types";
import { withUsageLogging } from "./usageLogging";

function makeInner(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    id: "anthropic",
    chat: vi.fn().mockResolvedValue({
      content: "hi",
      model: "claude-opus-4-7",
      usage: { input_tokens: 12, output_tokens: 5 },
    }),
    ...overrides,
  } as ModelProvider;
}

describe("withUsageLogging", () => {
  it("preserves inner provider id and returns inner chat response verbatim", async () => {
    const inner = makeInner();
    const logger = vi.fn().mockResolvedValue(undefined);
    const wrapped = withUsageLogging(inner, logger);

    expect(wrapped.id).toBe("anthropic");
    const res = await wrapped.chat([{ role: "user", content: "hi" }]);
    expect(res.content).toBe("hi");
    expect(res.usage).toEqual({ input_tokens: 12, output_tokens: 5 });
  });

  it("logs usage with resolved model + agent from opts", async () => {
    const inner = makeInner();
    const logger = vi.fn().mockResolvedValue(undefined);
    const wrapped = withUsageLogging(inner, logger);

    await wrapped.chat([{ role: "user", content: "hi" }], {
      agent: "companion",
    });

    expect(logger).toHaveBeenCalledOnce();
    const entry = logger.mock.calls[0][0];
    expect(entry.provider).toBe("anthropic");
    expect(entry.model).toBe("claude-opus-4-7");
    expect(entry.agent).toBe("companion");
    expect(entry.input_tokens).toBe(12);
    expect(entry.output_tokens).toBe(5);
    expect(typeof entry.ts).toBe("number");
    expect(typeof entry.duration_ms).toBe("number");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("skips logging when usage is missing on the response", async () => {
    const inner = makeInner({
      chat: vi.fn().mockResolvedValue({ content: "hi" }),
    });
    const logger = vi.fn();
    const wrapped = withUsageLogging(inner, logger);

    await wrapped.chat([{ role: "user", content: "hi" }]);
    expect(logger).not.toHaveBeenCalled();
  });

  it("swallows logger failures so the chat call still succeeds", async () => {
    const inner = makeInner();
    const logger = vi.fn().mockRejectedValue(new Error("db locked"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapped = withUsageLogging(inner, logger);

    const res = await wrapped.chat([{ role: "user", content: "hi" }]);
    expect(res.content).toBe("hi");
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to opts.model then 'unknown' when response omits model", async () => {
    const inner = makeInner({
      chat: vi.fn().mockResolvedValue({
        content: "hi",
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    });
    const logger = vi.fn().mockResolvedValue(undefined);
    const wrapped = withUsageLogging(inner, logger);

    await wrapped.chat([{ role: "user", content: "hi" }], {
      model: "claude-haiku-x",
    });
    expect(logger.mock.calls[0][0].model).toBe("claude-haiku-x");

    await wrapped.chat([{ role: "user", content: "hi" }]);
    expect(logger.mock.calls[1][0].model).toBe("unknown");
  });

  it("passes embed through when the inner provider defines it", async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2]);
    const inner = makeInner({ embed });
    const wrapped = withUsageLogging(inner, vi.fn());
    expect(wrapped.embed).toBeDefined();
    const v = await wrapped.embed!("foo");
    expect(v).toEqual([0.1, 0.2]);
    expect(embed).toHaveBeenCalledWith("foo");
  });
});
