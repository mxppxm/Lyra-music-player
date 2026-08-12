// moodSummary/MoodSummaryAgent.ts — 心情总结的 LLM 层。
// 输入：结构化情绪数据（summarizeMood 的输出）+ 最近几首推荐的歌，
// 或按日 DayMoodBrief；输出自然、具体、不套话的中文心情总结（JSON）。

import type { ChatMessage, ModelProvider } from "../types";
import { resolveProviders, chatWithFallback } from "../agents/route";
import { parseLooseJson } from "../lib/parseLooseJson";
import { writeTrace } from "../reasoning/writeTrace";
import type { MoodSummaryData } from "./summarizeMood";
import {
  formatDayMoodBriefForPrompt,
  type DayMoodBrief,
} from "../daily/buildDayMoodBrief";

export type MoodSummarySong = {
  song_id: string;
  title: string;
  artist: string | null;
};

export type MoodSummaryJson = {
  /** 一句开场（像朋友开口，不喊口号）。 */
  opener: string;
  /** 2-4 句正文：情绪怎么走、什么时候最重、最近被什么牵动。 */
  body: string;
  /** 给到最近听过的歌里最有感觉的一首的一句「为什么是它」。 */
  song_note: string;
  /** 一句给接下来的话（可以没有，空串表示不需要）。 */
  forward: string;
};

const MOOD_SUMMARY_SYSTEM_PROMPT = `你叫 Lyra，是用户身边的音乐伙伴。用户让你总结一段时间的情绪和音乐。
素材已转成中文人话（感受、时段软名、听歌行为、分析要点）。你要写成老朋友回忆这一天，不是报告。

硬性要求：
1. 全文自然口语；禁止报告腔、禁止「数据分析显示」。
2. 禁止输出 PAD 数字（如 -0.30）、事件名（如 lyra_start）、技术字段。
3. 禁止编造素材里没有的具体钟点。只有「你说过的话」里的时间（如 10:20）才能当具体钟点；不要写「下午两点」之类除非素材真有对应时间。
4. 不要用「14–18时」这类钟点区间叙事；可以说「午后」「夜里」等软时段。
5. 小注必须具体（歌名、锁定/听时等），禁止套话：「很适合你」「太配了」「很搭」「完美契合」「符合你的心情」「听这首就对了」。
6. 情绪起伏就直说起伏，别平均成「还不错」；可点到愉悦/能量/掌控的人话感受。
7. 不要编造数据里没有的事实；歌名来自给定列表。
8. body 写心情故事与歌的陪伴感，禁止罗列「N 次 / N 分 / N 秒」；具体数字留给 song_note（最多一句）或干脆不写。
9. 同一首歌只写一个听时口径（优先合计）；有锁定就写「锁着循环到第 N 遍，合计约…」，不要并列两套分钟数。
10. 时段轮数多＝互动更密，不是心情更重；整体平稳且各时段感受相同时，禁止写「午后更明显/更闷」之类递进。
11. 只输出 JSON，不要 markdown 代码块。`;

export function buildMoodSummaryUserMessage(
  data: MoodSummaryData,
  songs: MoodSummarySong[],
): string {
  const t = data.trajectory;
  const fmt = (n: number) => n.toFixed(2);
  const periodLines = data.periods
    .map(
      (p) =>
        `- ${p.label}（${p.count} 轮）：p=${fmt(p.mean_pad.p)} a=${fmt(p.mean_pad.a)} d=${fmt(p.mean_pad.d)}`,
    )
    .join("\n");
  const songLines = songs
    .map((s) => `- ${s.title}${s.artist ? `（${s.artist}）` : ""} [${s.song_id}]`)
    .join("\n");
  return `【情绪轨迹】
- 统计轮数：${t.sample_count} 轮
- 起点 PAD：p=${fmt(t.start_pad.p)} a=${fmt(t.start_pad.a)} d=${fmt(t.start_pad.d)}
- 终点 PAD：p=${fmt(t.end_pad.p)} a=${fmt(t.end_pad.a)} d=${fmt(t.end_pad.d)}
- 均值 PAD：p=${fmt(t.mean_pad.p)} a=${fmt(t.mean_pad.a)} d=${fmt(t.mean_pad.d)}
- 波动幅度：p 轴 ${fmt(t.axes.p.spread)}，a 轴 ${fmt(t.axes.a.spread)}，d 轴 ${fmt(t.axes.d.spread)}（0=几乎没动，2=满幅摆荡）
- 整体波动度：${fmt(t.volatility)}（0 平稳 ~ 1 剧烈）

【按时段分布】
${periodLines}

【最近听过的歌】
${songLines || "（无）"}

请输出 JSON：{ "opener": "...", "body": "...", "song_note": "...", "forward": "..." }`;
}

