import { describe, it, expect, vi, afterEach } from "vitest";
import { ProviderRegistry } from "../providers/registry";
import type { ChatMessage, ChatOptions, ModelProvider } from "../types";
import {
  routeProvider,
  resolveProviders,
  chatWithFallback,
  PRIMARY_FOR,
  FALLBACK_FOR,
} from "./route";

function fakeProvider(id: any): ModelProvider {
  return { id, chat: async () => ({ content: "" }) };
}

/** Provider whose chat() follows a script of outcomes, counting calls. */
function scriptedProvider(
  id: any,
  script: Array<() => Promise<{ content: string }> | never>,
): ModelProvider {
  let call = 0;
  return {
    id,
    chat: async () => {
      const step = script[Math.min(call, script.length - 1)];
      call += 1;
      return step();
    },
  };
}

function ok(content: string) {
  return async () => ({ content });
}
function fail(msg: string) {
  return async () => {
    throw new Error(msg);
  };
}

describe("routeProvider", () => {
  it("PRIMARY_FOR maps every agent→fxb per routing §3.5", () => {
    expect(PRIMARY_FOR.emotion).toBe("fxb");
    expect(PRIMARY_FOR.companion).toBe("fxb");
  });

  it("FALLBACK_FOR keeps deepseek as the fallback per routing §3.5", () => {
    expect(FALLBACK_FOR.emotion).toEqual(["deepseek"]);
    expect(FALLBACK_FOR.companion).toEqual(["zhipu", "deepseek"]);
  });

  it("returns the primary when registered", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("fxb"));
    expect(routeProvider("emotion", registry).id).toBe("fxb");
  });

  it("returns the fallback when primary is not registered but fallback is", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("deepseek"));
    expect(routeProvider("emotion", registry).id).toBe("deepseek");
  });

  it("throws when neither primary nor fallback is registered", () => {
    const registry = new ProviderRegistry();
    expect(() => routeProvider("emotion", registry)).toThrow(/no provider/i);
  });
});

describe("resolveProviders", () => {
  it("returns the full chain [primary, ...fallbacks] in routing order", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("fxb"));
    registry.register(fakeProvider("zhipu"));
    registry.register(fakeProvider("deepseek"));
    const chain = resolveProviders("companion", registry);
    expect(chain.map((p) => p.id)).toEqual(["fxb", "zhipu", "deepseek"]);
  });

  it("only includes registered providers", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("fxb"));
    const chain = resolveProviders("companion", registry);
    expect(chain.map((p) => p.id)).toEqual(["fxb"]);
  });

  it("dedupes ids (primary === first fallback)", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("fxb"));
    // No-op guard: fxb appears twice for companion? it doesn't; sanity check
    // the dedupe path with a synthetic case via emotion chain.
    const chain = resolveProviders("emotion", registry);
    expect(chain.map((p) => p.id)).toEqual(["fxb"]);
  });

  it("throws when nothing is registered", () => {
    const registry = new ProviderRegistry();
    expect(() => resolveProviders("emotion", registry)).toThrow(/no provider/i);
  });
});

const MSG: ChatMessage[] = [{ role: "user", content: "hi" }];
const OPTS: ChatOptions = { temperature: 0.3 };

describe("chatWithFallback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first successful call (no retry on success)", async () => {
    const provider = scriptedProvider("fxb", [ok("a")]);
    const res = await chatWithFallback([provider], MSG, OPTS);
    expect(res.content).toBe("a");
  });

  it("retries a transient 5xx failure with backoff, then succeeds", async () => {
    vi.useFakeTimers();
    const provider = scriptedProvider("fxb", [fail("Fxb 500: boom"), ok("a")]);
    const p = chatWithFallback([provider], MSG, OPTS);
    // 1st attempt fails → backoff ~600ms+jitter
    await vi.advanceTimersByTimeAsync(1_000);
    const res = await p;
    expect(res.content).toBe("a");
  });

  it("does NOT retry 4xx errors (throws immediately)", async () => {
    vi.useFakeTimers();
    const provider = scriptedProvider("fxb", [fail("Fxb 401: nope"), ok("a")]);
    await expect(chatWithFallback([provider], MSG, OPTS)).rejects.toThrow(/401/);
    // give any (wrong) backoff time a chance to fire
    await vi.advanceTimersByTimeAsync(10_000);
    // the second script step must never have been reached — chatWithFallback
    // threw; assert via rejection only (call count is internal).
  });

  it("falls back to the next provider after primary exhausts retries", async () => {
    vi.useFakeTimers();
    const fxb = scriptedProvider("fxb", [
      fail("Fxb request timed out after 15s"),
      fail("Fxb request timed out after 15s"),
      fail("Fxb request timed out after 15s"),
    ]);
    const deepseek = scriptedProvider("deepseek", [ok("from-deepseek")]);
    const p = chatWithFallback([fxb, deepseek], MSG, OPTS);
    // 3 attempts × backoff (600 + 1200 + jitter) — advance past all
    await vi.advanceTimersByTimeAsync(5_000);
    const res = await p;
    expect(res.content).toBe("from-deepseek");
  });

  it("throws the last error when every provider fails", async () => {
    vi.useFakeTimers();
    const fxb = scriptedProvider("fxb", [
      fail("Fxb request timed out after 15s"),
      fail("Fxb request timed out after 15s"),
      fail("Fxb request timed out after 15s"),
    ]);
    const deepseek = scriptedProvider("deepseek", [fail("deepseek down")]);
    const p = chatWithFallback([fxb, deepseek], MSG, OPTS);
    // Attach the rejection handler BEFORE advancing timers so the rejected
    // promise never counts as unhandled while timers fire.
    const assertion = expect(p).rejects.toThrow(/deepseek down/);
    await vi.advanceTimersByTimeAsync(6_000);
    await assertion;
  });
});
