import type { ModelProvider, ChatMessage } from "../types";
import { COMPANION_SYSTEM_PROMPT } from "./prompts/companion";
import { routeProvider } from "./route";
import type { ChosenSong, CompanionInput } from "./types";

const SHIFTS = ["接住", "点燃", "陪着", "打断"] as const;
type Shift = (typeof SHIFTS)[number];

export class CompanionAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanionAgentError";
  }
}

function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    return JSON.parse(s);
  } catch {
    throw new CompanionAgentError(`bad JSON: ${raw.slice(0, 200)}`);
  }
}

function buildMemoryBlock(i: CompanionInput): string {
  const portrait = i.livingPortrait ?? "";
  const facts = i.topFacts ?? [];
  if (!portrait && facts.length === 0) return "";

  const lines: string[] = ["你对她的记忆:"];
  if (portrait) {
    lines.push(portrait);
  }
  if (facts.length > 0) {
    if (portrait) lines.push("");
    lines.push("你观察到的偏好:");
    for (const f of facts) {
      lines.push(`- ${f.tags.join(" ")} → ${f.conclusion} (conf: ${f.confidence.toFixed(2)})`);
    }
  }
  return lines.join("\n");
}

function buildBrief(i: CompanionInput): string {
  const { pad, labels, confidence } = i.currentEmotion;
  const soul = i.soul;
  const memoryLine =
    soul.shared_memory.length > 0
      ? `- 共同记忆(最近一条): ${soul.shared_memory[soul.shared_memory.length - 1].significance}`
      : "- 共同记忆: (无)";
  const candidateBlock = i.candidates
    .map(
      (c, idx) =>
        `[${idx + 1}] id=${c.id} · ${c.title ?? "(无标题)"} · ${c.artist ?? "(无艺人)"} · ${
          c.album ?? "-"
        } · ${c.duration_ms ? Math.round(c.duration_ms / 1000) + "s" : "-"}`,
    )
    .join("\n");

  const memoryBlock = buildMemoryBlock(i);

  const parts = [
    `用户的话: ${i.userUtterance || "(她/他刚打开 app,还没说话)"}`,
    `此刻情绪: PAD=(p=${pad.p.toFixed(2)}, a=${pad.a.toFixed(2)}, d=${pad.d.toFixed(2)}), labels=[${labels.join(",")}], confidence=${confidence.toFixed(2)}`,
    `你的灵魂状态:`,
    `- backbone: ${soul.musical_taste_base.backbone}`,
    `- affinity_genres: ${soul.musical_taste_base.affinity_genres.join(", ")}`,
    `- 当下 recent_bias: ${soul.dynamic_mood.recent_bias || "(无)"}`,
    memoryLine,
  ];

  if (memoryBlock) {
    parts.push("");
    parts.push(memoryBlock);
  }

  parts.push("");
  parts.push(`候选歌单(${i.candidates.length} 首):`);
  parts.push(candidateBlock);

  return parts.join("\n");
}

function validate(obj: unknown, candidateIds: Set<string>): ChosenSong {
  if (typeof obj !== "object" || obj === null) throw new CompanionAgentError("expected object");
  const o = obj as Record<string, unknown>;
  const song_id = typeof o.song_id === "string" ? o.song_id : "";
  if (!candidateIds.has(song_id)) {
    throw new CompanionAgentError(`song_id ${JSON.stringify(song_id)} not in candidates`);
  }
  const target_profile = typeof o.target_profile === "string" ? o.target_profile.trim() : "";
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  const needed_shift: Shift = (SHIFTS as readonly string[]).includes(o.needed_shift as string)
    ? (o.needed_shift as Shift)
    : "接住";
  return { song_id, target_profile, rationale, needed_shift };
}

export class CompanionAgent {
  private provider: ModelProvider;
  constructor(opts: { provider?: ModelProvider } = {}) {
    this.provider = opts.provider ?? routeProvider("companion");
  }

  async choose(input: CompanionInput): Promise<ChosenSong> {
    const messages: ChatMessage[] = [
      { role: "system", content: COMPANION_SYSTEM_PROMPT },
      { role: "user", content: buildBrief(input) },
    ];
    const res = await this.provider.chat(messages, { max_tokens: 1024, temperature: 0.7 });
    const obj = extractJson(res.content);
    const ids = new Set(input.candidates.map((c) => c.id));
    return validate(obj, ids);
  }
}
