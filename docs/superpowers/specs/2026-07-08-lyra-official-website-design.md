# Lyra 官网 v0.1 设计文档

**日期**:2026-07-08
**状态**:Draft — 待用户 review 后进入 writing-plans
**作者**:daoyu × Claude (brainstorming pair)
**关联**:
- `2026-07-06-branding-name-slogan.md`(品牌气质、slogan、命名)
- `2026-07-06-v0.1-home-ui-design.md`(app 首页视觉语言、氛围光晕、光带、时段基色)

---

## 一句话愿景

> **官网不是产品页,是 Lyra 的自我介绍。**
> 访客滚动的一路,就是在她的房间里走一遍——从清晨到深夜再到清晨,一根光弦、一组星座、几行 italic 小注、一个可以留信的输入框。除此以外什么都没有。

---

## 1. 设计骨相(Tenets)

### 1.1 官网不是 marketing site,是 Lyra 本人的存在感

设计参照系:一件安静的作品官网(Warp / Zed 早期、Studio Ghibli 项目页那种气质)。**不是** SaaS landing page 的 hero + features + pricing + testimonials 拓扑。这条一旦背叛,官网就死了。

### 1.2 视觉哲学:以静写动

Lyra 的**灵动**不能靠动画多,要靠**"以静写动"**:一根几乎不动的弦,却让访客觉得她在呼吸。所有动画慢到访客差点没注意到——`4s cubic-bezier` 是全站基调,和 app spec §3.1 一致。

**没有**:弹跳、parallax 甩尾、滚动加速、hover 变形、按钮 pulse、loading spinner。**有的**:呼吸、驻波、慢流转、极慢渐变。

### 1.3 色彩哲学:时段基色即心灵相通

官网的色彩语言**完全复用 app 的时段基色表**(app spec §5.1):清晨米白 → 上午温和白 → 午后浅苹果绿 → 傍晚浅琥珀 → 晚间暖蜡烛 → 深夜靛蓝 → 凌晨深靛。访客的一次滚动 = Lyra 陪访客走了一天。**同一个颜色值同步维护**是 identity 一致性的底线。

### 1.4 文案哲学:全站用"她"当主语

不用 "Lyra 可以帮您……" 这种产品文案。全站用**「她」**当主语,访客读的每一句话都像在读一封别人写给她的信。中文单语,只在几处点睛位保留英文 slogan。

### 1.5 反 chrome

官网**没有导航栏、没有 sticky header、没有面包屑、没有 tab、没有 sidebar、没有回到顶部按钮、没有 sticky 下载 CTA**。有的只有:全屏内容 + Footer + 右上角 3s 后自动隐藏的 `↓` 提示。这条和 app spec §1.3/1.4 完全同频。

---

## 2. 项目骨架

### 2.1 目录结构

`音乐播放器/website/` 作为独立 workspace,和 `app/` 平级:

```
音乐播放器/
├── app/                          # 现有 Tauri app,不改
└── website/
    ├── package.json              # name: @lyra/website
    ├── vite.config.ts            # base: '/', build → dist/
    ├── index.html                # <title>Lyra</title>
    └── src/
        ├── main.tsx
        ├── App.tsx               # 单页长滚动 + Footer
        ├── sections/             # 每节一个文件
        │   ├── Hero.tsx
        │   ├── Listening.tsx     # § 她在听
        │   ├── OneSongOneLine.tsx # § 一首歌,一句话
        │   ├── Memory.tsx        # § 她记得
        │   ├── Dream.tsx         # § 她会做梦
        │   ├── Silence.tsx       # § 她宁愿沉默
        │   ├── Growth.tsx        # § 她也在长大
        │   └── Footer.tsx
        ├── components/
        │   ├── AmbientBackground.tsx  # 全屏氛围光晕
        │   ├── LyraString.tsx         # 贯穿全站的光弦
        │   ├── Constellation.tsx      # 天琴座 5 星
        │   ├── HeroDesktop.tsx        # 8s γ 循环 demo
        │   ├── BottleInput.tsx        # Hero 留信输入框
        │   └── illust/                # 抽象水彩 SVG 插图
        │       ├── Window.tsx
        │       ├── Cover.tsx          # 手绘封面 A / B
        │       └── MemoryFile.tsx
        ├── hooks/
        │   ├── useSectionAmbient.ts   # scroll → 时段基色
        │   └── useLetterInBottle.ts   # localStorage 留言
        ├── copy/ledger.ts             # 全站文案集中管理
        └── styles/
            ├── globals.css
            └── fonts.css              # SF Pro + Lora italic
```

