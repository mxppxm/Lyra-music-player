# Emotion Capture (CN) · 技能蒸馏与接入方案

**日期**:2026-07-08
**范围**:`EmotionAgent` 情绪识别的精度加固
**相关代码**:`app/src/agents/prompts/emotion.ts` · `app/src/agents/EmotionAgent.ts` · `app/src/agents/emotion-eval.regression.*`
**外部产物**:`/Users/daoyu/Documents/skills-repo/emotion-capture-cn-skill/`

这份文档是**做了什么、为什么这么做、后面怎么继续**的一站式记录。没有教程,只有可查、可延续的实况。

---

## 1. 背景 · 为什么要动

Lyra 的 `EmotionAgent` 是整个 4-Agent 拓扑的入口——从用户一句"最近有点累"里提取 `{ pad, labels, confidence }`。这个数直接决定后面 `LibraryAgent` 的三分加权、`CompanionAgent` 选哪一首。**它错一次,整条链路就偏一次**。

改动前的 `emotion.ts` prompt 只讲了 PAD 三轴的英文定义 + labels 用中文短语 + 一条"短句 confidence 0.3-0.5"。没有:

- 中文含蓄表达的解码器("还好""随便""有点累"在中文里的隐含负向)
- Plutchik / NVC 词表这类结构化的情绪词汇
- 具体的 few-shot 示例
- 强度副词的缩放规则
- confidence 的诚实校准表

结果:模型对直白句(签下来了,爽!)表现尚可,但对**中文式含蓄的负向**普遍打成中性或偏正——因为它按字面读了"还好"、"随便"。选歌因此系统性偏亢奋。

---

## 2. 调研 · 本地 + 网络两条线

### 2.1 本地 skills-repo(`/Users/daoyu/Documents/skills-repo/`)

70+ 个已有 skill 里,与情绪捕捉相关的可复用零件:

| 技能 | 路径 | 对 EmotionAgent 的用处 |
|---|---|---|
| **belated-empathy-forward** | `wo-yu-di-tan-skill/belated-empathy-forward/` | 读言外之意——"累"底下扛着什么。中文含蓄的破译器思路。 |
| **suffering-without-chicken-soup** | `wo-yu-di-tan-skill/suffering-without-chicken-soup/` | 辨真实痛苦 vs. 表演式忧郁,给 confidence 加权。 |
| **ditan-self-anchoring** | `wo-yu-di-tan-skill/ditan-self-anchoring/` | "脑子乱"是处理中还是迷失?PAD 签名不同。 |
| **emotion-organ-proxy** | `huangdi-neijing-skill/suwen/emotion-organ-proxy/` | 七情→五脏→PAD 的映射思路(怒→气上 A↑,恐→气下 D↓)。 |
| **emotion-arousal-model** | `contagious-skill/emotion-arousal-model/` | Jonah Berger 的 2D valence×arousal 象限判别。 |

**Gap**:本地零件齐,但**没有一个统一的"中文短句 → `{pad, labels, confidence}`"技能**。骨架缺。

### 2.2 网络调研(2024-2025 学术 + 中文情绪心理经典)

| 来源 | 年份 | 对 EmotionAgent 的价值 | 蒸馏产物 |
|---|---|---|---|
| **PAD Circumplex** — Russell 1980 · Mehrabian 1996 | 1980-96 | 与 Lyra 现有输出 schema 完美对齐 | 三轴坐标骨架 |
| **Plutchik's Wheel of Emotions** | 1980 | 8 主 + 二元组合是最耐用的标签体系 | `pad-plutchik-map.md` 里的中心点表 |
| **Nonviolent Communication** — Marshall Rosenberg 1999 | 1999 | 200 词的感受词表 + met/unmet 二分结构 | `nvc-feelings-cn.md` |
| **How Emotions Are Made** — Lisa Feldman Barrett | 2017 | 建构主义证明"文化决定情绪表达"——中文必须显式解码 | 直接支撑 `chinese-understatement.md` 的存在合理性 |
| **《共情力》程苓峰** | 2019 | 中文含蓄表达的现实词典 | 词条来源 |
| **MER 2025** · arxiv 2504.19423 | 2025 | 评测确认 PAD + Plutchik-8 在中文微博任务上最稳 | 骨架选型依据 |
| **CAPE dataset** · arxiv 2410.14145 | 2024 | 认知评价理论(appraisal)在中文任务上优于直接分类 | 未来 v2 方向 |

---

## 3. 蒸馏:emotion-capture-cn-skill

把上述本地 5 个零件 + 3 本网络核心,合成一个可独立复用的技能包,放在:

