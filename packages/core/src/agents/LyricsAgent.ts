import type { ModelProvider, ChatMessage, ChatTool } from "../types";
import { parseTrackIdentity } from "../library/parseTrackIdentity";
import { resolveProviders } from "./route";
import { chatWithTools } from "./chatWithTools";
import { webSearch as defaultWebSearch } from "./webSearch";
import { webFetch as defaultWebFetch } from "./webFetch";
import {
  LYRICS_COMPLETE_RETRY_PROMPT,
  LYRICS_SYSTEM_PROMPT,
} from "./prompts/lyrics";

export class LyricsAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LyricsAgentError";
  }
}

const NOT_FOUND_RE =
  /找不到这首歌的歌词|未能找到|无法找到歌词|没有找到歌词|查不到这首|sorry[, ]?i (can'?t|cannot|couldn'?t) (find|provide).*lyric|lyrics not found|unable to (find|provide).*lyric/i;

export type LyricsFetchInput = {
  title: string;
  artist?: string;
  /** User tapped retry — allow a slower reasoning pass. Default off. */
  enableThinking?: boolean;
};

/** Strip Bilibili / channel wrappers so the LLM sees a cleaner song name. */
export function cleanTitleForLyricsQuery(title: string): string {
  const identity = parseTrackIdentity(title);
  if (identity.songTitle.trim()) return identity.songTitle.trim();
  const unwrapped = title.match(/《([^》]+)》/);
  if (unwrapped?.[1]?.trim()) return unwrapped[1].trim();
  return title
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/（[^）]*(高音质|翻唱|封面|cover|MV|live)[^）]*）/gi, " ")
    .replace(/\([^)]*(hq|mv|live|cover)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a short quoted lyric line from Bilibili titles for disambiguation. */
export function extractLyricHintFromTitle(title: string): string | undefined {
  const m = title.match(/[“"]([^”"]{4,48})[”"]/u);
  const hint = m?.[1]?.trim();
  return hint || undefined;
}

/**
 * Heuristic: first reply often dumps only the chorus (few unique lines,
 * heavy repetition, or explicit “副歌/高潮” stubs).
 */
export function looksLikePartialLyrics(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  if (lines.length < 8) return true;

  const unique = new Set(lines);
  if (unique.size <= 4) return true;
  if (unique.size < 8 && unique.size / lines.length < 0.4) return true;

  if (
    /只[有给返回了]?(副歌|高潮)|（?副歌重复）?|chorus only|hook only|\.{2,}|…{1,}/i.test(
      text,
    ) &&
    lines.length < 20
  ) {
    return true;
  }

  // Extremely short body for a "full" pop lyric.
  const compact = lines.join("");
  if (compact.length < 80) return true;

  return false;
}

function assertLyricsOrThrow(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new LyricsAgentError("empty lyrics response");
  const lineCount = trimmed.split(/\n/).filter((l) => l.trim()).length;
  if (NOT_FOUND_RE.test(trimmed) && (trimmed.length < 80 || lineCount <= 2)) {
    throw new LyricsAgentError("lyrics not found");
  }
  return trimmed;
}

const WEB_SEARCH_TOOL: ChatTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web. Returns titles, URLs, and snippets. Query with the song title, original artist, and the word 歌词. Then call web_fetch on a lyrics URL.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query, e.g. 王菲 主角 歌词",
        },
      },
      required: ["query"],
    },
  },
};

const WEB_FETCH_TOOL: ChatTool = {
  type: "function",
  function: {
    name: "web_fetch",
    description:
      "Fetch one https page and return plain text. Use after web_search to read a lyrics page.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "https URL of a lyrics page from web_search results",
        },
      },
      required: ["url"],
    },
  },
};

/**
 * Ask the LLM for plain-text lyrics of a track. Returns trimmed body text
 * or throws LyricsAgentError when the model declines / returns empty.
 * Retries once when the first answer looks like chorus-only / truncated.
 */
export class LyricsAgent {
  private providers: ModelProvider[];
  private webSearch: (query: string) => Promise<string>;
  private webFetch: (url: string) => Promise<string>;

  constructor(
    opts: {
      provider?: ModelProvider;
      webSearch?: (query: string) => Promise<string>;
      webFetch?: (url: string) => Promise<string>;
    } = {},
  ) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("lyrics");
    this.webSearch = opts.webSearch ?? defaultWebSearch;
    this.webFetch = opts.webFetch ?? defaultWebFetch;
  }

  async fetch(input: LyricsFetchInput): Promise<string> {
    const rawTitle = input.title.trim();
    const metaArtist = (input.artist ?? "").trim();
    const identity = parseTrackIdentity(rawTitle, {
      uploader: metaArtist || undefined,
    });
    const title =
      identity.songTitle.trim() ||
      cleanTitleForLyricsQuery(rawTitle) ||
      rawTitle;
    // Prefer artist parsed from the video title (王菲). Metadata artist is often
    // the Bilibili uploader on studio reposts — only trust it when title parse
    // found nothing and this does not look like a studio-cover channel row.
    const artist =
      identity.artist.trim() ||
      (metaArtist && !identity.isStudioCover ? metaArtist : "");
    const uploaderForHint =
      metaArtist && metaArtist !== artist ? metaArtist : "";
    const lyricHint = extractLyricHintFromTitle(rawTitle);

    const lines = [
      `歌名：${title}`,
      ...(artist ? [`原唱歌手：${artist}`] : []),
      ...(lyricHint ? [`歌词锚点：${lyricHint}`] : []),
      ...(uploaderForHint
        ? [`B站上传者/频道（不是歌手）：${uploaderForHint}`]
        : []),
      ...(rawTitle !== title ? [`原始标题（供参考）：${rawTitle}`] : []),
      "请返回完整歌词（主歌+副歌+桥段等全部段落），不要只返回高潮/副歌。",
      ...(lyricHint
        ? ["输出必须包含上述歌词锚点原句，据此锁定正确版本，禁止串到同名其他歌。"]
        : []),
    ];

    const messages: ChatMessage[] = [
      { role: "system", content: LYRICS_SYSTEM_PROMPT },
      { role: "user", content: lines.join("\n") },
    ];

    const chatOpts = {
      max_tokens: 8192 * 3,
      temperature: 0.2,
      enable_thinking: Boolean(input.enableThinking),
      agent: "lyrics",
      tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
      tool_choice: "auto" as const,
    };

    const handlers = {
      web_search: async (args: Record<string, unknown>) =>
        this.webSearch(String(args.query ?? "")),
      web_fetch: async (args: Record<string, unknown>) =>
        this.webFetch(String(args.url ?? "")),
    };

    const first = await chatWithTools(
      this.providers,
      messages,
      chatOpts,
      handlers,
      6,
    );
    let text = assertLyricsOrThrow(first.content ?? "");

    if (!looksLikePartialLyrics(text)) return text;

    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: text },
      { role: "user", content: LYRICS_COMPLETE_RETRY_PROMPT },
    ];
    const second = await chatWithTools(
      this.providers,
      retryMessages,
      chatOpts,
      handlers,
      6,
    );
    const retryText = assertLyricsOrThrow(second.content ?? "");

    // Prefer the longer / fuller reply if the retry still looks thin.
    if (
      looksLikePartialLyrics(retryText) &&
      retryText.length <= text.length
    ) {
      return text;
    }
    return retryText;
  }
}