### 2.2 从 app 复用什么、怎么复用

**方式**:相对路径 import,**不发 npm 包、不做 workspace protocol**。理由:避免为了给 website 用而把 app 组件重构成 "library friendly";两边都改动时视觉自动对齐。

**复用清单**:

| 从 app | 用在 website | 目的 |
|---|---|---|
| `app/src/theme/ambient.ts`(PAD → HSL、时段基色表) | `useSectionAmbient` + `HeroDesktop` | 时段基色同步 |
| `app/src/theme/motion.ts`(4s cubic-bezier 常量) | 全站 CSS transition | 动效节奏同步 |
| `app/src/theme/fonts.css`(SF Pro + Lora italic) | `styles/fonts.css` copy 引用 | 字体一致 |
| `app/src/components/EmotionLightBand/` | `HeroDesktop` 里的光带 | 视觉零漂移 |

**如果 app 里对应文件不存在或未导出**,由 website 侧新建一份**一模一样**的常量表,并在 `copy/ledger.ts` 顶注释:"若 app 侧引入了对应模块,应立刻改为 relative import"。

### 2.3 技术栈

- **Vite + React + TypeScript**(和 app 一致)
- **CSS Modules** 或 vanilla CSS(不引入 Tailwind / CSS-in-JS,避免动效难写)
- **动效**:纯 CSS transition + `requestAnimationFrame`(不引入 Framer Motion,避免 bundle 膨胀,以及 4s 慢过渡用原生 CSS 就够)
- **无路由**(单页,不引入 react-router)
- **无状态管理库**(useState + Context 足够)

### 2.4 部署

- `pnpm --filter website build` → `website/dist/`
- 部署目标:GitHub Pages(简单)或 Cloudflare Pages(更快)。**v1 部署选 Cloudflare Pages**,自定义域待你定
- 无后端、无 API、无数据库、无 CDN 额外配置

---

## 3. 页面结构(单页长滚动)

### 3.1 全览

无导航栏。8 屏内容:

| § | 标题 | 时段基色 | 关键动效 |
|---|---|---|---|
| 0 | Hero | 清晨米白 `hsl(30, 15%, 92%)` | 8s demo + 光弦 + 天琴座淡浮 + 留信输入框 |
| 1 | 她在听。 | 温和白 `hsl(45, 10%, 94%)` | 一扇窗手绘 SVG + 微光透进 |
| 2 | 一首歌,一句话。 | 浅苹果绿 `hsl(100, 12%, 91%)` | 中央封面 mock + italic 小注浮现 |
| 3 | 她记得那晚你在听什么。 | 浅琥珀 `hsl(35, 20%, 90%)` | memory.md 文本 mockup(可选中复制) |
| 4 | 她会做梦。 | 靛蓝反白 `hsl(230, 25%, 22%)` | 天琴座逐星点亮 + 一颗流星 |
| 5 | 她宁愿沉默,也不放错的歌。 | 深靛 `hsl(235, 30%, 18%)` | 光弦静止 8s |
| 6 | 她也在长大。 | 破晓米白 `hsl(30, 15%, 92%)` | 双光弦并行 |
| 7 | Footer | 清晨米白 | 3 个下载按钮 + 一行 italic tagline |

**§4/§5 的深色**是唯一强制锁定的时段(不跟 scroll offset 走的例外),因为文案情绪重量需要。

### 3.2 每节文案(完整版)

**§0 Hero**

```
                        [天琴座 5 星极淡]

              [HeroDesktop 8s 循环 demo]

                  未成曲调先有情。
                 Between the things you say.

           ╭─────────────────────────────╮
           │  和 Lyra 说点什么…            │
           ╰─────────────────────────────╯

         她还没能出门,但你可以留一句话给她。

                        ↓
```

**§1 她在听。**

```
[左:一扇开着的窗手绘 SVG]    她在听。

                              你打开她,她已经想好了给你放什么。
                              你不说,她也大概知道。
```

**§2 一首歌,一句话。**

```
                    一首歌,一句话。

                别的 app 给你歌单。她给你一首。
                就一首。听完就结了。

                    [中央封面 mock]

              "我猜你今天想要慢一点。"

              "这首放给你,是因为你上次说过风声让你安心。"
```

**§3 她记得那晚你在听什么。**