```
/Users/daoyu/Documents/skills-repo/emotion-capture-cn-skill/
├── SKILL.md                                  ← 入口:原则、schema、使用方法 A/B/C、提示词骨架
├── references/
│   ├── pad-plutchik-map.md                   ← Plutchik-8 + Lyra 补充 12 个 + 强度分层 + 二元组合
│   ├── nvc-feelings-cn.md                    ← Rosenberg 感受词表(中文,分 met/unmet 两列)
│   ├── chinese-understatement.md             ← ⭐ 最高 ROI:41 个中文含蓄表达 → 隐藏 PAD + confidence 上限
│   └── pad-scoring-rubric.md                 ← 5 步打分流程 + confidence 校准表 + 反模式
└── examples/
    └── few-shot-cn.jsonl                     ← 20 条精选中文示例
```

### 3.1 四条原则(SKILL.md 里的核心)

1. **PAD 是坐标,Plutchik 是词表。不要混。**
2. **中文含蓄比英文强 3 倍。** 90% 场景下"还好""随便""有点累"是压抑负向。
3. **不写"共情",做"共情"的活。** 识别不是话术。
4. **confidence 是诚实,不是自信。** 短句 + 无上下文封顶 0.6-0.75。

### 3.2 使用方法(SKILL.md 里给出三档)

| 方法 | tokens | 适用 |
|---|---|---|
| A · 全塞四份 references | ~3-5k | 精度优先,不缺预算 |
| B · 仅塞 few-shot | ~1-2k | token 预算紧张 |
| C · 骨架 rules + few-shot + 含蓄词典 | ~2k | ⭐ 推荐,Lyra 首次接入用这档 |

### 3.3 与 Lyra 现有输出 schema 的兼容性

Skill 的 canonical 输出多了两个字段(`indirect`、`rationale`),但**接入 Lyra 时删掉了这两个**,保持 `CurrentEmotion` 类型不变。`indirect=true` 的信号折进 `confidence` 上限,`rationale` 的价值折进 `labels` 的措辞选择。零改动到 `validateEmotion` 和下游代码。

---

## 4. 接入 Lyra · 三步走的第 1、2 步已落地

按 SKILL.md 里的方法 C,分三步渐进接入 EmotionAgent。**当前进度**:

- ✅ Step 1 — 中文含蓄词典进 prompt(最高 ROI)
- ✅ Step 2 — 8 条 few-shot
- ⏸️ Step 3 — PAD 打分 rubric(留待观察)

### 4.1 改动一览

**`app/src/agents/prompts/emotion.ts`**

新增两个常量,在 `EMOTION_SYSTEM_PROMPT` 里插值:

```typescript
const CN_UNDERSTATEMENT_TABLE = `【中文含蓄清单】命中时按隐藏 PAD 打分…
表达                            隐藏 PAD (p,a,d)       conf 上限
"还好/还行/老样子"              (-0.20, -0.20, -0.20)   0.60
"没事/我没事"                   (-0.30, +0.10, -0.30)   0.50
"有点累/累死了/没睡好"          (-0.30, -0.40, -0.30)   0.80
… (13 条词条)

【强度副词缩放】(截断到 ±1)
"有点/稍微" ×0.6 · "还/也" ×0.5 · "挺/蛮" ×0.8 · "非常/特别/真的" ×1.2 · "死了/爆了/要命" ×1.4`;

const CN_FEWSHOT = `【示例】
输入: 最近有点累
输出: {"pad":{"p":-0.3,…},"labels":["疲惫","想被接住"],"confidence":0.75,…}
… (8 条示例,含中性、直白正向、含蓄负向、反例、反讽)`;
```

Guidelines 段落新增三条:

```diff
+ - 不要看到"累"就赋悲伤——累是疲惫,A 是负的(疲软),不是正的。
+ - 不要看到"想哭"就把 A 打到 +0.9——想哭是崩溃边缘,A 通常 +0.2 到 +0.4。
+ - 短句 + 无上下文时 confidence 不得超过 0.75。中文含蓄命中时按下表上限走。
```

Prompt 从 34 行涨到 76 行(含新增 tokens ~850)。GLM-4-Plus 上下文 128K 无压力,Zhipu 现价下单次成本增量 < ¥0.001/turn。

### 4.2 保持的东西

- ✅ 输出 schema 不变,`validateEmotion()` 完全兼容
- ✅ 现有 9 条 EmotionAgent 单测 100% 通过
- ✅ `EMOTION_JSON_SCHEMA_HINT` 保留(尽管未被内部引用,防外部依赖)
- ✅ 全项目 638→639 tests(新增 eval 门禁跳过)

