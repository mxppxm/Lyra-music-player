import { describe, it, expect, vi } from "vitest";
import {
  LyricsAgent,
  LyricsAgentError,
  cleanTitleForLyricsQuery,
  looksLikePartialLyrics,
} from "./LyricsAgent";
import type { ModelProvider, ChatMessage, ChatResponse } from "../types";

function stub(...responses: string[]): ModelProvider {
  let i = 0;
  return {
    id: "sensenova",
    chat: vi.fn(async (_: ChatMessage[]) => {
      const content = responses[Math.min(i, responses.length - 1)] ?? "";
      i += 1;
      return { content } as ChatResponse;
    }),
  };
}

const FULL_LYRICS = [
  "故事的小黄花",
  "从出生那年就飘着",
  "童年的荡秋千",
  "随记忆一直晃到现在",
  "Re So So Si Do Si La",
  "So La Si Si Si Si La Si La So",
  "吹着前奏望着天空",
  "我想起花瓣试着掉落",
  "为你翘课的那一天",
  "花落的那一天",
  "教室的那一间",
  "我怎么看不见",
  "消失的下雨天",
  "我好想再淋一遍",
  "没想到失去的风景",
  "习惯在回忆里看见",
].join("\n");

const CHORUS_ONLY = [
  "吹着前奏望着天空",
  "我想起花瓣试着掉落",
  "为你翘课的那一天",
  "花落的那一天",
  "吹着前奏望着天空",
  "我想起花瓣试着掉落",
  "为你翘课的那一天",
  "花落的那一天",
].join("\n");

describe("cleanTitleForLyricsQuery", () => {
  it("unwraps 《》 and strips 【】 wrappers", () => {
    expect(cleanTitleForLyricsQuery("【高音质】《晴天》周杰伦")).toBe("晴天");
    expect(cleanTitleForLyricsQuery("【翻唱】夜曲")).toBe("夜曲");
  });
});

describe("looksLikePartialLyrics", () => {
  it("flags short / chorus-repeated bodies", () => {
    expect(looksLikePartialLyrics("副歌\n啦啦啦")).toBe(true);
    expect(looksLikePartialLyrics(CHORUS_ONLY)).toBe(true);
  });

  it("accepts a fuller multi-verse body", () => {
    expect(looksLikePartialLyrics(FULL_LYRICS)).toBe(false);
  });
});

describe("LyricsAgent.fetch", () => {
  it("returns trimmed plain-text lyrics from the model", async () => {
    const agent = new LyricsAgent({ provider: stub(`\n${FULL_LYRICS}\n`) });
    await expect(
      agent.fetch({ title: "晴天", artist: "周杰伦" }),
    ).resolves.toBe(FULL_LYRICS);
  });

  it("retries when the first reply looks like chorus-only", async () => {
    const provider = stub(CHORUS_ONLY, FULL_LYRICS);
    const agent = new LyricsAgent({ provider });
    await expect(
      agent.fetch({ title: "晴天", artist: "周杰伦" }),
    ).resolves.toBe(FULL_LYRICS);
    expect(provider.chat).toHaveBeenCalledTimes(2);
    const retryMsgs = (provider.chat as ReturnType<typeof vi.fn>).mock
      .calls[1]![0] as ChatMessage[];
    expect(retryMsgs.at(-1)?.content).toMatch(/完整/);
  });

  it("throws when the model says it cannot find lyrics", async () => {
    const agent = new LyricsAgent({
      provider: stub("找不到这首歌的歌词"),
    });
    await expect(
      agent.fetch({ title: "未知曲", artist: "佚名" }),
    ).rejects.toBeInstanceOf(LyricsAgentError);
  });

  it("throws on empty / whitespace-only responses", async () => {
    const agent = new LyricsAgent({ provider: stub("   \n  ") });
    await expect(
      agent.fetch({ title: "空", artist: "空" }),
    ).rejects.toBeInstanceOf(LyricsAgentError);
  });

  it("sends a cleaned title and asks for full lyrics", async () => {
    const provider = stub(FULL_LYRICS);
    const agent = new LyricsAgent({ provider });
    await agent.fetch({ title: "【高音质】晴天", artist: "周杰伦" });
    const messages = (provider.chat as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ChatMessage[];
    expect(messages[1]!.content).toContain("歌名：晴天");
    expect(messages[1]!.content).toContain("完整歌词");
    expect(messages[1]!.content).toContain("原始标题");
  });

  it("uses 王菲 from Bilibili title, not the uploader, for 《主角》", async () => {
    const provider = stub(FULL_LYRICS);
    const agent = new LyricsAgent({ provider });
    await agent.fetch({
      title: "王菲《主角》百万豪装录音棚大声听",
      artist: "JLRS-LeoFM",
    });
    const messages = (provider.chat as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ChatMessage[];
    const user = messages[1]!.content;
    expect(user).toContain("歌名：主角");
    expect(user).toContain("原唱歌手：王菲");
    expect(user).not.toMatch(/原唱歌手：JLRS-LeoFM/);
    expect(user).toMatch(/上传者|频道/);
  });

  it("passes lyric anchor from quoted title snippet", async () => {
    const provider = stub(FULL_LYRICS);
    const agent = new LyricsAgent({ provider });
    await agent.fetch({
      title:
        "【Hi-Res无损音质】《主角》- 王菲“我站在舞台中央”百万豪装录音棚试听 大屏歌词版",
      artist: "蒸汽和弦",
    });
    const messages = (provider.chat as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ChatMessage[];
    const user = messages[1]!.content;
    expect(user).toContain("歌名：主角");
    expect(user).toContain("原唱歌手：王菲");
    expect(user).toContain("歌词锚点：我站在舞台中央");
  });
});
