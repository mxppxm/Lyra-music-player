import type { ModelProvider, ChatMessage } from "../types";
import { COMPANION_SYSTEM_PROMPT } from "./prompts/companion";
import { resolveProviders, chatWithFallback } from "./route";
import { writeTrace } from "../reasoning/writeTrace";
import { parseLooseJson } from "../lib/parseLooseJson";
import { songDisplayTitle } from "../library/display";
import type { ChosenSong, CompanionInput } from "./types";
import type { MusicProfile } from "../types/musicProfile";
import { shuffle } from "../recommendation";
import { formatAmbientFactsForCompanion } from "../recommendation/timeContext";

const SHIFTS = ["接住", "点燃", "陪着", "打断"] as const;
type Shift = (typeof SHIFTS)[number];

export class CompanionAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanionAgentError";
  }
}

function extractJson(raw: string): unknown {
  try {
    return parseLooseJson(raw);
  } catch {
    throw new CompanionAgentError(`bad JSON: ${raw.slice(0, 200)}`);
  }
}

function buildRecentPlaysBlock(i: CompanionInput): string {
  const rec = i.recommendation;
  if (!rec || rec.recentPlays.length === 0) return "";

  const unique = new Map<string, { turnsAgo: number; skipped: boolean }>();
  for (const p of rec.recentPlays) {
    if (!unique.has(p.songId)) {
      unique.set(p.songId, { turnsAgo: p.turnsAgo, skipped: p.skipped });
    }
  }

  const lines = ["近期已播（禁止再选这些 id）:"];
  let n = 0;
  for (const [id, meta] of unique) {
    if (n >= 15) break;
    const tag = meta.skipped ? " [用户跳过]" : "";
    lines.push(`- ${id} (${meta.turnsAgo} 轮前${tag})`);
    n++;
  }
  lines.push(`novelty_seeking=${rec.noveltySeeking.toFixed(2)} — 越高越应推新鲜歌`);
  return lines.join("\n");
}

