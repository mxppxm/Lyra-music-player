# Lyra 音乐版权与曲库策略

> 姊妹文档:[`promotion-strategy.md`](./promotion-strategy.md) · [`business-model.md`](./business-model.md)
>
> Between the things you say. 未成曲调先有情。

本文件解决一个具体问题:**Lyra 的曲库从哪来,版权怎么办,和网易云 / QQ 音乐 / Spotify 会不会打架**。

结论先行:

> **Lyra 不占有音乐,只陪你听你的音乐。**
> 用户带自己的曲库来,Lyra 只带「一封信、一首主题曲、几段 CC0 氛围声」。

---

## 0. 三条硬约束

和 promotion-strategy 的三条硬约束平行:

1. **Lyra 分发的音频文件必须版权干净** —— 每一首都能指到具体 license,不允许「灰色区」。
2. **Lyra 不做流媒体抓取** —— 不接网易云 / QQ / Spotify 的抓流接口,和 local-first 定位一致。
3. **用户导入的音乐,版权责任在用户** —— Lyra 的定位是播放器,类似 VLC / iTunes,不为用户导入的内容背书,也不在文案中鼓励盗版。

---

## 1. 曲库路径选择

三种技术路径,Lyra 只走 A + 极小的 B:

| 路径 | 描述 | 版权风险 | Lyra 选择 |
|---|---|---|---|
| **A. 用户本地导入** | 用户自己的 mp3/flac/m4a,Lyra 扫描、索引、播放 | 用户端 | ✅ **主线** |
| **B. Lyra 内置精选曲库** | 打包极少量曲子随 app 发布 | 分发者(你)承担 | ⚠️ **仅 CC0 / 自制**,量 ≤ 10 首 |
| **C. 第三方流媒体 API** | 接 Spotify / QQ / 网易官方 SDK | 平台合规 + 商用授权 | ❌ **不做**,与「数据不离开你的机器」矛盾 |

### 为什么彻底放弃 C

- Spotify Web API 明文禁止在非 Spotify 品牌 UI 里嵌入播放
- QQ / 网易云开放平台的商用授权是「按次采买 + 每月对账」,和 micro-solo project 的成本结构不匹配
- 一旦接了 C,「No cloud, no telemetry」就是谎言,Lyra 的品牌纯度直接归零

---

## 2. 免费 / 无版权争议的音乐来源

按「授权明确度」从高到低。**Lyra 内置曲库(路径 B)只能从前两档取**。

### 2.1 公有领域(Public Domain)

- **Musopen** —— 古典音乐,录音 + 乐谱都是 PD/CC
- **IMSLP** —— 古典乐谱(注意:乐谱 PD 不等于录音 PD,录音师有邻接权)
- **Internet Archive → Live Music Archive** —— Grateful Dead 等允许流通的现场录音
- **Wikimedia Commons → Audio** —— 严格 CC,元数据规范

### 2.2 CC0 / CC-BY(可商用,注意署名义务)

- **Free Music Archive (FMA)** —— 按 license 过滤,元数据清晰
- **ccMixter** —— remix 友好,适合做二次创作
- **Jamendo** —— 独立音乐人平台,分免费 / 商用许可两档,商用需付费
- **Bensound / Audionautix / Kevin MacLeod (incompetech)** —— BGM 标配,多为 CC-BY
- **Pixabay Music / Uppbeat / Mixkit** —— 面向视频创作者,授权友好

### 2.3 平台自制素材库(**不能二次分发**,只能自己用)

- **YouTube Audio Library** —— 授权明确但**禁止再分发**,不能进 Lyra 内置曲库
- **Epidemic Sound / Artlist / Musicbed** —— 订阅制,授权只覆盖订阅者本人的作品

### 2.4 中文语境(空隙大,慎选)

- 早年 **5sing** 原创区、**网易云音乐人「音乐授权」页** 有 CC 曲目,但需**逐首**看 license
- **网易云 / QQ 音乐开放平台** 的商用授权是「按次采买」,不免费
- **抖音 / 快手 商用曲库**:仅限该平台内容创作,不适用于第三方 app 分发

---

## 3. 自制曲库的三条路线

### 3.1 收集 CC0 / CC-BY,做「Lyra 启动包」

- 每首标注 `license`, `attribution`, `source_url` 三个字段
- 在 `About` 页 / `credits.md` 里逐条列出 attribution(CC-BY 强制要求)
- 音频文件不塞进主 bundle,走 GitHub Release / CDN,首次启动按需下载
- 建议规模:**3–5 首**,超过就变成「AI 精选电台」,偏离 Lyra 的克制感

### 3.2 自己录 / 委托朋友录(**首选**)

- 词曲 + 邻接权都在你(或合作者)手上,最干净
- 和 Lyra「一段关系」的调性最契合
- 建议做法:
  - 找 1–2 位愿意合作的独立音乐人
  - 录 3–5 首「Lyra 专属氛围曲」——比如「Sunday letter theme」「深夜独处 loop」
  - 签一份 simple license:允许 Lyra 分发,音乐人保留其他一切权利,不排他
