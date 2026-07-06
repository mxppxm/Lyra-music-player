import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProvider } from "./anthropic";

describe("AnthropicProvider", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("has id 'anthropic'", () => {
    const p = new AnthropicProvider({ apiKey: "sk-x" });
    expect(p.id).toBe("anthropic");
  });

  it("posts messages to /v1/messages with x-api-key", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 3, output_tokens: 1 },
      }),
    });

    const p = new AnthropicProvider({ apiKey: "sk-abc", model: "claude-opus-4-7" });
    const res = await p.chat([
      { role: "user", content: "hello" },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init as any).method).toBe("POST");
    expect((init as any).headers["x-api-key"]).toBe("sk-abc");
    expect((init as any).headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe("claude-opus-4-7");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.max_tokens).toBeGreaterThan(0);

    expect(res.content).toBe("hi");
    expect(res.usage).toEqual({ input_tokens: 3, output_tokens: 1 });
  });

  it("throws on non-ok response with body text", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "bad key",
    });
    const p = new AnthropicProvider({ apiKey: "sk-bad" });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/401/);
  });

  it("passes system messages via top-level 'system' field", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    const p = new AnthropicProvider({ apiKey: "sk-x" });
    await p.chat([
      { role: "system", content: "you are lyra" },
      { role: "user", content: "hi" },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.system).toBe("you are lyra");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});