function pickFallbackSongId(input: CompanionInput): string {
  const ids = input.candidates.map((c) => c.id);
  const rec = input.recommendation;

  if (!rec || rec.fatigueByTrack.size === 0) {
    const pool = shuffle(ids).slice(0, Math.min(5, ids.length));
    return pool[0] ?? ids[0];
  }

  let best = ids[0];
  let bestFatigue = Infinity;
  for (const id of ids) {
    const f = rec.fatigueByTrack.get(id) ?? 0;
    if (f < bestFatigue) {
      bestFatigue = f;
      best = id;
    }
  }
  return best;
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

function formatProfile(p: MusicProfile | null | undefined): string {
  if (!p) return "暂无音乐画像";

  const parts: string[] = [];
  if (p.recognized && p.canonical_work) parts.push(`原曲: ${p.canonical_work}`);
  if (p.genre.length > 0) parts.push(`流派: ${p.genre.join("/")}`);
  if (p.mood.length > 0) parts.push(`情绪: ${p.mood.join(", ")}`);
  if (p.energy_level) parts.push(`能量: ${p.energy_level}`);
  if (p.tempo_feel) parts.push(`节奏: ${p.tempo_feel}`);
  if (p.time_color) parts.push(`时间感: ${p.time_color}`);
  if (p.space_color) parts.push(`空间感: ${p.space_color}`);
  if (p.instrumentation.length > 0) parts.push(`乐器: ${p.instrumentation.join(", ")}`);
  if (p.vocal_style) parts.push(`人声: ${p.vocal_style}`);
  if (p.lyrical_themes.length > 0) parts.push(`主题: ${p.lyrical_themes.join(", ")}`);
  if (p.emotional_curve) parts.push(`情绪弧线: ${p.emotional_curve}`);
  if (p.best_for.length > 0) parts.push(`适合: ${p.best_for.join(", ")}`);
  parts.push(`PAD估计: p=${p.pad_estimate.p.toFixed(2)} a=${p.pad_estimate.a.toFixed(2)} d=${p.pad_estimate.d.toFixed(2)}`);
  if (p.llm_unknown) parts.push("⚠ LLM 不认识此歌，分析可能不准");
  if (p.recognized === false && !p.llm_unknown) parts.push("⚠ 未确认识别原曲，勿按歌名字面发挥");

  return parts.join(" | ");
}

function buildBrief(i: CompanionInput): string {
  const { pad, labels, confidence } = i.currentEmotion;
  const soul = i.soul;
  const memoryLine =
    soul.shared_memory.length > 0
      ? `- 共同记忆(最近一条): ${soul.shared_memory[soul.shared_memory.length - 1].significance}`
      : "- 共同记忆: (无)";
  const candidateBlock = i.candidates
    .map((c, idx) => {
      const dur = c.duration_ms ? Math.round(c.duration_ms / 1000) + "s" : "-";
      const artist = c.artist ?? "(无艺人)";
      const title = songDisplayTitle(c);

      const profileStr = formatProfile(c.musicProfile);

      // Show real audio PAD prominently when available
      const audioPadStr = c.audioPad
        ? `🎵 真实音频PAD: p=${c.audioPad.p.toFixed(2)} a=${c.audioPad.a.toFixed(2)} d=${c.audioPad.d.toFixed(2)}`
        : "";

      return `[${idx + 1}] id=${c.id} · ${title} · ${artist} · ${dur}${audioPadStr ? `\n   ${audioPadStr}` : ""}\n   └ 画像: ${profileStr}`;
    })
    .join("\n");

  const memoryBlock = buildMemoryBlock(i);
  const recentPlaysBlock = buildRecentPlaysBlock(i);

  const parts = [
    `用户的话: ${i.userUtterance || "(无)"}`,
    `此刻情绪: PAD=(p=${pad.p.toFixed(2)}, a=${pad.a.toFixed(2)}, d=${pad.d.toFixed(2)}), labels=[${labels.join(",")}], confidence=${confidence.toFixed(2)}`,
    `你的灵魂状态:`,
    `- backbone: ${soul.musical_taste_base.backbone}`,
    `- affinity_genres: ${soul.musical_taste_base.affinity_genres.join(", ")}`,
    `- 当下 recent_bias: ${soul.dynamic_mood.recent_bias || "(无)"}`,
    memoryLine,
  ];

  // Lock-play rewrite: same song, new angle — never "上一首刚播完" transition copy.
  if (i.lockPlayCount != null && i.lockPlayCount > 0) {
    parts.push(
      `锁定播放模式：用户正在循环同一首歌（候选已固定，song_id 必须仍是当前这首）。这是本曲锁定播放的第 ${i.lockPlayCount} 遍。`,
    );
    parts.push(
      "你的任务不是换歌，只是重写 rationale：必须换一个全新切入点（编曲细节 / 人声气息 / 某句歌词意象 / 时间氛围 / 和她的关系），禁止同义改写、禁止微调旧句、禁止再复述情绪标签。",
    );
    const recent = (i.lockRecentRationales?.length
      ? i.lockRecentRationales
      : i.previousRationale
        ? [i.previousRationale]
        : []
    ).filter((s) => s.trim());
    if (recent.length > 0) {
      parts.push("以下小注已经写过，角度全部禁用（连相近都不行）：");
      recent.forEach((r, idx) => {
        parts.push(`${idx + 1}. "${r}"`);
      });
    }
  } else if (i.previousSong) {
    // Auto-advance context: previous song & rationale for DJ-like transitions
    const artistStr = i.previousSong.artist ? ` · ${i.previousSong.artist}` : "";
    parts.push(`上一首刚播完: ${i.previousSong.title}${artistStr}`);
    if (i.previousRationale) {
      parts.push(
        `你上一条 rationale: "${i.previousRationale}" ← 必须换一个完全不同的角度写这条`,
      );
    }
  }

  // 原始时钟 + 气象事实（不含清晨/午休等系统时段词）—— 模型自行感受氛围写小注
  const timeCtx = i.recommendation?.timeContext;
  if (timeCtx) {
    parts.push(formatAmbientFactsForCompanion(timeCtx.now, timeCtx.weather));
  }

  // Mood-lock hint: when user explicitly set a mood,选的歌必须紧扣
  if (i.recommendation?.moodLocked) {
    parts.push(
      `⚠ 心情锁定模式：用户当前处于心情锁定状态，选歌必须严格贴合 labels=[${labels.join(",")}] 与 PAD 方向，不要偏离。rationale 也要呼应这个锁定情绪。`,
    );
  }

  if (memoryBlock) {
    parts.push("");
    parts.push(memoryBlock);
  }

  if (recentPlaysBlock) {
    parts.push("");
    parts.push(recentPlaysBlock);
  }

  const artistFilter = i.recommendation?.artistFilter?.trim();
  if (artistFilter) {
    parts.push("");
    parts.push(
      `【歌手会话】用户指定只听「${artistFilter}」。候选池已全部是该歌手；在此范围内按情绪选歌，直到用户输入别的话。`,
    );
    parts.push(
      "歌手会话内优先播尚未在本会话听过的歌；该歌手曲库都听过后才允许循环，且避免连着两首同一首。",
    );
  }

  parts.push("");
  parts.push(`候选歌单(${i.candidates.length} 首):`);
  parts.push(candidateBlock);

  return parts.join("\n");
}

type PartialChosen = {
  song_id: string;
  target_profile: string;
  rationale: string;
  needed_shift: Shift;
};

function parsePartial(obj: unknown): PartialChosen {
  if (typeof obj !== "object" || obj === null) throw new CompanionAgentError("expected object");
  const o = obj as Record<string, unknown>;
  const song_id = typeof o.song_id === "string" ? o.song_id : "";
  const target_profile = typeof o.target_profile === "string" ? o.target_profile.trim() : "";
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  const needed_shift: Shift = (SHIFTS as readonly string[]).includes(o.needed_shift as string)
    ? (o.needed_shift as Shift)
    : "接住";
  return { song_id, target_profile, rationale, needed_shift };
}

function buildCorrectionBrief(bad: PartialChosen, candidateIds: string[]): string {
  return [
    `你上次返回的 song_id 是 ${JSON.stringify(bad.song_id)}，但它不在候选列表里。`,
    `候选列表里只有这些 id (从上一条 user message 里挑一个):`,
    candidateIds.map((id) => `- ${id}`).join("\n"),
    ``,
    `请重新返回 JSON，target_profile / rationale / needed_shift 可以保留你原本的判断，只要把 song_id 换成上面列表里真实存在的那个（选一个和你的 target_profile 最贴的）。同样只返回 JSON，不要 markdown。`,
  ].join("\n");
}

export class CompanionAgent {
  private providers: ModelProvider[];
  constructor(opts: { provider?: ModelProvider } = {}) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("companion");
  }

  async choose(input: CompanionInput): Promise<ChosenSong> {
    const candidateIds = input.candidates.map((c) => c.id);
    const idSet = new Set(candidateIds);
    const brief = buildBrief(input);
    const messages: ChatMessage[] = [
      { role: "system", content: COMPANION_SYSTEM_PROMPT },
      { role: "user", content: brief },
    ];

    const t0 = performance.now();
    const res = await chatWithFallback(this.providers, messages, {
      // Bumped 1024 → 3000 to survive GLM-5.x reasoning burn on the Zhipu
      // fallback path. Anthropic (primary) treats this as an upper cap.
      max_tokens: 8192,
      // Lock-play rewrites need more entropy — same song + similar brief
      // otherwise collapses to near-duplicate notes.
      temperature: input.lockPlayCount != null && input.lockPlayCount > 0 ? 0.95 : 0.7,
      response_format: { type: "json_object" },
      enable_thinking: false,
      agent: "companion",
    });
    let picked = parsePartial(extractJson(res.content));

    writeTrace({
      agent_kind: "companion",
      prompt_text: brief,
      raw_response: res.content,
      parsed_json: picked,
      duration_ms: Math.round(performance.now() - t0),
    });

    // Retry once if the LLM picked a song_id outside the candidate set.
    if (!idSet.has(picked.song_id)) {
      console.warn(
        `[lyra] CompanionAgent: bad song_id ${JSON.stringify(picked.song_id)}, retrying with correction`,
      );
      const retryMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: res.content },
        { role: "user", content: buildCorrectionBrief(picked, candidateIds) },
      ];
      const retryRes = await chatWithFallback(this.providers, retryMessages, {
        max_tokens: 8192,
        temperature: 0.3,
        response_format: { type: "json_object" },
        enable_thinking: false,
        agent: "companion",
      });
      picked = parsePartial(extractJson(retryRes.content));
    }

    // Fallback: if even the retry missed, use the first candidate rather than
    // failing the turn. Preserve the LLM's rationale/target_profile since those
    // are still useful.
    if (!idSet.has(picked.song_id)) {
      console.warn(
        `[lyra] CompanionAgent: retry still bad (${JSON.stringify(picked.song_id)}); falling back to lowest-fatigue candidate`,
      );
      picked = { ...picked, song_id: pickFallbackSongId(input) };
    }

    return picked;
  }
}