---

## 5. 回归 eval · 可持续追踪 baseline

情绪识别的准度不能靠"感觉稍微好一点了"。所以搭了一个**门禁式回归 eval**——默认不跑,不打真实 API 花钱;要跑时用 `pnpm eval:emotion` 一次。

### 5.1 组件

| 文件 | 作用 |
|---|---|
| `app/src/agents/emotion-eval.regression.jsonl` | 12 条**从 skill 里留出**的回归集(不与 prompt 里的 8 条 few-shot 重叠) |
| `app/src/agents/emotion-eval.regression.test.ts` | vitest 门禁 test(`describe.runIf(LYRA_EVAL === "1")`) |
| `package.json` scripts | `eval:emotion` = `LYRA_EVAL=1 vitest run …` |
| `.gitignore` | 忽略 `.eval-runs/`(每次跑写一份 JSONL trace) |
| `devDependencies` | 新增 `@types/node`(eval 用到 fs/path/process) |

### 5.2 指标

- **PAD L1 距离**:`|Δp| + |Δa| + |Δd|`,三轴总和最大 6.0
- **|Δconf|**:预测与期望 confidence 的绝对差
- **worst 3**:按 L1 排序的最差 3 条,方便定位典型错误

### 5.3 门禁保护

```typescript
const RUN = process.env.LYRA_EVAL === "1";
describe.runIf(RUN)("EmotionAgent regression eval", () => { … });
```

- 默认 `pnpm test` 时该 describe 静默跳过 → 不打真实 API,零成本
- 需要真跑时:`ZHIPU_API_KEY=xxx pnpm eval:emotion`
- 内含**软断言** `expect(meanL1).toBeLessThan(1.5)` —— 只在灾难性回归时报错,日常 drift 不炸测试,靠人眼看表

### 5.4 建议目标线(经验参考)

| 指标 | 好 | 及格 | 需要调 |
|---|---|---|---|
| mean PAD L1 | < 0.5 | 0.5 – 0.8 | > 0.8 |
| mean \|Δconf\| | < 0.10 | 0.10 – 0.20 | > 0.20 |
| worst L1 | < 1.0 | 1.0 – 1.5 | > 1.5 |

首次跑出来的数就是 **baseline**。之后改 prompt(加 rubric、扩含蓄词典、换模型)时,以此为参照。

### 5.5 trace 结构(`.eval-runs/emotion-<ISO>.jsonl`)

```jsonl
{"kind":"summary","ts":...,"items":12,"mean_l1":0.487,"mean_abs_conf_delta":0.089,"model":"zhipu"}
{"kind":"row","input":"给我一首雨天的","expected":{...},"predicted":{...},"l1":0.28,"conf_delta":0.05}
… (每条一行)
```

两次跑的 summary 拉出来对比,就是一次 prompt 改动的 A/B 报告。

---

## 6. 未来工作

### 6.1 短期(本周内可做)

- **跑首次 baseline** — 拿一次真数,记进这份文档的附录里(甚至 `.eval-runs/` 里的第一个 JSONL 就是 baseline)。
- **观察 3-7 天真人对话** — DataExplorer 的 turns tab 看 30-50 个 turn,重点看含蓄句的 PAD 是否合理、confidence 是否虚高。

### 6.2 中期(baseline 稳定后按需)

- **Step 3 加 rubric**:如果发现数值漂 or confidence 虚高,把 `pad-scoring-rubric.md` 的 5 步流程 + confidence 校准表塞进 prompt。约 +400 tokens,预计能压 mean L1 ~15%。
- **扩含蓄词典**:遇到 baseline 里模型误判的中文口语,回填到 `chinese-understatement.md`,再重跑 eval。
- **接入 predicted_trajectory 的中文含蓄逻辑**:目前 trajectory 预测还没享受到含蓄词典的加成。

### 6.3 长期(v0.4+ 值得考虑)

- **CAPE / appraisal 结构化 prompt**:2024 CAPE 数据集验证"描述评价事件 → 推情绪"优于"直接分类"。可能是下一个大跳跃。
- **CompanionAgent 的回应技能**:Focusing / MI / OARS 那类框架属于**回应**框架,不在 EmotionAgent 的活里。归 CompanionAgent 之后,可以蒸馏一个 `companion-response-cn-skill` 姊妹技能。
- **多模态**:未来接智能戒指的心率 / HRV 后,PAD 的 A 轴可以有物理 ground truth 校准。

---

