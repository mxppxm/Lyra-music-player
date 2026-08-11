// agents/DailyMoodAgent.ts — 心情日信（LLM）

import type { ModelProvider, ChatMessage } from "../types";
import { DAILY_MOOD_SYSTEM_PROMPT } from "./prompts/dailyMood";
import { writeTrace } from "../reasoning/writeTrace";
import { resolveProviders, chatWithFallback } from "./route";
import { parseLooseJson } from "../lib/parseLooseJson";
import {
  formatMoodBriefForPrompt,
  type DailyMoodBrief,
} from "../daily/buildDailyMoodBrief";

export type DailyMoodLetter = {
  mood_arc: string;
  greeting: string;
  body: string;
  closing: string;
  /** true when letter came from rule fallback, not LLM */
  fallback: boolean;
};

export class DailyMoodAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyMoodAgentError";
  }
}

function extractJson(raw: string): unknown {
  try {
    return parseLooseJson(raw);
  } catch {
    const preview = raw.length === 0 ? "<empty>" : raw.slice(0, 200);
    throw new DailyMoodAgentError(`bad JSON: ${preview}`);
  }
}

function validateLetter(obj: unknown): Omit<DailyMoodLetter, "fallback"> {
  if (typeof obj !== "object" || obj === null) {
    throw new DailyMoodAgentError("expected object");
  }
  const o = obj as Record<string, unknown>;
  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (!body) throw new DailyMoodAgentError("empty body");
  return {
    mood_arc: typeof o.mood_arc === "string" ? o.mood_arc.trim() : "",
    greeting: typeof o.greeting === "string" ? o.greeting.trim() : "",
    body,
    closing: typeof o.closing === "string" ? o.closing.trim() : "",
  };
}

/** Rule fallback when LLM is unavailable or day is empty. */
export function fallbackMoodLetter(brief: DailyMoodBrief): DailyMoodLetter {
  if (brief.sparse || (brief.turns.length === 0 && brief.companionSongs.length === 0)) {
    return {
      mood_arc: "几乎空白",
      greeting: "",
      body: `${brief.dayLabel}几乎没有留下可写的心情痕迹。等你再来听一会儿、说一两句，这里会慢慢有字。`,
      closing: "— Lyra",
      fallback: true,
    };
  }

  const labels = [
    ...new Set(brief.turns.flatMap((t) => t.labels).filter(Boolean)),
  ].slice(0, 4);
  const songs = brief.companionSongs.slice(0, 3).map((s) => s.title);
  const labelLine = labels.length
    ? `情绪里隐约有过「${labels.join("」「")}」。`
    : "这一天的情绪没有被说得很满，但听歌还在。";
  const songLine = songs.length
    ? `陪过你的有 ${songs.map((t) => `《${t}》`).join("、")}。`
    : "";
  const uttered = brief.turns
    .map((t) => t.utterance)
    .filter((u) => u && !u.startsWith("（"))
    .slice(0, 2);
  const sayLine = uttered.length
    ? `你提过：${uttered.map((u) => `「${u}」`).join("、")}。`
    : "";

  return {
    mood_arc: labels[0] ?? "还在走",
    greeting: "",
    body: [labelLine, sayLine, songLine].filter(Boolean).join("\n\n"),
    closing: "— Lyra",
    fallback: true,
  };
}

export class DailyMoodAgent {
  private providers: ModelProvider[];

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("daily");
  }

  async write(brief: DailyMoodBrief): Promise<DailyMoodLetter> {
    if (brief.sparse && brief.turns.length === 0 && brief.companionSongs.length === 0) {
      return fallbackMoodLetter(brief);
    }

    const userContent = formatMoodBriefForPrompt(brief);
    const messages: ChatMessage[] = [
      { role: "system", content: DAILY_MOOD_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    try {
      const t0 = performance.now();
      const res = await chatWithFallback(this.providers, messages, {
        max_tokens: 8192,
        temperature: 0.7,
        response_format: { type: "json_object" },
        enable_thinking: false,
        agent: "daily",
      });
      const duration_ms = Math.round(performance.now() - t0);
      const parsed = validateLetter(extractJson(res.content));
      writeTrace({
        agent_kind: "daily",
        prompt_text: userContent,
        raw_response: res.content,
        parsed_json: parsed,
        duration_ms,
      });
      return { ...parsed, fallback: false };
    } catch (err) {
      console.warn("[lyra] DailyMoodAgent fallback:", err);
      return fallbackMoodLetter(brief);
    }
  }
}
