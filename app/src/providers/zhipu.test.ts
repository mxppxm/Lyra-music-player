import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZhipuProvider } from "./zhipu";

describe("ZhipuProvider", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("id is 'zhipu'", () => {
    expect(new ZhipuProvider({ apiKey: "x" }).id).toBe("zhipu");
  });

  it("posts to open.bigmodel.cn /api/paas/v4/chat/completions with Bearer auth", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "你好" } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    });
    const p = new ZhipuProvider({ apiKey: "sk-zp" });
    const res = await p.chat([{ role: "user", content: "hi" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect((init as any).headers["authorization"]).toBe("Bearer sk-zp");
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe("glm-5.1");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);

    expect(res.content).toBe("你好");
    expect(res.usage).toEqual({ input_tokens: 5, output_tokens: 2 });
  });

  it("preserves system role inline in messages (Zhipu uses OpenAI-compat)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    const p = new ZhipuProvider({ apiKey: "x" });
    await p.chat([
      { role: "system", content: "你是 Lyra" },
      { role: "user", content: "hi" },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.messages).toEqual([
      { role: "system", content: "你是 Lyra" },
      { role: "user", content: "hi" },
    ]);
  });

  it("forwards response_format when caller requests JSON mode", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }),
    });
    const p = new ZhipuProvider({ apiKey: "x" });
    await p.chat([{ role: "user", content: "hi" }], {
      response_format: { type: "json_object" },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("omits response_format when caller does not set it", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    const p = new ZhipuProvider({ apiKey: "x" });
    await p.chat([{ role: "user", content: "hi" }]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.response_format).toBeUndefined();
  });

  it("throws on non-ok status with body text and status code", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "invalid api key",
    });
    const p = new ZhipuProvider({ apiKey: "bad" });
    await expect(p.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/401/);
  });
});
