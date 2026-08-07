import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SensenovaProvider } from "./sensenova";

describe("SensenovaProvider", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("has id 'sensenova' and defaults to deepseek-v4-flash", () => {
    const p = new SensenovaProvider({ apiKey: "sn-x" });
    expect(p.id).toBe("sensenova");
    expect(p["defaultModel"]).toBe("deepseek-v4-flash");
  });

  it("posts to token.sensenova.cn with Bearer auth", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    });
    const p = new SensenovaProvider({ apiKey: "sk-sn" });
    const res = await p.chat([{ role: "user", content: "hello" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://token.sensenova.cn/v1/chat/completions");
    expect((init as any).headers["authorization"]).toBe("Bearer sk-sn");
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    // No thinking knob unless explicitly requested — CoT stays on by default
    // when the caller doesn't opt out.
    expect(body.thinking).toBeUndefined();

    expect(res.content).toBe("hi");
    expect(res.usage).toEqual({ input_tokens: 3, output_tokens: 1 });
  });

  it("maps enable_thinking=false to thinking:{type:'disabled'}", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    const p = new SensenovaProvider({ apiKey: "sn-x" });
    await p.chat([{ role: "user", content: "hi" }], { enable_thinking: false });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("does not send thinking when enable_thinking=true", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    const p = new SensenovaProvider({ apiKey: "sn-x" });
    await p.chat([{ role: "user", content: "hi" }], { enable_thinking: true });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.thinking).toBeUndefined();
  });

  it("forwards response_format and max_tokens", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }),
    });
    const p = new SensenovaProvider({ apiKey: "sn-x" });
    await p.chat([{ role: "user", content: "json" }], {
      max_tokens: 128,
      response_format: { type: "json_object" },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.max_tokens).toBe(128);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("falls back to reasoning content when content is empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          { message: { role: "assistant", content: "", reasoning: "thoughts" } },
        ],
      }),
    });
    const p = new SensenovaProvider({ apiKey: "sn-x" });
    const res = await p.chat([{ role: "user", content: "hi" }]);
    expect(res.content).toBe("thoughts");
  });

  it("throws on non-ok status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Forbidden",
    });
    const p = new SensenovaProvider({ apiKey: "sn-x" });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(
      /401/,
    );
  });

  it("throws a timeout error when aborted", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url: unknown, init: unknown) => {
      return new Promise((_, reject) => {
        (init as { signal: AbortSignal }).signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    try {
      const p = new SensenovaProvider({ apiKey: "sn-x" });
      const promise = p.chat([{ role: "user", content: "hi" }]);
      vi.advanceTimersByTime(40_001);
      await expect(promise).rejects.toThrow(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });
});
