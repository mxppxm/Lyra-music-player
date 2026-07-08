# Sprint 13 · 感知广谱事件 — Design

**Date:** 2026-07-08
**Sprint:** 13 (v0.2.z)
**Precedes plan:** `docs/superpowers/plans/2026-07-08-sprint-13-perception-broad-events.md` (待写)

---

## 1. Motivation

`current-implementation.md @ 891e3a9` §7 defer 清单里写着:

> **感知 agent 广谱事件**(现只 focus/click/input,需求文档要求覆盖所有 UI 事件——工程量约 1 周)

`design-answers.md` 明确要求感知层覆盖广谱 UI 事件。当前 EventBus 只有 9 kind、BehavioralAggregator 只有 10 维,拿到的行为剖面基本只能回答"用户主动做了什么"(input_submit / skip / complete),回答不了"用户在场安静地在"「用户看了封面很久」「用户欲言又止」这几种更细腻的存在状态。

Sprint 13 补上这一层——但不是**字面**上"所有 UI 事件"那样铺满,而是**均衡**尺度:只加那些既有信号又不失哲学的事件。

## 2. Goal

让 EventBus 从 9 kind 扩到 13 kind、BehavioralAggregator 从 10 维扩到 15 维、RulePerceptionAgent 从 5 条 rule 扩到 8 条,LLMPerceptionAgent 收到一层粗化后的信号,让 Lyra 能够感知到:

- 你在**在场**但**安静**(不是走了,是在同一个房间里坐着)
- 你**欲言又止**(打字后又清空了,没发出来)
- 你的注意力**停留**在她的氛围元素上(专辑封面、小注、歌词轨迹)
- 你在**翻阅**她(在 Data Explorer / Roadmap 里滚动查看)

## 3. Non-goals

- **selection / copy / typing burst→delete 追踪**——与 2026-07-08 加入的网站 PRIVACY 段("你说给我的话,只留在你的这台设备里,我不会向任何人说起")冲突,味太侵犯
- **播放控制事件(pause / seek / volume)**——当前 UI 无 space→pause、无 scrubber、无音量控件,等相关 UX 上再补
- **hover target 分布 / scroll 方向分布**——先粗,足够 Reflect 观察出模式后再细分
- **广谱事件走"全部数值"进 Zhipu**——只允许粗化(高/中/低)后走 network,以尊重 PRIVACY 承诺
- **广谱事件跨设备同步 / 云端聚合**——反范围,永远不做

## 4. Design Decisions

| # | 分叉 | 选择 | 理由 |
|---|------|------|------|
| 1 | 广谱尺度 | 均衡(4 新 kind) | 需求文档字面要求"所有 UI 事件"vs 哲学「静·虚·空·灵·禅」拉扯,选中道:加信号强的、不加侵犯感强的 |
| 2 | LLM 隐私边界 | 粗化后传(高/中/低/none/some/many),不发数值 | 与刚上线的 PRIVACY 承诺一致;RulePerception 仍用完整数值,只有 network 出口点被粗化 |
| 3 | 存储 | 复用 `perception_audit.features_json` JSON blob,不加 migration | JSON blob 天然可扩形状,老快照缺 key 时 `?? 0` 兜底 |
| 4 | Rule 阈值治理 | 4 个新 threshold 走 `PerceptionTuning` 通道 | 与现有 5 条 rule 对齐,Reflect 可以自调 |
| 5 | Install 层职责划分 | scroll / hover_dwell / focus_no_interaction 走全局 listener + `data-lyra-*` attribute;input_dwell 走 React hook | input dwell 状态机依赖 controlled input value,纯 DOM listener 拿不到 |
| 6 | 感知模式的取舍 | quiet_presence 作为核心信号——区分"你走了(blur)"与"你在但安静(focus+idle)" | 这是当前架构完全没有的维度,也是 5 字哲学"禅"最直接的对应物 |

## 5. Event Kinds (delta: 9 → 13)

```ts
// perception/events.ts
export type LyraEvent =
  /* ...existing 9 kinds unchanged... */
  | { kind: "scroll"; at: number; container: "data_explorer" | "roadmap" | "other"; direction: "up" | "down" }
  | { kind: "hover_dwell"; at: number; target: "album_cover" | "small_note" | "trace_strip"; ms: number }
  | { kind: "input_dwell_without_submit"; at: number; charsTyped: number; dwellMs: number }
  | { kind: "focus_no_interaction"; at: number; sinceMs: number };
```

| Kind | 何时 emit | 信号意义 |
|---|---|---|
| `scroll` | Data Explorer / Roadmap 内滚动,`{capture:true, passive:true}` + throttle 500ms/container | "你在翻阅她的记忆/她的想法" |
| `hover_dwell` | 鼠标停留在 `[data-lyra-hover]` 元素 ≥3s 后 emit 一次(mouseleave 清 timer) | "你在这幅画上多看了一会儿" |
| `input_dwell_without_submit` | React hook 内状态机:type ≥ N 字 → 闲置 ≥10s → 清空未提交 | 犹豫 / 欲言又止 |
| `focus_no_interaction` | focus 状态下 mouse/key 都不动 ≥3min,emit 一次;需一次新交互重新 arm | 有别于 blur:她在场,你也在,只是安静 |

