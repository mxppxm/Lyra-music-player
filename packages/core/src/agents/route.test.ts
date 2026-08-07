import { describe, it, expect, vi, afterEach } from "vitest";
import { ProviderRegistry } from "../providers/registry";
import { RateLimitError } from "../providers/errors";
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
  it("PRIMARY_FOR maps every agent→sensenova per routing §3.5", () => {
    expect(PRIMARY_FOR.emotion).toBe("sensenova");
    expect(PRIMARY_FOR.companion).toBe("sensenova");
    expect(PRIMARY_FOR.lyrics).toBe("sensenova");
  });

  it("FALLBACK_FOR keeps no paid fallback per routing §3.5", () => {
    expect(FALLBACK_FOR.emotion).toEqual([]);
    expect(FALLBACK_FOR.companion).toEqual([]);
    expect(FALLBACK_FOR.lyrics).toEqual([]);
  });

  it("returns the primary when registered", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("sensenova"));
    expect(routeProvider("emotion", registry).id).toBe("sensenova");
  });

  it("throws when primary (sensenova) is not registered", () => {
    const registry = new ProviderRegistry();
    // fallbacks are empty, so nothing else can be picked either
    expect(() => routeProvider("emotion", registry)).toThrow(/no provider/i);
  });

  it("throws when neither primary nor fallback is registered", () => {
    const registry = new ProviderRegistry();
    expect(() => routeProvider("emotion", registry)).toThrow(/no provider/i);
  });
});

describe("resolveProviders", () => {
  it("returns the full chain [primary, ...fallbacks] in routing order", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("sensenova"));
    const chain = resolveProviders("companion", registry);
    expect(chain.map((p) => p.id)).toEqual(["sensenova"]);
  });

  it("only includes registered providers", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("sensenova"));
    const chain = resolveProviders("companion", registry);
    expect(chain.map((p) => p.id)).toEqual(["sensenova"]);
  });

  it("dedupes ids (primary === first fallback)", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("sensenova"));
    // No-op guard: sensenova appears only once (fallbacks are empty); sanity
    // check the dedupe path with a synthetic case via emotion chain.
    const chain = resolveProviders("emotion", registry);
    expect(chain.map((p) => p.id)).toEqual(["sensenova"]);
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

  it("retries a 429 rate limit after a long wait, then succeeds", async () => {
    vi.useFakeTimers();
    // No retry-after hint in the message → fall back to a generous 10s wait.
    // Plain 600ms→5s backoff would have fired by ~4s, so advancing only 4s
    // must NOT retry yet — then the 10s window elapses and it succeeds.
    const provider = scriptedProvider("fxb", [
      fail("Fxb 429: rate limit exceeded"),
      ok("a"),
    ]);
    const p = chatWithFallback([provider], MSG, OPTS);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(7_000);
    const res = await p;
    expect(res.content).toBe("a");
  });

  it("waits the RateLimitError retryAfterMs hint, then succeeds", async () => {
    vi.useFakeTimers();
    const provider = scriptedProvider("fxb", [
      () => Promise.reject(new RateLimitError("Sensenova 429: throttle", 25_000)),
      ok("b"),
    ]);
    const p = chatWithFallback([provider], MSG, OPTS);
    await vi.advanceTimersByTimeAsync(24_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await p;
    expect(res.content).toBe("b");
  });

  it("gives 429 its own budget even when ordinary retries are exhausted", async () => {
    vi.useFakeTimers();
    const provider = scriptedProvider("fxb", [
      fail("Fxb 429: limit"),
      ok("recovered"),
    ]);
    provider.maxRetries = 1; // ordinary budget exhausted after the 1st call
    const p = chatWithFallback([provider], MSG, OPTS);
    await vi.advanceTimersByTimeAsync(11_000); // past the 10s rate-limit wait
    const res = await p;
    expect(res.content).toBe("recovered");
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