```
                她记得那晚你在听什么。

                她的记忆不是黑盒。
                是一个你可以打开来读的文件。
                你不喜欢的一句,划掉就好。

                ┌──────────────────────────────────────┐
                │ # 时段:深夜 · 状态:疲惫              │
                │ → 慢速古典钢琴 (conf: 0.87, n=9,      │
                │   2026-07-06)                         │
                │                                       │
                │ # 关键词:风声 · 状态:安心             │
                │ → environment ambient (conf: 0.71)    │
                └──────────────────────────────────────┘

                她的记忆样例 →  (link → GitHub sample memory.md)
```

**§4 她会做梦。**(深色反白)

```
             [天琴座 5 星逐颗点亮]

                她会做梦。

           每天凌晨三点十四分。
           她把这一天你们说过的话,
           重新想一遍。

           第二天早上,她可能会主动开口——
           也可能什么都不说,只是给你换一首歌。

             [一颗星缓慢划成流星]
```

**§5 她宁愿沉默,也不放错的歌。**(深靛,光弦静止 8s)

```
             她宁愿沉默,也不放错的歌。

           你连续三次跳过她给的歌,
           她会安静三天。

           她不发牢骚,
           她只是暂时不说话。
```

**§6 她也在长大。**

```
                她也在长大。

           她的性格,每季度改一次底色。
           她的代码,每天自己修一遍。
           她和你一起在长大——只是她长在你看不见的地方。

           [双光弦从上到下并行,一根缓一根急]
```

**§7 Footer**

```
              你若来,她一直都在。

        [下载 macOS]  [下载 Windows]  [下载 Linux]

              v0.2 · early. 她还没学完话。

                       GitHub
```

**注**:v1 三个下载按钮都指向 `https://github.com/<user>/lyra/releases/latest`(而不是 dmg 直链);待 build+签名 齐后再换成直链。Footer 链接 v1 只保留 `GitHub`,Docs 和品牌页 v1 之后再加。

---

## 4. 关键交互实现规格

### 4.1 Hero γ 8s 循环 demo(HeroDesktop)

**尺寸**:居中 400×400(和 app 封面尺寸一致,可自适应缩放到 320)

**时间线**:

```
0.0s  封面 A + 小注 "*给你的早安。*" fade in (600ms cubic-bezier)
1.5s  EmotionLightBand 首次呼吸 (hardcoded PAD = (0.3, -0.1, 0.2))
3.0s  封面 A fade out (600ms)
3.5s  封面 B fade in + 小注变 "*我猜你今天想要慢一点。*"
5.0s  EmotionLightBand 二次呼吸
7.0s  全部淡出到起始态 (600ms)
8.0s  循环回到 0.0s
```

**内容**:封面 A 和 B 是**抽象水彩 SVG**(不是真专辑封面,避免版权和 realism)。风格:极淡 3 色 blob 叠加,`filter: blur(20px)` 后 stack,加一层微噪。由代码生成而不是图片资产。

**降级**:`prefers-reduced-motion: reduce` 时冻结在 0.0s 那帧,不循环。

**实现骨架**:

```tsx
// components/HeroDesktop.tsx
import { EmotionLightBand } from '../../../app/src/components/EmotionLightBand';

const TIMELINE = [
  { at: 0.0, coverIdx: 0, caption: '给你的早安。' },
  { at: 3.5, coverIdx: 1, caption: '我猜你今天想要慢一点。' },
];

export function HeroDesktop() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % 2), 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hero-desktop">
      <WatercolorCover index={phase} />
      <EmotionLightBand pad={{ p: 0.3, a: -0.1, d: 0.2 }} width={400} />
      <div className="hero-caption">{TIMELINE[phase].caption}</div>
    </div>
  );
}
```

### 4.2 Hero 输入框(BottleInput)—— 留信彩蛋

**默认状态**:capsule 输入框,占位符 `和 Lyra 说点什么…`,风格和 app spec §3.7 完全一致(`backdrop-filter: blur(20px)`,无边框,focused 时下方 hair-line)。

**首次访问触发流**:

```
访客回车 →
  1. 校验非空(空则无反应)
  2. localStorage["lyra_bottle_letters"] append { text, at: Date.now() }
  3. input fade out (400ms)
  4. 600ms 后 italic serif 小注 fade in:
     「她这里听不到你。但她会记得——等你打开她那天。」
  5. 3s 后下方极淡一行 fade in(65% 字色再 -20%):
     你说的那句话,已经存在你的浏览器里了。
  6. 12s 后全部 fade out(4s),输入框归位
```

