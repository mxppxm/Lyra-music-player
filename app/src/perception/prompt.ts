/**
 * perception/prompt.ts — system prompt + user content builder for LLM-driven
 * perception (Sprint 7 T2).
 *
 * Style choice matches emotion.ts / companion.ts: Chinese, strict JSON only,
 * no markdown fences. Behavioral features are serialized as a JSON blob in
 * the user message so the LLM has structured signal to reason over.
 */

import type { BehavioralFeatures } from "./aggregator";
import { coarsen } from "./coarsening";

export const PERCEPTION_SYSTEM_PROMPT = `你是 Lyra 的**感知层 agent**。用户此刻没在说话——你只看到他 60 秒内的行为数据。你的任务是从这些行为里推断一个隐性的情绪 bias，补充给 EmotionAgent 使用。

你不是替代 EmotionAgent（那个专门吃用户说的话）。你补充的是 verbal 之外的信号。

输出严格 JSON，除此之外不能有任何字符：
{
  "pad_bias": { "p": [-1,1], "a": [-1,1], "d": [-1,1] },
  "confidence": [0,1],
  "reason": "一句中文，解释你为什么这样推断"
}

字段说明：
- pad_bias 是一个修正量，不是绝对情绪。数值幅度控制在 0.3 以内。举例：skip 率高 → 用户可能烦躁 → p ≈ -0.2, a ≈ 0.1。
- confidence 是你对这次推断的把握。信号少或矛盾 → 0.2-0.4；信号明确单一方向 → 0.6-0.8。
- reason 一句中文，简洁。别用"根据数据显示"这种废话。

BehavioralFeatures 字段释义（作为你的推理线索）：
- activeMs / windowMs = 活跃时间占比。< 5% 说明用户离开或走神。
- submits = 60s 内提交次数。>= 3 且间隔短 → 高投入或焦虑。
- skipRatio = 跳过率。>= 0.5 → 用户不接受当前推荐。
- proactiveDismisses = 主动开口被驳回次数。>= 2 → 用户不想被打扰。
- isBlurred = 窗口失焦。true + 低 activeMs → 完全离开电脑。
- totalChars = 60s 内敲字量。高值说明专注但可能情绪激烈。

signals 是 4 个粗化维度（只发级别、不发数值，保护用户隐私）：
- hover_attention: 用户在专辑封面/歌词轨迹等氛围元素上驻留的强度
- input_hesitation: 用户打字后又清空、欲言又止的次数
- quiet_presence: 窗口在场但用户完全不动的比例——"在同一个房间里安静地坐着"
- scroll_activity: 用户在 Data Explorer/Roadmap 里翻阅她的记忆/想法的强度

没有明显信号时返回：
{ "pad_bias": { "p": 0, "a": 0, "d": 0 }, "confidence": 0, "reason": "no signal" }

不要输出 markdown code fence。不要在 JSON 前后加任何字符。`;

export function buildPerceptionUserContent(features: BehavioralFeatures): string {
  // Serialize deterministically so the LLM sees stable field order.
  const payload = {
    windowMs: features.windowMs,
    activeMs: features.activeMs,
    submits: features.submits,
    avgSubmitGapMs: Number.isNaN(features.avgSubmitGapMs)
      ? null
      : features.avgSubmitGapMs,
    totalChars: features.totalChars,
    skips: features.skips,
    completions: features.completions,
    skipRatio: features.skipRatio,
    proactiveDismisses: features.proactiveDismisses,
    isBlurred: features.isBlurred,
  };
  return JSON.stringify({ features: payload, signals: coarsen(features) }, null, 2);
}
