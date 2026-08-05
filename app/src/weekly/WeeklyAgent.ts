import type { ModelProvider, ChatMessage } from "../types";
import { parseLooseJson } from "../lib/parseLooseJson";
import { writeTrace } from "../reasoning/writeTrace";
import { resolveProviders, chatWithFallback } from "../agents/route";
import { WEEKLY_SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import type { WeeklyLetterJson } from "./weeklyRenderer";
import type { WeeklyRawData } from "./dataGather";

export type WeeklyAgentResult = {
  letter: WeeklyLetterJson;
  fallback: boolean;
};

export class WeeklyAgent {
  private providers: ModelProvider[];

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("companion");
  }

  async run(input: { raw: WeeklyRawData; onDemand?: boolean }): Promise<WeeklyAgentResult> {
    const brief = buildUserMessage(input.raw);
    const messages: ChatMessage[] = [
      { role: "system", content: WEEKLY_SYSTEM_PROMPT },
      { role: "user", content: brief },
    ];
    const t0 = performance.now();

    let attempt = 0;
    let lastRaw = "";
    while (attempt < 2) {
      attempt += 1;
      try {
        const res = await chatWithFallback(this.providers, messages, {
          max_tokens: 4096,
          temperature: 0.6,
          response_format: { type: "json_object" },
          enable_thinking: false,
          agent: "weekly",
        });
        lastRaw = res.content;
        const parsed = validateLetter(parseLooseJson(res.content));
        writeTrace({
          agent_kind: "weekly",
          prompt_text: brief,
          raw_response: res.content,
          parsed_json: parsed,
          duration_ms: Math.round(performance.now() - t0),
        });
        return { letter: parsed, fallback: false };
      } catch {
        // fall through to retry
      }
    }

    // Both attempts failed. Synthesize a minimal fallback letter from raw
    // data — the renderer will swap greeting/body/closing for the apology
    // copy (opts.fallback = true), but songs/moments must still populate
    // so the user sees the week's shape.
    const fallback = synthesizeFallback(input.raw);
    writeTrace({
      agent_kind: "weekly",
      prompt_text: brief,
      raw_response: lastRaw || null,
      parsed_json: { ...fallback, _fallback: true },
      duration_ms: Math.round(performance.now() - t0),
    });
    return { letter: fallback, fallback: true };
  }
}

function validateLetter(obj: unknown): WeeklyLetterJson {
  if (typeof obj !== "object" || obj === null) throw new Error("bad JSON");
  const o = obj as Record<string, unknown>;
  const s = (k: string) => {
    if (typeof o[k] !== "string") throw new Error(`missing ${k}`);
    return o[k] as string;
  };
  const arr = <T>(k: string, mapper: (x: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(o[k])) throw new Error(`missing ${k}`);
    return (o[k] as unknown[]).map((x, i) => {
      if (typeof x !== "object" || x === null) throw new Error(`${k}[${i}] not object`);
      return mapper(x as Record<string, unknown>);
    });
  };
  const greeting = s("greeting");
  const body = s("body");
  const closing = s("closing");
  const portrait_change = typeof o.portrait_change === "string" ? o.portrait_change : "";
  const songs = arr("songs", (x) => ({
    song_id: String(x.song_id ?? ""),
    one_liner: String(x.one_liner ?? ""),
  }));
  const moments = arr("moments", (x) => ({
    moment_id: String(x.moment_id ?? ""),
    whisper: String(x.whisper ?? ""),
  }));

  // Content enforcement (review finding I2): the LLM must write in first
  // person. Any 她 in the output or absence of 我 triggers a retry via the
  // throw — the retry loop in run() swallows it and falls through to
  // synthesizeFallback + renderer's fallback branch after two attempts.
  const outText = [
    greeting, body, closing, portrait_change,
    ...songs.map((s) => s.one_liner),
    ...moments.map((m) => m.whisper),
  ].join("\n");
  if (outText.includes("她")) {
    throw new Error("third_person_violation");
  }
  if (!outText.includes("我")) {
    throw new Error("no_first_person");
  }

  return { greeting, body, songs, moments, portrait_change, closing };
}

function synthesizeFallback(raw: WeeklyRawData): WeeklyLetterJson {
  return {
    // renderer replaces greeting/body/closing when opts.fallback = true;
    // these strings are just placeholders in case the caller renders
    // without the fallback flag.
    greeting: "",
    body: "",
    songs: raw.songs_played.slice(0, 5).map((s) => ({
      song_id: s.song_id,
      one_liner: s.small_note || "",
    })),
    moments: raw.salient.slice(0, 3).map((m) => ({
      moment_id: m.moment_id,
      whisper: m.text,
    })),
    portrait_change: "",
    closing: "",
  };
}