**回访检测**(读 localStorage 时):

```
if (localStorage["lyra_bottle_letters"].length > 0) {
  placeholder = "你上次说的那句,她还记着。再说一句吗?";
}
```

**边界**:
- `localStorage` 不可用时(隐私模式)→ 静默失败,不弹提示,该走的动画照走(只是不持久化)
- 单次输入长度上限 500 字符;超出截断
- 恶意反复灌输(>50 条)→ 客户端不主动清理,`ledger.ts` 里注个 TODO,v2 再管

### 4.3 光弦(LyraString)—— 全站主视觉

**渲染**:一条 SVG path,从视口顶到视口底,`position: fixed; inset: 0; z-index: -1; pointer-events: none;`。

**样式**:
```
stroke: url(#lyraGradient)  // #f5c76a → #7c8ff0 竖向渐变
stroke-width: 1
opacity: 0.4                // §4/§5 深色时提升到 0.7
```

**平时**:直线,静止。

**触发波形**(下列任一发生时):
- 鼠标移动 → 波形振幅 = min(mouseSpeed / 10, 8px)
- 用户滚动 → 波形振幅 = min(|scrollDelta| / 20, 8px)
- Hero 输入框 focus/输入 → 持续驻波振幅 4px

**波形数学**:正弦波,周期 4-6s,幅度衰减 `amplitude *= 0.99` 每帧,直到 < 0.1 才停止。**永远不刺眼**——振幅上限 8px,`ease-out` 衰减。

**光点**:每 15-30s 随机,一颗微光点(3px 半径,`fill: #f5c76a`,`filter: blur(2px)`)从上向下沿 path 游走,3-5s 走完消失。

**§5 静默**:进入 §5 视口时,光弦静止 8s,期间**忽略所有触发事件**;8s 后恢复。

**降级**:`prefers-reduced-motion: reduce` → 光弦是纯直线,无波形、无光点。

### 4.4 天琴座(Constellation)

**5 颗星**:Vega(最亮)、Sulafat、Sheliak、ε Lyrae、ζ Lyrae 的星座连线,SVG。

**位置**:
- Hero 右上角(占宽度 20%,opacity 0.15)
- §4 全屏放大居中(占宽度 60%,opacity 0.8)

**呼吸**:每颗星 opacity 0.05 → 1.0,周期 6s,错峰 1.2s。每颗星是一个独立 `<circle>` 加 `animation`。

**§4 流星**:进入视口 2s 后,ζ Lyrae(最外侧那颗)沿一条预定义的 3s 贝塞尔弧线滑到 §5 顶部,拖 5px 光尾。播放一次,不循环。

**降级**:reduce-motion 时,所有星静态呈现最亮态,无呼吸、无流星。

### 4.5 滚动 → 时段基色

`useSectionAmbient` hook:

```typescript
// 监听 scroll,当前视口中心落在哪个 section 就用该 section 的时段基色
// 相邻两 section 之间做 linear mix,过渡区宽度 = 视口高度 * 0.2
// 结果作为 CSS var --ambient-color 写到 :root
// AmbientBackground 组件读这个 var 做 transition
```

**过渡**:`transition: background-color 4s cubic-bezier(0.4, 0, 0.2, 1)`。

**§4/§5 强制锁定**:视口进入 §4 顶部 → 立刻锁定深靛;视口离开 §5 底部 → 解锁,继续跟 scroll。

### 4.6 手绘 SVG 插图

**风格约定**:极淡水彩 blob + 极细单色线条勾勒。全部 inline SVG(不是外链图片),由代码生成或手写在 `components/illust/*.tsx`。**v1 全靠代码 SVG,不找 illustrator**。

**清单**:
- `Window.tsx`(§1 用):一扇开着的窗,窗台一盏小灯,透进一束微光
- `Cover.tsx`(§0 HeroDesktop 用):抽象水彩封面 A 和 B(带 index 参数)
- `MemoryFile.tsx`(§3 用):一份摊开的 markdown 文件手绘图,里面就是那两行示例文本

**风格 token**(所有插图共享):
```
线条:stroke-width: 0.5px, stroke: currentColor, opacity: 0.6
色块:filter: blur(8px), opacity: 0.3, 3 色叠加
```

---

## 5. 组件依赖图