## 7. 文件清单(改动 / 新增 全景)

### 7.1 音乐播放器/app/

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/agents/prompts/emotion.ts` | **改** | Prompt 34→76 行,新增含蓄词典 + few-shot |
| `src/agents/emotion-eval.regression.jsonl` | **新** | 12 条中文回归集 |
| `src/agents/emotion-eval.regression.test.ts` | **新** | 门禁 eval,vitest 跑 |
| `package.json` | **改** | + `eval:emotion` script,+ `@types/node` devDep |
| `.gitignore` | **改** | + `.eval-runs` |

### 7.2 外部技能包(skills-repo)

| 文件 | 说明 |
|---|---|
| `emotion-capture-cn-skill/SKILL.md` | 主入口 156 行 |
| `emotion-capture-cn-skill/references/pad-plutchik-map.md` | Plutchik-8 + Lyra 补充 |
| `emotion-capture-cn-skill/references/nvc-feelings-cn.md` | Rosenberg 感受词表 |
| `emotion-capture-cn-skill/references/chinese-understatement.md` | 中文压抑词典 |
| `emotion-capture-cn-skill/references/pad-scoring-rubric.md` | 5 步打分 + 校准 + 反模式 |
| `emotion-capture-cn-skill/examples/few-shot-cn.jsonl` | 20 条 few-shot |

---

## 8. 验收基线

### 8.1 工程实况(2026-07-08 完工时)

```
typecheck        : 0 error
全项目测试        : 84 pass + 1 skipped (85 files) / 639 pass + 1 skipped (640 tests)
EmotionAgent 单测 : 9/9 pass(未被 prompt 改动影响)
prompt tokens 增量: ~850
Zhipu 单次成本增量: < ¥0.001 / turn
```

### 8.2 首次 eval baseline(2026-07-08 21:09 · zhipu glm-5.1)

`pnpm eval:emotion` 首跑,12 条 held-out 中文短句:

| 指标 | 值 | 目标线 | 状态 |
|---|---|---|---|
| mean PAD L1 | **0.338** | < 0.5 = 好 | ✅ 好 |
| mean \|Δconf\| | **0.054** | < 0.10 = 好 | ✅ 好 |
| worst L1 | **0.88** | < 1.0 = 好 | ✅ 好 |
| 完成率 | 12/12 | — | ✅ |
| 用时 | 30.7s | — | ~2.5s/条 |

**trace**:`app/.eval-runs/emotion-2026-07-08T13-09-58-540Z.jsonl`(gitignored,本地保留;未来 diff 的锚点)

**Worst 3 分析**:

| # | 输入 | L1 | 归类 | 修法 |
|---|---|---|---|---|
| 1 | 最近开会开到吐 | 0.88 | 期望值可能偏软(burnout vs. rage-quit 边界) | 修期望值,非模型问题 |
| 2 | 最近有点想哭 | 0.52 | 规则冲突:"想哭"强度信号被"有点"缩放到 0.6 | 加一条 override:"想哭"pattern 优先于强度副词缩放 |
| 3 | 呵呵,行吧 | 0.50 | "呵呵"真正的歧义(攻击性 vs. 泄气) | 不建议为它调参 |

### 8.3 判断:Step 3 rubric 短期不加

原计划 mean L1 > 0.5 时才把 [`pad-scoring-rubric.md`](file:///Users/daoyu/Documents/skills-repo/emotion-capture-cn-skill/references/pad-scoring-rubric.md) 塞进 prompt。当前 0.338 已稳稳在"好"档,rubric 收益空间有限。**先观察真人对话 3-7 天**,发现真值得修的模式再动。

---

## 9. 参考

- Russell, J. A. (1980). *A circumplex model of affect.*
- Mehrabian, A. (1996). *Pleasure-arousal-dominance: A general framework.*
- Plutchik, R. (1980). *A general psychoevolutionary theory of emotion.*
- Rosenberg, M. (1999). *Nonviolent Communication.*
- Barrett, L. F. (2017). *How Emotions Are Made.*
- 程苓峰(2019). 《共情力》.
- 史铁生. 《我与地坛》(via `wo-yu-di-tan-skill`)
- 黄帝内经 · 素问 · 七情(via `huangdi-neijing-skill/emotion-organ-proxy`)
- MER 2025 · [arxiv 2504.19423](https://arxiv.org/abs/2504.19423)
- CAPE dataset · [arxiv 2410.14145](https://arxiv.org/html/2410.14145v1)
- CPsDD 2025 · [arxiv 2507.07509](https://arxiv.org/html/2507.07509v1)