## 6. BehavioralFeatures (delta: 10 → 15)

```ts
// perception/aggregator.ts
export type BehavioralFeatures = {
  /* ...existing 10 fields unchanged... */

  /** 窗口内 scroll 事件总数(所有 container 合计) */
  scrollEvents: number;

  /** 窗口内 hover_dwell 触发次数(≥3s 的停留计一次) */
  hoverDwellCount: number;

  /** 窗口内 hover_dwell 停留时长总和,ms */
  totalHoverDwellMs: number;

  /** 输入后放弃的次数(打字 → 停 → 清空未发) */
  abandonedInputs: number;

  /** focus_no_interaction 事件累积的静默时长,ms */
  focusIdleMs: number;
};
```

**跳过的细分维度**(信号密度不够,先粗):
- scroll 方向 up/down/mixed 分布
- hover 目标(album_cover / small_note / trace_strip)分布
- totalAbandonedChars(count 已能表达犹豫强度)

## 7. Rules (delta: 5 → 8)

```ts
// perception/RulePerceptionAgent.ts (buildRules delta)
{
  name: "attentive_hover",
  test: (f) =>
    f.hoverDwellCount >= t.hoverDwellCountThreshold ||
    f.totalHoverDwellMs / f.windowMs > t.hoverDwellRatioThreshold,
  pad_bias: { p: 0.1, a: 0.05, d: 0 },
  confidence: 0.4,
  reason: "hover dwell suggests attention to ambient",
},
{
  name: "hesitant_input",
  test: (f) => f.abandonedInputs >= t.abandonedInputsThreshold,
  pad_bias: { p: -0.1, a: -0.1, d: -0.15 },
  confidence: 0.5,
  reason: "typed-then-discarded suggests hesitation",
},
{
  name: "quiet_presence",
  test: (f) =>
    !f.isBlurred &&
    f.focusIdleMs / f.windowMs > t.quietPresenceRatioThreshold &&
    f.activeMs / f.windowMs < 0.1,
  pad_bias: { p: 0.05, a: -0.2, d: 0 },
  confidence: 0.6,
  reason: "in the room, listening — quiet presence",
},
```

**新增 4 个 tuning key**(默认值 + Reflect 可 ±50% 调):

| Key | 默认值 | ±50% 后范围 |
|---|---|---|
| `hoverDwellCountThreshold` | 2 | [1, 3] |
| `hoverDwellRatioThreshold` | 0.15 | [0.075, 0.225] |
| `abandonedInputsThreshold` | 2 | [1, 3] |
| `quietPresenceRatioThreshold` | 0.5 | [0.25, 0.75] |

**信号哲学**:
- **`quiet_presence` 是核心「禅」信号**——低 arousal + 微正 pleasure,让 CompanionAgent 更倾向 `needed_shift:陪着` 而非 `打断`
- `hesitant_input` 触发 p−/a−/d− 三维同下——CompanionAgent 收到这样的 bias 更容易选温柔安静的曲目
- `attentive_hover` 用 OR 门,任一维度触发即可(短暂但深度的凝视 = ratio 高;或多次浅停留 = count 高)

## 8. LLM Prompt Coarsening

原则:**只有新维度粗化,老维度保持数值**(避免破坏 LLMPerception 已经磨合的模式)。

```ts
// perception/coarsening.ts (new)
export type CoarseLevel = "low" | "medium" | "high";
export type HesitationLevel = "none" | "some" | "many";

export type CoarseSignals = {
  hover_attention: CoarseLevel;
  input_hesitation: HesitationLevel;
  quiet_presence: CoarseLevel;
  scroll_activity: CoarseLevel;
};

export function coarsen(f: BehavioralFeatures): CoarseSignals {
  return {
    hover_attention: bucket(f.hoverDwellCount, [2, 5]),        // 0-1/2-4/5+
    input_hesitation: bucketHesitation(f.abandonedInputs),      // 0/1-2/3+
    quiet_presence: bucket(f.focusIdleMs / f.windowMs, [0.2, 0.5]),
    scroll_activity: bucket(f.scrollEvents, [3, 10]),
  };
}
```

LLMPerception prompt input:
```json
{
  "features": { /* 老 10 维,数值,不变 */ },
  "signals": {
    "hover_attention": "medium",
    "input_hesitation": "some",
    "quiet_presence": "high",
    "scroll_activity": "low"
  }
}
```

**perception_audit 存的是什么**:
- `features_json` → 完整 15 维数值,本地永远不出去
- `bias_json` → PerceptionBias 结果
- LLM 只在 opt-in && 本 tick 走 llm 分支时被调用,收到的是 `features + signals`,粗化只在过 network 前发生

## 9. Install / Trigger Layer

**`install.ts` 集中管**:

| Event | 挂载方式 |
|---|---|
| `scroll` | `document.addEventListener('scroll', ..., {capture:true, passive:true})` + target `[data-lyra-scroll]` attr 查 container 名,per-container throttle 500ms |
| `hover_dwell` | `document.addEventListener('mouseenter/mouseleave', ..., {capture:true})` + target `[data-lyra-hover]` attr 查 target 名,per-target setTimeout 3000ms,超时才 emit,mouseleave 清 timer |
| `focus_no_interaction` | 现有 focus/blur/mouse/key listener + install.ts 内部 `lastInteractionAt` state + 每 30s poll 检查 focus && !blurred && now - lastInteractionAt > 180000 && !alreadyFiredThisIdle。触发后 arm 需一次新交互重新武装 |

**React 侧只贴 attribute**(零逻辑):

```tsx
<div data-lyra-scroll="data_explorer" ...>  {/* DataExplorer 外壳 */}
<div data-lyra-scroll="roadmap" ...>         {/* RoadmapBoard 外壳 */}
<div data-lyra-hover="album_cover" ...>       {/* home/AlbumCover 根 */}
<span data-lyra-hover="small_note" ...>       {/* home/SmallNote */}
<div data-lyra-hover="trace_strip" ...>       {/* home/TraceStrip */}
```

**`useInputDwellBus(bus)` hook**(new `perception/useInputDwellBus.ts`):

BottleInput/HomeInput 内部状态机:

```
IDLE ──keydown w/ chars>0──▶ TYPING (start dwellTimer 10s)
TYPING ──keydown──▶ TYPING (reset timer, track chars)
TYPING ──timer expires──▶ DWELLING (charsAt, dwellStart)
DWELLING ──keydown──▶ TYPING
DWELLING ──input cleared (value === "")──▶ emit input_dwell_without_submit → IDLE
TYPING ──submit──▶ IDLE (no emit)
```

hook 通过 DI 拿 bus,测试友好。放 hook 而非 install.ts 是因为 input dwell 依赖 controlled input value 才能判"是否清空"。

## 10. Testing (~14 new cases)

| 文件 | 新增覆盖 |
|---|---|
| `events.test.ts` | +1:4 新 kind 都能 emit/recent 里拿回 |
| `aggregator.test.ts` | +4:各新维度独立正确;+1:老维度不受新事件干扰(回归) |
| `RulePerceptionAgent.test.ts` | +3:3 条新 rule 各自触发/不触发;+1:多条同时触发时置信加权 |
| `coarsening.test.ts`(new) | +5:每档边界值 + 极端(NaN、0 windowMs) |
| `LLMPerceptionAgent.test.ts` | +1:新 signals 段进入 prompt payload |
| `install.test.ts` | +3:scroll capture / hover_dwell setTimeout / focus_no_interaction arm 逻辑 |
| `useInputDwellBus.test.tsx`(new) | +3:submit 无 emit / dwell + clear 有 emit / dwell + resume 无 emit |
| `tuning.test.ts` | +1:4 个新 threshold key 走 clamp |

## 11. Deployment & Rollout

- **Migration**: 不需要。`perception_audit.features_json` 与 `soul_perception_tuning` 都是 JSON blob,直接扩形状
- **Feature flag**: 不需要。Perception 层本身在 Settings 就是 opt-in;新事件默认全启用
- **UI 变化**: 零。唯一 DOM 变化是 5 处 `data-lyra-*` attribute
- **老快照兼容**: RulePerceptionAgent 里 `f.hoverDwellCount ?? 0` 兜底;coarsening 里 `f.focusIdleMs ?? 0`
- **Coarsening 无条件启用**: 即使用户开 LLMPerception,也一定过粗化才发出去

## 12. Success Criteria

1. **测试**: 639+ vitest / 33+ cargo / typecheck 0 保持(现有 625 + 14 新)
2. **UI 视觉零变化**: `data-lyra-*` attribute 不影响样式
3. **手工验证**: 开发环境 Settings → Perception on(rule 档),连续 3min 不动,查 Data Explorer 感知审计 tab,应看到 `quiet_presence` bias 触发
4. **保持哲学**: 5 分钟正常使用后,perception_audit 里不应出现任何"侵犯感"审计条目;hover_dwell 只对 3 个氛围元素,不对文本内容;LLM 输出的 signals 段是级别不是数值

## 13. Out of Scope (Sprint 14+ 或永不)

- 播放控制事件(pause / seek / volume)——等相关 UX 上再补
- selection / copy / typing burst→delete 追踪——与 PRIVACY 承诺冲突,永不做
- Data Explorer 每个 tab 的滚动细分——先粗
- hover target 分布进 Aggregator——Reflect 观察出模式后再谈
- 音量事件——当前 UI 无音量控件
- 广谱事件走"全部数值"进 network——只允许粗化后走

---

**版本影响**: v0.2.z 的一个 Sprint,不改 v0.3 计划。落地后 `current-implementation.md` §4.7 感知层从 5 rule 升到 8 rule、10 维升到 15 维,§7 defer 清单移除"感知广谱事件"条目。
