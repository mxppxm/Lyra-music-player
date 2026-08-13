import { describe, it, expect, vi } from "vitest";
import { chatWithTools } from "./chatWithTools";
import type { ChatMessage, ChatResponse, ModelProvider } from "../types";

function provider(responses: ChatResponse[]): ModelProvider {
  let i = 0;
  return {
    id: "sensenova",
    chat: vi.fn(async () => {
      const res = responses[Math.min(i, responses.length - 1)]!;
      i += 1;
      return res;
    }),
  };
}

describe("chatWithTools", () => {
  it("returns immediately when the model does not call a tool", async () => {
    const p = provider([{ content: "hello" }]);
    const res = await chatWithTools(
      [p],
      [{ role: "user", content: "hi" }],
      {},
      { web_search: async () => "unused" },
    );
    expect(res.content).toBe("hello");
    expect(p.chat).toHaveBeenCalledTimes(1);
  });

  it("executes tool_calls and feeds the result back until the model answers", async () => {
    const p = provider([
      {
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "web_search",
              arguments: JSON.stringify({ query: "晴天 周杰伦 歌词" }),
            },
          },
        ],
      },
      { content: "完整歌词正文" },
    ]);
    const web_search = vi.fn(async (args: Record<string, unknown>) => {
      expect(args.query).toBe("晴天 周杰伦 歌词");
      return "search hits";
    });

    const res = await chatWithTools(
      [p],
      [{ role: "user", content: "晴天" }],
      {},
      { web_search },
    );

    expect(res.content).toBe("完整歌词正文");
    expect(web_search).toHaveBeenCalledOnce();
    expect(p.chat).toHaveBeenCalledTimes(2);
    const secondMsgs = (p.chat as ReturnType<typeof vi.fn>).mock
      .calls[1]![0] as ChatMessage[];
    expect(secondMsgs.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call-1",
      content: "search hits",
    });
  });
});
