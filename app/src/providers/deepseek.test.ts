import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepSeekProvider } from "./deepseek";

describe("DeepSeekProvider", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("id is 'deepseek'", () => {
    expect(new DeepSeekProvider({ apiKey: "x" }).id).toBe("deepseek");
  });

  it("posts to /v1/chat/completions with Bearer", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    });
    const p = new DeepSeekProvider({ apiKey: "sk-d" });
    const res = await p.chat([{ role: "user", content: "hello" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init as any).headers["authorization"]).toBe("Bearer sk-d");
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);

    expect(res.content).toBe("hi");
    expect(res.usage).toEqual({ input_tokens: 3, output_tokens: 1 });
  });

  it("preserves system role in the messages array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    const p = new DeepSeekProvider({ apiKey: "x" });
    await p.chat([
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
    ]);
  });

  it("throws on non-ok status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limit",
    });
    const p = new DeepSeekProvider({ apiKey: "x" });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/429/);
  });

  it("retries on 503 and succeeds", async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "busy" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: "recovered" } }] }),
        });
      const p = new DeepSeekProvider({ apiKey: "x" });
      const promise = p.chat([{ role: "user", content: "hi" }]);
      await vi.advanceTimersByTimeAsync(1000);
      const res = await promise;
      expect(res.content).toBe("recovered");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws after exhausting 503 retries", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "busy" });
      const p = new DeepSeekProvider({ apiKey: "x" });
      const promise = p.chat([{ role: "user", content: "hi" }]);
      const assertion = expect(promise).rejects.toThrow(/503/);
      await vi.advanceTimersByTimeAsync(3000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