- 这 3–5 首会成为最好的传播资产(promotion-strategy 里视频号短片的 BGM 就用这个)

### 3.3 AI 生成(**短期不用**)

- **2026 年当前判例走向**:RIAA v. Suno / Udio 尚未终审,Meta MusicGen 亦有类似诉讼
- 授权档位对比:
  - **Suno 免费档**:Suno 保留权利,**不能商用**
  - **Suno 付费档**:用户拥有商用权,但不能声明「原创」
  - **MusicGen 开源**:自己跑,产物版权大概率归你,但 prompt 里带艺人风格词,仍有间接侵权风险
- 结论:**AI 生成不进 Lyra 曲库**。风险 / 品味都不划算,和「反 AI 喧嚣」定位冲突。

**推荐组合**:3.2 打底(1–2 首主题曲) + 3.1 补量(3–5 首 CC0 氛围曲)。3.3 保留观察。

---

## 4. 与网易云 / QQ / Spotify 的版权边界

先把「三种权利」分开看,90% 的模糊问题都源于混淆这三者:

| 权利 | 归属 | 踩到会怎样 |
|---|---|---|
| **词曲版权** (composition) | 词曲作者 / 版权代理 | 侵权最上游,翻唱翻录都要授权 |
| **录音邻接权** (sound recording) | 唱片公司 / 发行方 | 抓平台 stream 就是侵这个 |
| **平台独家发行权** | 网易云 / QQ 等 | 只在该平台内独占,**不阻止**你从其他合法来源拿同一首 |

### Lyra 具体行为对照表

| 行为 | 判断 | 说明 |
|---|---|---|
| 用户自己导入 mp3(哪怕来自灰色渠道) | ✅ **Lyra 无责** | 定位同 VLC / iTunes / foobar2000 |
| Lyra 内嵌网页 / API 抓取网易云 / QQ 音频流 | ❌ **直接侵权** | 违反平台 ToS + 邻接权,历史案例:「音乐雷达」被诉 |
| Lyra 打包分发一首网易云独家曲目 | ❌ **侵权** | 独家 ≠ 无版权,反而更严格 |
| Lyra 打包 CC0 / 公版曲子 | ✅ **合法** | 主线做法 |
| Lyra 引导用户去 QQ / Spotify 官方 app 播放 | ✅ **加分项** | 生态互补,不冲突 |
| Lyra 自己录一首歌并分发 | ✅ **完全合法** | Lyra 就是版权人 |
| Lyra 用 Suno 付费档生成并分发 | ⚠️ **可行但不推荐** | 授权 OK,品牌调性不 OK |
| Lyra UI 嵌入**完整**歌词 | ⚠️ **有风险** | 歌词属词曲版权,网易云 / 音乐先声等有独立许可 |
| Lyra UI 嵌入 1–2 句歌词片段 | ⚠️ **fair use 空间较大** | 但仍有风险,建议只在 Lyra 自己写的 letter 中引用,且注明来源 |

### 关于「nano」

用户提到的 **nano** 大概率指:

- **小米小爱 / Nano AI 助手**:硬件端调用平台 API,和 Lyra 并列,不冲突
- **海外 Nano 类产品**:同上,不构成版权主体

**不用把这些当版权对手**。Lyra 的版权对手只有一个:**你自己内置的每一首曲子的权利人**。用户导入的曲库,平台对 Lyra 无追诉权。

---

## 5. 用户可见声明(建议放在 Settings → About)

```
Lyra 不提供商业曲库。请导入你合法持有的音乐。

Lyra 自带 5 首曲子:
- 3 首来自 Free Music Archive,CC-BY 授权,作者见 credits.md
- 2 首为 Lyra 自制,与 [音乐人姓名] 合作录制,版权共有

Lyra 不上传、不分析、不上传任何音频文件到云端。
所有播放记录、歌词记忆、情感状态,只存在你的机器上。
```

---

## 6. 落地 checklist(工程侧)

- [ ] `libraryRepo` 增加字段:`license`, `attribution`, `source_url`, `is_builtin`
- [ ] `libraryScan` 对 `is_builtin=true` 的曲目走独立路径,不走用户 folder 扫描
- [ ] 首次启动流程:提示用户「选择你的音乐文件夹」,不弹「立即下载 X 万首」这类
- [ ] `docs/credits.md` 列出所有内置曲目的 attribution
- [ ] README 增加 "Music & Licensing" 段,内容压缩自本文件的 §0 + §4 结论
- [ ] Settings → About 页展示上文 §5 的声明

---

## 一句话判断线

每次要把一首曲子塞进 Lyra 内置曲库前,自问一句:

> **「如果这首歌的权利人明天来邮件,我能不能 5 分钟内把 license 文件发给他?」**

如果不能,就不要塞。