export type MoodSummaryAgentInput = {
  data: MoodSummaryData;
  songs: MoodSummarySong[];
};

/** Rule fallback when LLM is unavailable or day is empty. */
export function fallbackDayMoodSummary(brief: DayMoodBrief): MoodSummaryJson & {
  fallback: boolean;
} {
  if (brief.sparse) {
    return {
      opener: "",
      body: `${brief.dayLabel}几乎没有留下可写的心情痕迹。等你再来听一会儿、说一两句，这里会慢慢有字。`,
      song_note: "",
      forward: "",
      fallback: true,
    };
  }

  const labels = [
    ...new Set(brief.utterances.flatMap((u) => u.labels).filter(Boolean)),
  ].slice(0, 4);
  const topSong = brief.songs[0];
  const labelLine = labels.length
    ? `情绪里隐约有过「${labels.join("」「")}」。`
    : brief.mood
      ? "这一天的情绪没有被说得很满，但听歌还在。"
      : "这一天的对话不多，听歌的痕迹还在。";
  const sayLine = brief.utterances
    .slice(0, 2)
    .map((u) => `「${u.text}」`)
    .join("、");
  const utterBlock = sayLine ? `你提过：${sayLine}。` : "";
  const songNote = topSong
    ? `《${topSong.title}》${topSong.note ? `——${topSong.note}` : ""}`
    : "";
  const songBody = topSong
    ? `陪过你的有《${topSong.title}》${brief.songs.length > 1 ? "等" : ""}。`
    : "";

  return {
    opener: labels[0] ? `像是带着一点「${labels[0]}」。` : "",
    body: [labelLine, utterBlock, songBody].filter(Boolean).join("\n\n"),
    song_note: songNote,
    forward: "",
    fallback: true,
  };
}

export class MoodSummaryAgent {
  private providers: ModelProvider[];

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.providers = opts.provider
      ? [opts.provider]
      : resolveProviders("companion");
  }

  async summarize(input: MoodSummaryAgentInput): Promise<MoodSummaryJson> {
    const brief = buildMoodSummaryUserMessage(input.data, input.songs);
    const messages: ChatMessage[] = [
      { role: "system", content: MOOD_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: brief },
    ];
    const t0 = performance.now();
    const res = await chatWithFallback(this.providers, messages, {
      max_tokens: 8192,
      temperature: 0.7,
      response_format: { type: "json_object" },
      enable_thinking: false,
      agent: "mood-summary",
    });
    const parsed = parseLooseJson(res.content) as Partial<MoodSummaryJson>;
    writeTrace({
      agent_kind: "mood-summary",
      prompt_text: brief,
      raw_response: res.content,
      parsed_json: parsed,
      duration_ms: Math.round(performance.now() - t0),
    });
    return {
      opener: String(parsed.opener ?? ""),
      body: String(parsed.body ?? ""),
      song_note: String(parsed.song_note ?? ""),
      forward: String(parsed.forward ?? ""),
    };
  }

  /** Day-scoped summary used by runDaily. */
  async summarizeDay(
    brief: DayMoodBrief,
  ): Promise<MoodSummaryJson & { fallback: boolean }> {
    if (brief.sparse && brief.songs.length === 0 && brief.utterances.length === 0) {
      return fallbackDayMoodSummary(brief);
    }

    const userContent = formatDayMoodBriefForPrompt(brief);
    const messages: ChatMessage[] = [
      { role: "system", content: MOOD_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    try {
      const t0 = performance.now();
      const res = await chatWithFallback(this.providers, messages, {
        max_tokens: 8192,
        temperature: 0.7,
        response_format: { type: "json_object" },
        enable_thinking: false,
        agent: "mood-summary",
      });
      const parsed = parseLooseJson(res.content) as Partial<MoodSummaryJson>;
      writeTrace({
        agent_kind: "mood-summary",
        prompt_text: userContent,
        raw_response: res.content,
        parsed_json: parsed,
        duration_ms: Math.round(performance.now() - t0),
      });
      const body = String(parsed.body ?? "").trim();
      if (!body) return fallbackDayMoodSummary(brief);
      return {
        opener: String(parsed.opener ?? ""),
        body,
        song_note: String(parsed.song_note ?? ""),
        forward: String(parsed.forward ?? ""),
        fallback: false,
      };
    } catch (err) {
      console.warn("[lyra] MoodSummaryAgent.summarizeDay fallback:", err);
      return fallbackDayMoodSummary(brief);
    }
  }
}
