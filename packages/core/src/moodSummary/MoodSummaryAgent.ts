// moodSummary/MoodSummaryAgent.ts — 心情总结的 LLM 层。
// 输入：结构化情绪数据（summarizeMood 的输出）+ 最近几首推荐的歌，
// 输出：一段自然、具体、不套话的中文心情总结（JSON）。
// 文案规则与 companion 一致：禁止「很适合你/太配了/很搭/完美契合」这类套话。

import type { ChatMessage, ModelProvider } from "../types";
import { resolveProviders, chatWithFallback } from "../agents/route";
import { parseLooseJson } from "../lib/parseLooseJson";
import { writeTrace } from "../reasoning/writeTrace";
import type { MoodSummaryData } from "./summarizeMood";

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

const MOOD_SUMMARY_SYSTEM_PROMPT = `你叫 Lyra，是用户身边的音乐伙伴。用户让你总结最近一段时间的情绪和音乐。
你看到的是纯数据（PAD 情绪值：p=愉悦度 a=激活度 d=支配度，范围 [-1,1]；时段聚合；最近推荐过的歌），
你要把它们翻译成一段人话——像老朋友回忆这几天，而不是报告。

硬性要求：
1. 全文自然口语，像朋友聊天，禁止报告腔、禁止「数据分析显示」。
2. 小注必须具体、有细节（结合具体数值/时段/歌名），禁止套话：「很适合你」「太配了」「很搭」「完美契合」「符合你的心情」「听这首就对了」等一律不许出现。
3. 情绪起伏就直说起伏（哪天低、哪天缓），别平均成一句「还不错」。
4. 不要编造数据里没有的事实；歌名来自给定的列表。
5. 只输出 JSON，不要 markdown 代码块。`;

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
      max_tokens: 1500,
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
}