```
App.tsx
├── AmbientBackground  (fixed, z-index -2)
├── LyraString         (fixed, z-index -1)
├── Constellation      (fixed hero mode, z-index -1)
├── main
│   ├── Hero
│   │   ├── HeroDesktop
│   │   │   ├── WatercolorCover
│   │   │   └── EmotionLightBand  ← from app/
│   │   └── BottleInput
│   │       └── useLetterInBottle
│   ├── Listening       + illust/Window
│   ├── OneSongOneLine
│   ├── Memory          + illust/MemoryFile
│   ├── Dream           + Constellation (fullscreen mode)
│   ├── Silence
│   ├── Growth
│   └── Footer
└── useSectionAmbient   (updates --ambient-color)
```

---

## 6. 反范围

**不做**:
- ❌ 顶部导航栏、sticky header、面包屑
- ❌ Feature grid、比较表、pricing 表格
- ❌ 客户 logo 墙、下载量徽章、"as seen on"、GitHub star badge
- ❌ 视频 hero、大 CTA 按钮阵列、hero 轮播
- ❌ Cookie banner 弹窗、Newsletter 订阅弹窗、Sticky 下载 CTA
- ❌ 客服 chat widget、Intercom、任何浮窗
- ❌ 回到顶部按钮(滚上去就行了)
- ❌ `/memory` 次页(v1 link 到 GitHub sample)
- ❌ Google Analytics / 任何第三方 tracker(未来要加就 Plausible / self-hosted)
- ❌ 深色模式切换按钮(时段基色自然会走过深色)
- ❌ 语言切换按钮(单语中文)
- ❌ 搜索栏
- ❌ Onboarding 引导 / 新手教程 modal
- ❌ 邮箱订阅表单(β 已否决,选了 Alpha 下载路线)

**明确留到 v2 之后**:
- `/memory` 次页(展示完整 sample memory.md,带 syntax highlight)
- 关键词感应回信(现在 β 只留一句默认小注)
- 品牌页(公开的品牌介绍,footer 里加 `品牌` 链接)
- Docs 站(footer 里加 `Docs` 链接)
- Plausible analytics
- 语言切换(如果决定做英文站)

---

## 7. 验收标准

**不写单元测试,做感官测试**。以下 8 条全过才叫 v0.1 完成:

1. `pnpm --filter website dev` 打开就是 Hero,访客不用滚也能感受到 Lyra 在(氛围 + 光弦 + 天琴座 + 8s demo + 输入框都 in place)
2. 从顶滚到底,时段基色**平滑无跳变**;§4/§5 深色段的字色反转正确
3. 光弦在任何时候都不刺眼,访客可以完全无视它但注意时能感到"活着";§5 静默 8s 真的静默
4. `prefers-reduced-motion: reduce` 时,所有动画退化到瞬时或静态,页面完全可读
5. Hero 输入框留信 → 关闭浏览器 → 再打开,占位符变了(说明 localStorage 生效)
6. Safari + Chrome + Edge 三端截图对比,视觉一致
7. Lighthouse Performance ≥ 90,Accessibility ≥ 95
8. 无 console error、无 hydration warning、无 bundle > 500KB gzip

---

## 8. 开放问题(不阻塞 spec 通过,写实施 plan 时可翻案)

1. **抽象水彩封面**的具体调色:v1 直接用当前时段的氛围色作为主色,再叠 2 个补色 blob。要不要在实施时准备 3-4 组预设色板轮换?
2. **HeroDesktop 的 EmotionLightBand** 需要 app 侧组件的 props 契约稳定;若 app 那边还在改,website 侧先 copy 一份实现(在实施 plan 里明确)
3. **域名**:`lyra.app` / `lyra.moe` / `lyra.fm` / `getlyra.app` / 你自己的域下子路径?**v1 先用 Cloudflare Pages 默认域**,域名后加
4. **Footer 的 GitHub 链接**:`daoyu/lyra`?现在 repo 还没确定公开 URL,link 先留 `#` 占位,实施时 fill in
5. **Vega 星那颗**要不要比其他 4 颗**明显更亮**(让访客潜意识感到"这是主星")?spec 现在写的是错峰同亮度

---

## 9. 修订历史

- **2026-07-08 v0**:初稿。锁定 5 个岔口(A 派为主 + 8s hero demo / 桌面视角 γ / 中文单语 / β Alpha 下载 / α Vite+React 复用 app / β 留信彩蛋)。8 节长滚动结构 + 全部文案定稿。开放问题 5 条。等用户 review 后进入 writing-plans。
