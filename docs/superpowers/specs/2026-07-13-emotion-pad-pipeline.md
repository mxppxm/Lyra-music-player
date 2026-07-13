# PAD 情感模型与 EmotionAgent 推断流程

**日期**: 2026-07-13
**作用范围**: `app/src/agents/EmotionAgent.ts`、`app/src/agents/prompts/emotion.ts`、`app/src/agents/padToBpm.ts`、`app/src/types/dialogue.ts`

## 1. 什么是 PAD

PAD = **Pleasure–Arousal–Dominance**(愉悦度 / 唤醒度 / 支配度),心理学中量化情绪状态的三维向量。

在 Lyra 中,它是情感系统的核心数据结构(`app/src/types/dialogue.ts:2`):

```ts
export type PAD = { p: number; a: number; d: number };
```

三个分量取值均为 `[-1, 1]`:

| 维度 | 负向 | 正向 |
|---|---|---|
| **p (Pleasure)** | 不悦 / 悲伤 | 愉快 / 满足 |
| **a (Arousal)** | 平静 / 低能量 | 激动 / 高能量 |
| **d (Dominance)** | 顺从 / 被压垮 | 有力 / 掌控感 |

## 2. PAD 在项目中的用途

1. **`EmotionAgent`** 从用户对话推断当前 PAD 向量(本文重点)。
2. **`padToBpm`**(`app/src/agents/padToBpm.ts`)把 PAD 映射到目标 BPM 窗口:
   - `a` (arousal) 为主驱动
   - `d` (dominance) 微调
   - `p` (pleasure) **有意忽略** —— 慢抒情和慢 groove 都属低唤醒,与 valence 无关
3. **`LibraryAgent`** 用 PAD 在音乐库中检索匹配歌曲。
4. **`AmbientBackground` / `EmotionLightBand`** 把 PAD 映射到 UI 环境色和光带。

一句话:PAD 是"用户情绪 ↔ 音乐/视觉参数"的通用中间语。

## 3. EmotionAgent 推断流程

### 3.1 调用链

入口:`EmotionAgent.analyze(input)`(`app/src/agents/EmotionAgent.ts:95`)

1. 组两条消息:
   - `system` = `EMOTION_SYSTEM_PROMPT`
   - `user` = 用户原话
2. 通过 `routeProvider("emotion")` 路由到 LLM,固定参数:
   - `temperature: 0.3` —— 收敛输出,避免情绪抖动
   - `response_format: { type: "json_object" }`
   - `max_tokens: 2048` —— 留给 GLM-5.x 的 `reasoning_content` 缓冲
   - `enable_thinking: false` —— 情感判定不吃 CoT,直出 `content` 更快更便宜
3. `res.content` → `extractJson`(经 `parseLooseJson` 容错)→ `validateEmotion`
4. 成功/失败都 `writeTrace`,失败路径记录原文+错误,供"推理轨迹"tab 查看。

### 3.2 校验规则(`validateEmotion` at `EmotionAgent.ts:27`)

- **pad.p / pad.a / pad.d 必须是数字且 ∈ [-1, 1]**,否则抛 `EmotionAgentError`
- `labels` 只保留字符串;缺失则空数组
- `confidence` ∈ [0, 1],否则回落到 0.5
- `source` 白名单:`user-declared` | `ring-signal`,其他一律标为 `emotion-agent-inferred`
- `predicted_trajectory`(可选):
  - `horizon_min` 需为 5–120 的整数
  - `predicted_pad` 三分量都在 [-1, 1] 才保留
  - **格式错静默丢弃,不抛错**(可选字段,别拖累主流程)

### 3.3 输出结构

```ts
CurrentEmotion = {
  pad: { p, a, d },
  labels: string[],       // ≤3 个中文短语,如 "疲惫" "有一丝焦虑"
  confidence: number,     // [0, 1]
  source: "emotion-agent-inferred" | "user-declared" | "ring-signal",
  predicted_trajectory?: { horizon_min: 5-120, predicted_pad }
}
```

## 4. 提示词工程(`prompts/emotion.ts`)

系统提示不是让模型自由发挥,而是塞了两块结构化知识 + 一组反直觉规则。

### 4.1 中文含蓄清单 `CN_UNDERSTATEMENT_TABLE`

把汉语高频"言不由衷"短语编码为 PAD 参考值和 confidence 上限。示例:

| 表达 | 隐藏 PAD (p, a, d) | conf 上限 |
|---|---|---|
| 还好 / 老样子 | (-0.20, -0.20, -0.20) | 0.60 |
| 有点累 | (-0.30, -0.40, -0.30) | 0.80 |
| 有点烦 | (-0.30, +0.40, -0.20) | 0.75 |
| 想放空 / 想一个人待着 | (-0.20, -0.50, -0.30) | 0.75 |
| 算了 / 行吧 | (-0.50, -0.20, -0.50) | 0.70 |
| 想哭 | (-0.60, +0.30, -0.40) | 0.85 |
| 扛不住 / 顶不住 | (-0.60, +0.50, -0.60) | 0.85 |
| 睡不着 / 又失眠了 | (-0.30, +0.40, -0.30) | 0.70 |

### 4.2 强度副词缩放

主要作用于 P 轴,截断到 ±1:

- "有点 / 稍微" ×0.6
- "还 / 也" ×0.5
- "挺 / 蛮" ×0.8
- "非常 / 特别 / 真的" ×1.2
- "死了 / 爆了 / 要命" ×1.4

### 4.3 Few-shot 示例(8 条)

覆盖:含蓄负向、直白正向、中性事实、反例(上下文推翻含蓄,如"我真的还好,别担心" → p 反转到正)、说不清的模糊情绪。

### 4.4 显式反直觉规则

- 看到"累" **不要** 打成悲伤 —— "累"是 A 负(疲软),不是 A 正
- 看到"想哭" **不要** 把 A 打到 +0.9 —— 想哭是崩溃边缘,A 通常 +0.2 到 +0.4
- 短句 + 无上下文 → confidence ≤ 0.75
- 中文含蓄命中时 confidence 按清单上限走
- 空输入(proactive open)→ PAD (0, 0, 0),confidence 0.2

## 5. 设计取舍

1. **反 CoT**:情感判定被显式关闭 thinking,靠先验表 + few-shot 直出。哲学是"情感是模式匹配,不是推理"。
2. **静默降级 vs 硬失败**:
   - PAD 主值出错 → 抛错(核心不能容忍)
   - `predicted_trajectory` 坏 → 悄悄丢弃(可选字段)
   跟 `padToBpm` 里"pleasure 有意忽略"是一脉相承的 —— 只对系统核心敏感值严格。
3. **含蓄先验独立于模型能力**:即使切换到较弱的 LLM,表格里编码的中文语用知识仍然生效,输出稳定性有下限。

## 6. 参考文件

- `app/src/agents/EmotionAgent.ts` —— 主流程 + 校验
- `app/src/agents/prompts/emotion.ts` —— 系统提示 + 含蓄清单 + few-shot
- `app/src/agents/padToBpm.ts` —— PAD → BPM 映射(a 主导,d 微调,p 忽略)
- `app/src/types/dialogue.ts` —— `PAD` 类型定义
- `app/src/agents/EmotionAgent.test.ts` —— 校验行为测试
- 上游知识:`skills-repo/emotion-capture-cn-skill/references/chinese-understatement.md`
