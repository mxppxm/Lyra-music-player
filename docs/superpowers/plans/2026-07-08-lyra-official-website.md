# Lyra 官网 v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Lyra 官网 v0.1 — 8 节单页长滚动、Vite+React、复用 app 视觉资产、Hero 8s demo、留信输入框、光弦 + 天琴座、可 `pnpm --filter website dev` 打开。

**Architecture:** `音乐播放器/website/` 作为 pnpm workspace(和 `app/` 平级),纯前端 Vite+React+TS,单页无路由,固定层(AmbientBackground / LyraString / Constellation)+ 8 节 section + Footer。样式用 CSS Modules,不引入 Tailwind / Framer Motion / react-router。从 `app/` 相对路径 import `theme/ambient.ts`、`theme/motion.ts`、`components/EmotionLightBand/`,视觉与 app 同源。

**Tech Stack:** pnpm workspace · Vite 5 · React 18 · TypeScript · CSS Modules · vitest(仅用于 hook 单测)· SVG 内联手绘插图 · Cloudflare Pages 部署目标

---

## Global Constraints

- 中文单语。仅 hero 大字下方保留一行英文 slogan `Between the things you say.`,其他位置一律中文
- 动效节奏基调:`transition: <prop> 4s cubic-bezier(0.4, 0, 0.2, 1)`,和 app spec §3.1 一致
- 颜色用 HSL,时段基色**必须逐值等于** app spec §5.1 的 7 段颜色:清晨 `hsl(30, 15%, 92%)` / 上午 `hsl(45, 10%, 94%)` / 午后 `hsl(100, 12%, 91%)` / 傍晚 `hsl(35, 20%, 90%)` / 晚间 `hsl(28, 25%, 88%)` / 深夜 `hsl(230, 25%, 22%)` / 凌晨 `hsl(235, 30%, 18%)`
- **反 chrome**:无导航栏、无 sticky header、无面包屑、无回顶按钮、无 sticky CTA、无客服 widget、无 cookie banner、无 newsletter 弹窗、无 GA / 任何第三方 tracker
- 必须支持 `prefers-reduced-motion: reduce` — 所有 4s 动画退化到瞬时或静态
- 禁引:Framer Motion、Tailwind、CSS-in-JS、react-router、任何 UI 库
- 从 `app/` 用**相对路径 import** 复用 `theme/ambient.ts`、`theme/motion.ts`、`components/EmotionLightBand/`;若 app 侧尚未导出,先在 website 侧复刻一份**同值**常量,注释 `// TODO: 待 app 侧导出后改为 relative import`
- 全部文案集中在 `website/src/copy/ledger.ts`,不散落在组件里
- Lighthouse Performance ≥ 90,Accessibility ≥ 95,bundle < 500KB gzip
- 语言化命名:section 组件用 `sections/<Name>.tsx` 单文件

---

## File Structure

```
音乐播放器/
├── pnpm-workspace.yaml                          # 新增/修改:加 website
└── website/                                     # ← 本次新建
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    ├── vitest.config.ts                         # hook 单测
    └── src/
        ├── main.tsx                             # entry
        ├── App.tsx                              # 单页组装
        ├── styles/
        │   ├── globals.css                      # reset + :root vars
        │   └── fonts.css                        # SF Pro + Lora italic
        ├── copy/
        │   └── ledger.ts                        # 全站文案
        ├── theme/
        │   ├── ambient.ts                       # 时段基色 + PAD → HSL(复刻 app,若 app 未导出)
        │   └── motion.ts                        # 4s cubic-bezier 常量
        ├── hooks/
        │   ├── useSectionAmbient.ts             # scroll → --ambient-color
        │   ├── useLetterInBottle.ts             # localStorage 留言
        │   ├── useReducedMotion.ts              # matchMedia 封装
        │   └── __tests__/
        │       ├── useLetterInBottle.test.ts
        │       └── useSectionAmbient.test.ts
        ├── components/
        │   ├── AmbientBackground.tsx            # fixed 全屏光晕
        │   ├── LyraString.tsx                   # 全站光弦
        │   ├── Constellation.tsx                # 天琴座 2 模式
        │   ├── HeroDesktop.tsx                  # 8s 循环 demo
        │   ├── BottleInput.tsx                  # 留信输入框
        │   ├── ScrollHint.tsx                   # 3s 后消失的 ↓
        │   └── illust/
        │       ├── WatercolorCover.tsx          # 抽象水彩封面(HeroDesktop 用)
        │       ├── Window.tsx                   # §1
        │       ├── CoverMock.tsx                # §2
        │       └── MemoryFile.tsx               # §3
        └── sections/
            ├── Hero.tsx
            ├── Listening.tsx
            ├── OneSongOneLine.tsx
            ├── Memory.tsx
            ├── Dream.tsx
            ├── Silence.tsx
            ├── Growth.tsx
            └── Footer.tsx
```

**边界原则**:每个 `components/*` 是一个纯视觉/交互 unit,不知道自己被放在哪节;`sections/*` 只做组合,不再实现动效逻辑。`hooks/*` 是纯逻辑,可单测。`copy/ledger.ts` 是唯一的字符串源。

---

## Task 1: pnpm workspace 与 website 脚手架

**Files:**
- Modify: `pnpm-workspace.yaml`(若不存在则 Create)
- Create: `音乐播放器/website/package.json`
- Create: `音乐播放器/website/tsconfig.json`
- Create: `音乐播放器/website/vite.config.ts`
- Create: `音乐播放器/website/index.html`
- Create: `音乐播放器/website/src/main.tsx`
- Create: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 一个可 `pnpm --filter @lyra/website dev` 打开的空壳,浏览器显示纯文本 "Lyra"

- [ ] **Step 1: 检查 pnpm-workspace.yaml 现状**

Run: `cat 音乐播放器/pnpm-workspace.yaml 2>/dev/null || echo "MISSING"`
- 若显示 `MISSING`,后续 Step 2 使用 create 模式
- 若已存在但未包含 `website`,后续 Step 2 使用 edit 模式追加一行

- [ ] **Step 2: 配置 pnpm workspace 包含 website**

若 MISSING,写入 `音乐播放器/pnpm-workspace.yaml`:

```yaml
packages:
  - app
  - website
```

若已存在,追加 `- website` 到 `packages` 列表下(不去动其他条目)。

- [ ] **Step 3: 写入 website/package.json**

```json
{
  "name": "@lyra/website",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 4: 写入 website/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: 写入 website/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5175, open: false },
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
});
```

- [ ] **Step 6: 写入 website/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lyra</title>
    <meta name="description" content="她宁愿沉默,也不放错的歌。" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 写入 website/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: 写入 website/src/App.tsx(占位版)**

```tsx
export default function App() {
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Lyra</div>;
}
```

- [ ] **Step 9: 安装依赖**

Run: `pnpm install`
Expected: 无 error,`音乐播放器/website/node_modules/` 出现

- [ ] **Step 10: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected: 浏览器打开 `http://localhost:5175`,页面显示纯文本 "Lyra"。关闭 dev server。

- [ ] **Step 11: Commit**

```bash
git add 音乐播放器/pnpm-workspace.yaml 音乐播放器/website
git commit -m "chore(website): pnpm workspace scaffold — vite+react+ts (Task 1)"
```

---

## Task 2: 字体、globals、copy ledger

**Files:**
- Create: `音乐播放器/website/src/styles/fonts.css`
- Create: `音乐播放器/website/src/styles/globals.css`
- Create: `音乐播放器/website/src/copy/ledger.ts`
- Modify: `音乐播放器/website/src/main.tsx`(import 两个 css)

**Interfaces:**
- Consumes: Task 1 的脚手架
- Produces: 一个引入全字体和全站文案对象的 App。`copy.ts` 导出 `SECTIONS`(每节的完整字段)。

- [ ] **Step 1: 检查 app 是否已有可复用的 fonts.css**

Run: `ls 音乐播放器/app/src/theme/fonts.css 2>/dev/null || ls 音乐播放器/app/src/styles/fonts.css 2>/dev/null || echo "APP_HAS_NO_FONTS_FILE"`
- 若 app 有,后续 Step 2 内容改为 `@import '<相对路径到 app 的 fonts.css>';`
- 若 `APP_HAS_NO_FONTS_FILE`,按下方 Step 2 写入独立版本

- [ ] **Step 2: 写入 website/src/styles/fonts.css**

若 app 无 fonts.css,写入:

```css
/* Lora italic — served by Google Fonts (加载 <link> 在 index.html);此处只声明 fallback stack */
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC',
               'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif;
  --font-serif-italic: 'Lora', Georgia, 'Times New Roman', serif;
}
```

同时修改 `音乐播放器/website/index.html`,在 `<head>` 追加(放在 `<title>` 之前):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Lora:ital@1&display=swap" rel="stylesheet" />
```

- [ ] **Step 3: 写入 website/src/styles/globals.css**

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; }

:root {
  --ambient-color: hsl(30, 15%, 92%);         /* 初始清晨米白 */
  --text-color: rgba(0, 0, 0, 0.85);
  --text-color-soft: rgba(0, 0, 0, 0.55);
  --text-color-dim: rgba(0, 0, 0, 0.35);
  --motion-slow: 4000ms;
  --motion-medium: 600ms;
  --motion-fast: 400ms;
  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  font-family: var(--font-sans);
  color: var(--text-color);
  background-color: var(--ambient-color);
  transition: background-color var(--motion-slow) var(--ease-out),
              color var(--motion-slow) var(--ease-out);
  overflow-x: hidden;
}

body[data-dark='true'] {
  --text-color: rgba(255, 255, 255, 0.90);
  --text-color-soft: rgba(255, 255, 255, 0.65);
  --text-color-dim: rgba(255, 255, 255, 0.40);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 40px;
}
```

- [ ] **Step 4: 写入 website/src/copy/ledger.ts**

```typescript
export const HERO = {
  bigZh: '未成曲调先有情。',
  bigEn: 'Between the things you say.',
  inputPlaceholder: '和 Lyra 说点什么…',
  inputPlaceholderReturning: '你上次说的那句,她还记着。再说一句吗?',
  inputHint: '她还没能出门,但你可以留一句话给她。',
  bottleReplyMain: '「她这里听不到你。但她会记得——等你打开她那天。」',
  bottleReplyAside: '你说的那句话,已经存在你的浏览器里了。',
  demoCaptionA: '给你的早安。',
  demoCaptionB: '我猜你今天想要慢一点。',
} as const;

export const LISTENING = {
  title: '她在听。',
  body: [
    '你打开她,她已经想好了给你放什么。',
    '你不说,她也大概知道。',
  ],
} as const;

export const ONE_SONG_ONE_LINE = {
  title: '一首歌,一句话。',
  body: [
    '别的 app 给你歌单。她给你一首。',
    '就一首。听完就结了。',
  ],
  captions: [
    '我猜你今天想要慢一点。',
    '这首放给你,是因为你上次说过风声让你安心。',
  ],
} as const;

export const MEMORY = {
  title: '她记得那晚你在听什么。',
  body: [
    '她的记忆不是黑盒。',
    '是一个你可以打开来读的文件。',
    '你不喜欢的一句,划掉就好。',
  ],
  fileLines: [
    '# 时段:深夜 · 状态:疲惫',
    '→ 慢速古典钢琴 (conf: 0.87, n=9, 2026-07-06)',
    '',
    '# 关键词:风声 · 状态:安心',
    '→ environment ambient (conf: 0.71)',
  ],
  sampleLink: '她的记忆样例 →',
} as const;

export const DREAM = {
  title: '她会做梦。',
  body: [
    '每天凌晨三点十四分。',
    '她把这一天你们说过的话,重新想一遍。',
    '第二天早上,她可能会主动开口——',
    '也可能什么都不说,只是给你换一首歌。',
  ],
} as const;

export const SILENCE = {
  title: '她宁愿沉默,也不放错的歌。',
  body: [
    '你连续三次跳过她给的歌,她会安静三天。',
    '她不发牢骚,她只是暂时不说话。',
  ],
} as const;

export const GROWTH = {
  title: '她也在长大。',
  body: [
    '她的性格,每季度改一次底色。',
    '她的代码,每天自己修一遍。',
    '她和你一起在长大——只是她长在你看不见的地方。',
  ],
} as const;

export const FOOTER = {
  tagline: '你若来,她一直都在。',
  early: 'v0.2 · early. 她还没学完话。',
  downloads: {
    mac: '下载 macOS',
    win: '下载 Windows',
    linux: '下载 Linux',
  },
  githubUrl: 'https://github.com/daoyu/lyra',
  releasesUrl: 'https://github.com/daoyu/lyra/releases/latest',
} as const;
```

- [ ] **Step 5: 修改 website/src/main.tsx 引入两个 css**

在 `import ReactDOM from 'react-dom/client';` 之后加两行:

```tsx
import './styles/fonts.css';
import './styles/globals.css';
```

- [ ] **Step 6: 修改 website/src/App.tsx 显示 hero 大字试探字体**

替换全部内容为:

```tsx
import { HERO } from './copy/ledger';

export default function App() {
  return (
    <main>
      <section>
        <h1 style={{ fontSize: 48, margin: 0 }}>{HERO.bigZh}</h1>
        <p style={{ fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic', color: 'var(--text-color-soft)' }}>
          {HERO.bigEn}
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected: 页面显示 `未成曲调先有情。` + 下方一行斜体英文 `Between the things you say.`。整页背景是清晨米白 `hsl(30, 15%, 92%)`。

- [ ] **Step 8: Commit**

```bash
git add 音乐播放器/website/src/styles 音乐播放器/website/src/copy 音乐播放器/website/src/main.tsx 音乐播放器/website/src/App.tsx 音乐播放器/website/index.html
git commit -m "feat(website): fonts, globals, copy ledger, hero smoke test (Task 2)"
```

---

## Task 3: theme/ambient.ts + useSectionAmbient hook + AmbientBackground

**Files:**
- Create: `音乐播放器/website/src/theme/ambient.ts`
- Create: `音乐播放器/website/src/theme/motion.ts`
- Create: `音乐播放器/website/src/hooks/useSectionAmbient.ts`
- Create: `音乐播放器/website/src/hooks/__tests__/useSectionAmbient.test.ts`
- Create: `音乐播放器/website/src/components/AmbientBackground.tsx`
- Create: `音乐播放器/website/vitest.config.ts`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: Task 2 的 globals.css `--ambient-color` CSS var
- Produces: `SECTION_COLORS: readonly [string, ...string[]]`(8 段 HSL 字符串数组,index 0..7 对应 Hero..Footer),`useSectionAmbient(sectionRefs, opts): void`(观察 refs,写 `--ambient-color` 到 `:root`),`<AmbientBackground />` 空组件(纯占位,便于以后加装饰层)

- [ ] **Step 1: 探查 app 是否已有 ambient.ts**

Run: `find 音乐播放器/app/src -name 'ambient.ts' -type f 2>/dev/null | head -1`
- 若有:后续 Step 2 改为 `export * from '<相对路径>';` + 追加 website 侧新增的 `SECTION_COLORS`
- 若无:按下方独立版本

- [ ] **Step 2: 写入 website/src/theme/ambient.ts**

```typescript
/**
 * 时段基色。逐值等于 app spec §5.1。若 app 侧后续导出对应模块,应改为
 *   export { TIME_BASE_COLORS } from '../../../app/src/theme/ambient';
 * 保持单一真源。
 */
export const TIME_BASE_COLORS = {
  morning: 'hsl(30, 15%, 92%)',     // 05:00-08:00 清晨米白
  forenoon: 'hsl(45, 10%, 94%)',    // 08:00-12:00 温和白
  afternoon: 'hsl(100, 12%, 91%)',  // 12:00-15:00 浅苹果绿
  dusk: 'hsl(35, 20%, 90%)',        // 15:00-18:00 浅琥珀
  evening: 'hsl(28, 25%, 88%)',     // 18:00-22:00 暖蜡烛
  midnight: 'hsl(230, 25%, 22%)',   // 22:00-02:00 靛蓝
  predawn: 'hsl(235, 30%, 18%)',    // 02:00-05:00 深靛
} as const;

/** 8 节顺序:Hero, Listening, OneSongOneLine, Memory, Dream, Silence, Growth, Footer */
export const SECTION_COLORS = [
  TIME_BASE_COLORS.morning,     // §0 Hero
  TIME_BASE_COLORS.forenoon,    // §1 她在听
  TIME_BASE_COLORS.afternoon,   // §2 一首歌
  TIME_BASE_COLORS.dusk,        // §3 她记得
  TIME_BASE_COLORS.midnight,    // §4 她会做梦
  TIME_BASE_COLORS.predawn,     // §5 她宁愿沉默
  TIME_BASE_COLORS.morning,     // §6 她也在长大
  TIME_BASE_COLORS.morning,     // §7 Footer
] as const;

/** 需要反白字的 section index(§4/§5) */
export const DARK_SECTIONS = new Set([4, 5]);
```

- [ ] **Step 3: 写入 website/src/theme/motion.ts**

```typescript
export const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const DURATION_SLOW_MS = 4000;
export const DURATION_MEDIUM_MS = 600;
export const DURATION_FAST_MS = 400;
```

- [ ] **Step 4: 写入 website/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 5: 写入 useSectionAmbient 测试**

`音乐播放器/website/src/hooks/__tests__/useSectionAmbient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSectionAmbient } from '../useSectionAmbient';

describe('useSectionAmbient', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--ambient-color');
    document.body.removeAttribute('data-dark');
  });

  it('writes the first section color on mount', () => {
    const refs = Array.from({ length: 3 }, () => ({ current: document.createElement('section') }));
    renderHook(() => useSectionAmbient(refs, {
      colors: ['hsl(0, 0%, 90%)', 'hsl(120, 30%, 40%)', 'hsl(240, 50%, 20%)'],
      darkSections: new Set([2]),
    }));
    expect(document.documentElement.style.getPropertyValue('--ambient-color'))
      .toBe('hsl(0, 0%, 90%)');
  });

  it('toggles data-dark on body when active section is in darkSections', () => {
    const refs = [{ current: document.createElement('section') }];
    renderHook(() => useSectionAmbient(refs, {
      colors: ['hsl(240, 50%, 20%)'],
      darkSections: new Set([0]),
    }));
    expect(document.body.getAttribute('data-dark')).toBe('true');
  });
});
```

- [ ] **Step 6: 写入 useSectionAmbient hook**

`音乐播放器/website/src/hooks/useSectionAmbient.ts`:

```typescript
import { useEffect, useRef } from 'react';

export interface UseSectionAmbientOpts {
  colors: readonly string[];
  darkSections: ReadonlySet<number>;
}

export function useSectionAmbient(
  refs: React.RefObject<HTMLElement>[],
  opts: UseSectionAmbientOpts,
): void {
  const activeIndexRef = useRef(0);

  useEffect(() => {
    const apply = (idx: number) => {
      if (idx === activeIndexRef.current) return;
      activeIndexRef.current = idx;
      const color = opts.colors[idx];
      if (color) {
        document.documentElement.style.setProperty('--ambient-color', color);
      }
      if (opts.darkSections.has(idx)) {
        document.body.setAttribute('data-dark', 'true');
      } else {
        document.body.removeAttribute('data-dark');
      }
    };

    // 挂载时立即应用 index 0
    apply(0);

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 找出目前 intersecting 中最大 ratio 的 section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        const idx = refs.findIndex((r) => r.current === visible[0].target);
        if (idx >= 0) apply(idx);
      },
      { threshold: [0.3, 0.6] },
    );

    refs.forEach((r) => {
      if (r.current) observer.observe(r.current);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 7: 运行 hook 单测**

Run: `pnpm --filter @lyra/website test`
Expected: 2 个 test PASS。

- [ ] **Step 8: 写入 AmbientBackground.tsx(v0.1 是空占位)**

```tsx
/**
 * 全屏氛围光晕。v0.1 就是纯背景色(通过 body 的 --ambient-color 生效)。
 * v0.2 可以在此加渐变叠加、微噪、极慢 blob。
 */
export function AmbientBackground() {
  return null;
}
```

- [ ] **Step 9: 修改 App.tsx 挂载 8 个 section refs + hook**

```tsx
import { useRef } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { useSectionAmbient } from './hooks/useSectionAmbient';
import { SECTION_COLORS, DARK_SECTIONS } from './theme/ambient';
import { HERO, LISTENING, ONE_SONG_ONE_LINE, MEMORY, DREAM, SILENCE, GROWTH, FOOTER } from './copy/ledger';

export default function App() {
  const refs = Array.from({ length: 8 }, () => useRef<HTMLElement>(null));
  useSectionAmbient(refs, { colors: SECTION_COLORS, darkSections: DARK_SECTIONS });

  const titles = [
    HERO.bigZh, LISTENING.title, ONE_SONG_ONE_LINE.title, MEMORY.title,
    DREAM.title, SILENCE.title, GROWTH.title, FOOTER.tagline,
  ];

  return (
    <>
      <AmbientBackground />
      <main>
        {titles.map((t, i) => (
          <section key={i} ref={refs[i] as React.RefObject<HTMLElement>}>
            <h2 style={{ fontSize: 32 }}>{t}</h2>
          </section>
        ))}
      </main>
    </>
  );
}
```

- [ ] **Step 10: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected: 8 段 section 上下排开,慢速滚一遍——背景色**平滑**从米白 → 温和白 → 苹果绿 → 琥珀 → 靛蓝(字色反白) → 深靛(字色反白) → 米白 → 米白。§4/§5 的字自动变白。

- [ ] **Step 11: Commit**

```bash
git add 音乐播放器/website/src/theme 音乐播放器/website/src/hooks 音乐播放器/website/src/components/AmbientBackground.tsx 音乐播放器/website/vitest.config.ts 音乐播放器/website/src/App.tsx
git commit -m "feat(website): section-driven ambient color palette (Task 3)"
```

---

## Task 4: LyraString 光弦(含 §5 静默钩子)

**Files:**
- Create: `音乐播放器/website/src/components/LyraString.tsx`
- Create: `音乐播放器/website/src/hooks/useReducedMotion.ts`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: Task 3 的 SECTION_COLORS
- Produces: `<LyraString silentSectionIndex={5} activeSectionIndex={n} />`(fixed 全屏 SVG,z-index -1,`silentSectionIndex` 到达时静止 8s),`useReducedMotion(): boolean`

- [ ] **Step 1: 写入 useReducedMotion.ts**

```typescript
import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
```

- [ ] **Step 2: 写入 LyraString.tsx**

```tsx
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  activeSectionIndex: number;
  silentSectionIndex: number;
}

export function LyraString({ activeSectionIndex, silentSectionIndex }: Props) {
  const pathRef = useRef<SVGPathElement>(null);
  const amplitudeRef = useRef(0);
  const phaseRef = useRef(0);
  const reduced = useReducedMotion();
  const silentUntilRef = useRef(0);

  // 进入 §5 触发 8s 静默
  useEffect(() => {
    if (activeSectionIndex === silentSectionIndex) {
      silentUntilRef.current = performance.now() + 8000;
      amplitudeRef.current = 0;
    }
  }, [activeSectionIndex, silentSectionIndex]);

  useEffect(() => {
    if (reduced) return;

    const bumpAmplitude = (delta: number) => {
      if (performance.now() < silentUntilRef.current) return;
      amplitudeRef.current = Math.min(amplitudeRef.current + delta, 8);
    };
    const onMouseMove = (e: MouseEvent) => bumpAmplitude(Math.hypot(e.movementX, e.movementY) / 10);
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const delta = Math.abs(window.scrollY - lastScrollY);
      lastScrollY = window.scrollY;
      bumpAmplitude(delta / 20);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('scroll', onScroll, { passive: true });

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const silent = now < silentUntilRef.current;
      phaseRef.current += 0.03;
      if (!silent) amplitudeRef.current *= 0.99;
      if (amplitudeRef.current < 0.05) amplitudeRef.current = 0;

      const path = pathRef.current;
      if (path) {
        const h = window.innerHeight;
        const x0 = window.innerWidth / 2;
        const points: string[] = [];
        const segments = 30;
        for (let i = 0; i <= segments; i++) {
          const y = (h / segments) * i;
          const wave = silent ? 0 : Math.sin(phaseRef.current + i * 0.4) * amplitudeRef.current;
          points.push(`${i === 0 ? 'M' : 'L'} ${x0 + wave} ${y}`);
        }
        path.setAttribute('d', points.join(' '));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduced]);

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: -1,
      }}
    >
      <defs>
        <linearGradient id="lyraGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c76a" />
          <stop offset="100%" stopColor="#7c8ff0" />
        </linearGradient>
      </defs>
      <path
        ref={pathRef}
        stroke="url(#lyraGradient)"
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />
    </svg>
  );
}
```

- [ ] **Step 3: 在 App.tsx 挂 LyraString + 记录 activeSectionIndex**

修改 App.tsx。用 state 跟踪 activeIndex(通过 useSectionAmbient 的回调或另设一个 hook)。**为简化,把 useSectionAmbient 增加 onActiveChange 回调**:

修改 `hooks/useSectionAmbient.ts` 的 `UseSectionAmbientOpts` 增加 `onActiveChange?: (idx: number) => void;`,并在 `apply(idx)` 里调用它。

修改 App.tsx:

```tsx
import { useRef, useState } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { LyraString } from './components/LyraString';
import { useSectionAmbient } from './hooks/useSectionAmbient';
import { SECTION_COLORS, DARK_SECTIONS } from './theme/ambient';
import { HERO, LISTENING, ONE_SONG_ONE_LINE, MEMORY, DREAM, SILENCE, GROWTH, FOOTER } from './copy/ledger';

export default function App() {
  const refs = Array.from({ length: 8 }, () => useRef<HTMLElement>(null));
  const [active, setActive] = useState(0);
  useSectionAmbient(refs, {
    colors: SECTION_COLORS,
    darkSections: DARK_SECTIONS,
    onActiveChange: setActive,
  });

  const titles = [
    HERO.bigZh, LISTENING.title, ONE_SONG_ONE_LINE.title, MEMORY.title,
    DREAM.title, SILENCE.title, GROWTH.title, FOOTER.tagline,
  ];

  return (
    <>
      <AmbientBackground />
      <LyraString activeSectionIndex={active} silentSectionIndex={5} />
      <main>
        {titles.map((t, i) => (
          <section key={i} ref={refs[i] as React.RefObject<HTMLElement>}>
            <h2 style={{ fontSize: 32 }}>{t}</h2>
          </section>
        ))}
      </main>
    </>
  );
}
```

- [ ] **Step 4: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected: 页面中央出现一根垂直渐变细线(顶琥珀 → 底藕荷)。移动鼠标或滚动,线极轻微地波动(振幅 ≤ 8px),几秒内平静回直线。滚到 §5,线**变成完全静止**,持续 ~8s。

- [ ] **Step 5: reduce-motion 验收**

在 macOS 系统偏好 → 辅助功能 → 显示 → 减少动态,或 DevTools rendering → emulate `prefers-reduced-motion: reduce`。
Expected: 光弦是**纯直线**,不响应鼠标/滚动。

- [ ] **Step 6: Commit**

```bash
git add 音乐播放器/website/src/hooks 音乐播放器/website/src/components 音乐播放器/website/src/App.tsx
git commit -m "feat(website): LyraString with §5 silence + reduced-motion (Task 4)"
```

---

## Task 5: Constellation 天琴座(2 模式:hero 淡浮 / §4 全屏 + 流星)

**Files:**
- Create: `音乐播放器/website/src/components/Constellation.tsx`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` from Task 4
- Produces: `<Constellation mode="hero" | "fullscreen" active={boolean} />`。fullscreen mode 挂载后 2s 触发一次流星,不循环。

- [ ] **Step 1: 写入 Constellation.tsx**

天琴座 5 星相对坐标(相对 100x100 viewBox,以 Vega 为最亮参考):

```
Vega        (50, 30)   — 最亮
Sulafat     (30, 65)
Sheliak     (55, 60)
ε Lyrae     (75, 40)
ζ Lyrae     (72, 55)
连线:Vega-Sulafat, Vega-ε, Sulafat-Sheliak, Sheliak-ζ, ζ-ε
```

```tsx
import { useEffect, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  mode: 'hero' | 'fullscreen';
  active: boolean;
}

const STARS = [
  { name: 'Vega',     cx: 50, cy: 30, r: 1.4, delay: 0 },
  { name: 'Sulafat',  cx: 30, cy: 65, r: 1.0, delay: 1.2 },
  { name: 'Sheliak',  cx: 55, cy: 60, r: 1.0, delay: 2.4 },
  { name: 'εLyrae',   cx: 75, cy: 40, r: 0.9, delay: 3.6 },
  { name: 'ζLyrae',   cx: 72, cy: 55, r: 0.9, delay: 4.8 },
];

const LINES = [
  ['Vega', 'Sulafat'], ['Vega', 'εLyrae'],
  ['Sulafat', 'Sheliak'], ['Sheliak', 'ζLyrae'], ['ζLyrae', 'εLyrae'],
];

export function Constellation({ mode, active }: Props) {
  const reduced = useReducedMotion();
  const [meteor, setMeteor] = useState(false);

  useEffect(() => {
    if (mode !== 'fullscreen' || !active || reduced) return;
    const t = setTimeout(() => setMeteor(true), 2000);
    return () => clearTimeout(t);
  }, [mode, active, reduced]);

  const isHero = mode === 'hero';
  const size = isHero ? '20vw' : '60vw';
  const opacity = isHero ? 0.15 : 0.8;
  const position: React.CSSProperties = isHero
    ? { position: 'absolute', top: 40, right: 40, width: size, height: size }
    : { position: 'absolute', inset: 0, margin: 'auto', width: size, height: size };

  const byName = Object.fromEntries(STARS.map((s) => [s.name, s]));

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      style={{ ...position, opacity, pointerEvents: 'none' }}
    >
      <g stroke="currentColor" strokeWidth="0.2" opacity="0.4" fill="none">
        {LINES.map(([a, b], i) => (
          <line key={i} x1={byName[a].cx} y1={byName[a].cy} x2={byName[b].cx} y2={byName[b].cy} />
        ))}
      </g>
      {STARS.map((s) => (
        <circle
          key={s.name}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="currentColor"
          style={reduced ? { opacity: 1 } : {
            opacity: 0.05,
            animation: `lyra-breath 6s ${s.delay}s ease-in-out infinite`,
          }}
        />
      ))}
      {meteor && (
        <circle
          cx={72}
          cy={55}
          r={0.9}
          fill="#f5c76a"
          style={{ animation: 'lyra-meteor 3s ease-in 1 forwards' }}
        />
      )}
      <style>{`
        @keyframes lyra-breath {
          0%, 100% { opacity: 0.05; }
          50% { opacity: 1; }
        }
        @keyframes lyra-meteor {
          0% { transform: translate(0, 0); opacity: 1; }
          100% { transform: translate(-20px, 50px); opacity: 0; }
        }
      `}</style>
    </svg>
  );
}
```

- [ ] **Step 2: App.tsx 组装 hero constellation + §4 fullscreen constellation**

Hero constellation 目前挂到全局(hero section 里的容器);§4 挂到 Dream section 内容里。目前 sections/*.tsx 还没建,所以在 App.tsx 的临时占位里演示挂法:

```tsx
// 在 hero 那个 section 内(index 0):
<section key={0} ref={refs[0] as React.RefObject<HTMLElement>} style={{ position: 'relative' }}>
  <Constellation mode="hero" active={true} />
  <h2 style={{ fontSize: 32 }}>{titles[0]}</h2>
</section>

// 在 dream 那个 section 内(index 4):
<section key={4} ref={refs[4] as React.RefObject<HTMLElement>} style={{ position: 'relative' }}>
  <Constellation mode="fullscreen" active={active === 4} />
  <h2 style={{ fontSize: 32 }}>{titles[4]}</h2>
</section>
```

在 App.tsx 的 titles map 里,把 index 0 和 4 特殊处理(其他 index 保持原来的 template):

```tsx
{titles.map((t, i) => {
  const inner = <h2 style={{ fontSize: 32 }}>{t}</h2>;
  if (i === 0) {
    return (
      <section key={i} ref={refs[i]!} style={{ position: 'relative' }}>
        <Constellation mode="hero" active={true} />
        {inner}
      </section>
    );
  }
  if (i === 4) {
    return (
      <section key={i} ref={refs[i]!} style={{ position: 'relative' }}>
        <Constellation mode="fullscreen" active={active === 4} />
        {inner}
      </section>
    );
  }
  return (
    <section key={i} ref={refs[i]!}>
      {inner}
    </section>
  );
})}
```

记得 import `Constellation`。

- [ ] **Step 3: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected:
- Hero 右上角出现 5 颗小星呼吸(极淡)
- 滚到 §4,视口中央出现放大版天琴座,5 颗星依次亮起
- §4 挂载 2s 后,ζ Lyrae 那颗星有一个 3s 的小弧线滑动 + 淡出
- reduce-motion 时:所有星静态最亮,无流星

- [ ] **Step 4: Commit**

```bash
git add 音乐播放器/website/src/components/Constellation.tsx 音乐播放器/website/src/App.tsx
git commit -m "feat(website): Constellation with hero/fullscreen modes + meteor (Task 5)"
```

---

## Task 6: BottleInput 留信输入框 + useLetterInBottle

**Files:**
- Create: `音乐播放器/website/src/hooks/useLetterInBottle.ts`
- Create: `音乐播放器/website/src/hooks/__tests__/useLetterInBottle.test.ts`
- Create: `音乐播放器/website/src/components/BottleInput.tsx`

**Interfaces:**
- Consumes: `HERO` from `copy/ledger`
- Produces: `useLetterInBottle(): { hasPreviousLetter: boolean; save: (text: string) => void }` (localStorage 键 `lyra_bottle_letters`,存 `{text, at}[]`;上限 500 字截断),`<BottleInput />`(自包含,完整实现回车 → fade out → italic 小注淡入 → 12s 归位流程)

- [ ] **Step 1: 写入 useLetterInBottle 测试**

`音乐播放器/website/src/hooks/__tests__/useLetterInBottle.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLetterInBottle } from '../useLetterInBottle';

const KEY = 'lyra_bottle_letters';

describe('useLetterInBottle', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hasPreviousLetter is false when storage empty', () => {
    const { result } = renderHook(() => useLetterInBottle());
    expect(result.current.hasPreviousLetter).toBe(false);
  });

  it('save appends a letter with timestamp', () => {
    const { result } = renderHook(() => useLetterInBottle());
    act(() => result.current.save('今天有点累'));
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('今天有点累');
    expect(typeof stored[0].at).toBe('number');
  });

  it('truncates to 500 chars', () => {
    const { result } = renderHook(() => useLetterInBottle());
    const long = 'a'.repeat(1000);
    act(() => result.current.save(long));
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored[0].text.length).toBe(500);
  });

  it('survives corrupt storage silently', () => {
    localStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useLetterInBottle());
    expect(result.current.hasPreviousLetter).toBe(false);
    // save 依然可用
    act(() => result.current.save('hi'));
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 写入 useLetterInBottle.ts**

```typescript
import { useMemo } from 'react';

const KEY = 'lyra_bottle_letters';
const MAX_LEN = 500;

interface Letter { text: string; at: number; }

function readSafe(): Letter[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useLetterInBottle() {
  const initial = useMemo(() => readSafe(), []);
  const save = (text: string) => {
    try {
      const list = readSafe();
      list.push({ text: text.slice(0, MAX_LEN), at: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* localStorage 不可用时静默失败 */
    }
  };
  return { hasPreviousLetter: initial.length > 0, save };
}
```

- [ ] **Step 3: 跑单测**

Run: `pnpm --filter @lyra/website test`
Expected: 4 + 2 = 6 个 test PASS。

- [ ] **Step 4: 写入 BottleInput.tsx**

```tsx
import { useState } from 'react';
import { HERO } from '../copy/ledger';
import { useLetterInBottle } from '../hooks/useLetterInBottle';

type Phase = 'input' | 'fadingOut' | 'reply' | 'replyWithAside' | 'settling';

export function BottleInput() {
  const { hasPreviousLetter, save } = useLetterInBottle();
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');

  const placeholder = hasPreviousLetter
    ? HERO.inputPlaceholderReturning
    : HERO.inputPlaceholder;

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const trimmed = text.trim();
    if (!trimmed) return;
    save(trimmed);
    setPhase('fadingOut');
    setTimeout(() => setPhase('reply'), 400);
    setTimeout(() => setPhase('replyWithAside'), 400 + 600 + 3000);
    setTimeout(() => setPhase('settling'), 400 + 600 + 3000 + 12000);
    setTimeout(() => { setPhase('input'); setText(''); }, 400 + 600 + 3000 + 12000 + 4000);
  };

  return (
    <div style={{ width: 'min(560px, 80vw)', margin: '0 auto', textAlign: 'center' }}>
      <input
        aria-label="给 Lyra 留一句话"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        style={{
          width: '100%', height: 44, padding: '0 22px',
          borderRadius: 22, border: 'none',
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          fontSize: 15, fontFamily: 'var(--font-sans)',
          color: 'var(--text-color)',
          transition: 'opacity var(--motion-fast) var(--ease-out)',
          opacity: phase === 'input' ? 1 : 0,
          pointerEvents: phase === 'input' ? 'auto' : 'none',
        }}
      />
      <p style={{
        marginTop: 12, fontSize: 12, color: 'var(--text-color-dim)',
        transition: 'opacity var(--motion-fast) var(--ease-out)',
        opacity: phase === 'input' ? 1 : 0,
      }}>
        {HERO.inputHint}
      </p>

      {(phase === 'reply' || phase === 'replyWithAside' || phase === 'settling') && (
        <div style={{
          fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
          fontSize: 18, color: 'var(--text-color-soft)',
          marginTop: -20,
          transition: 'opacity var(--motion-medium) var(--ease-out)',
          opacity: phase === 'settling' ? 0 : 1,
        }}>
          {HERO.bottleReplyMain}
          {(phase === 'replyWithAside' || phase === 'settling') && (
            <div style={{
              marginTop: 12, fontSize: 13, color: 'var(--text-color-dim)',
              transition: 'opacity var(--motion-medium) var(--ease-out)',
              opacity: phase === 'settling' ? 0 : 1,
            }}>
              {HERO.bottleReplyAside}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 感官验收(挂到 hero 临时位置)**

临时改 App.tsx 的 index 0 section:

```tsx
if (i === 0) {
  return (
    <section key={i} ref={refs[i]!} style={{ position: 'relative' }}>
      <Constellation mode="hero" active={true} />
      <h2 style={{ fontSize: 32 }}>{titles[0]}</h2>
      <BottleInput />
    </section>
  );
}
```

Run: `pnpm --filter @lyra/website dev`
Expected:
- Hero 中间有一个 capsule 输入框,占位符是 `和 Lyra 说点什么…`
- 输入 `今天有点累` → 回车 → 输入框 400ms 淡出 → 600ms 后 italic 小注淡入 → 3s 后下方小字淡入 → 12s 后全部淡出 → 输入框归位
- 关闭页面,重新打开 → 占位符变成 `你上次说的那句,她还记着。再说一句吗?`
- 单测 `pnpm --filter @lyra/website test` 6 PASS

- [ ] **Step 6: Commit**

```bash
git add 音乐播放器/website/src/hooks 音乐播放器/website/src/components/BottleInput.tsx 音乐播放器/website/src/App.tsx
git commit -m "feat(website): BottleInput letter-in-a-bottle interaction (Task 6)"
```

---

## Task 7: WatercolorCover 抽象水彩 + HeroDesktop 8s 循环 demo

**Files:**
- Create: `音乐播放器/website/src/components/illust/WatercolorCover.tsx`
- Create: `音乐播放器/website/src/components/HeroDesktop.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` from Task 4
- Produces: `<WatercolorCover index={0 | 1} />`(400×400 SVG,3 色 blob 叠加,index 决定色板),`<HeroDesktop />`(自包含 8s 循环,内部维护 phase 状态)

- [ ] **Step 1: 写入 WatercolorCover.tsx**

```tsx
interface Props { index: 0 | 1; }

const PALETTES = [
  // A: 清晨(暖橙 + 米白 + 极淡蓝)
  ['#f5c76a', '#fef3d7', '#c9d4f5'],
  // B: 慢下来(藕荷 + 米白 + 极淡绿)
  ['#7c8ff0', '#f0efeb', '#c3d9c4'],
];

export function WatercolorCover({ index }: Props) {
  const [c1, c2, c3] = PALETTES[index];
  return (
    <svg viewBox="0 0 400 400" width="400" height="400" style={{
      borderRadius: 12,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      background: c2,
    }}>
      <defs>
        <filter id="blur-heavy" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>
      <g filter="url(#blur-heavy)" opacity="0.7">
        <circle cx="120" cy="140" r="120" fill={c1} />
        <circle cx="280" cy="220" r="150" fill={c3} />
        <circle cx="200" cy="320" r="100" fill={c1} opacity="0.5" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: 写入 HeroDesktop.tsx**

```tsx
import { useEffect, useState } from 'react';
import { WatercolorCover } from './illust/WatercolorCover';
import { HERO } from '../copy/ledger';
import { useReducedMotion } from '../hooks/useReducedMotion';

export function HeroDesktop() {
  const [phase, setPhase] = useState<0 | 1>(0);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    // 时间线:0..3s 显示 A,3..3.5s 淡出+淡入,3.5..7s 显示 B,7..8s 全部淡出,8s 回到 A
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhase((p) => (p === 0 ? 1 : 0));
        setVisible(true);
      }, 500);
    }, 4000);
    return () => clearInterval(cycle);
  }, [reduced]);

  const caption = phase === 0 ? HERO.demoCaptionA : HERO.demoCaptionB;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      transition: 'opacity 600ms var(--ease-out)',
      opacity: visible ? 1 : 0,
    }}>
      <WatercolorCover index={phase} />
      <div style={{
        fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
        fontSize: 16, color: 'var(--text-color-soft)',
      }}>
        {caption}
      </div>
    </div>
  );
}
```

**注**:v0.1 先不接 app 的 EmotionLightBand(封装契约未定)。留一个未来接入位置——`WatercolorCover` 下方 24px gap 内。若 EmotionLightBand 后续 landing,插在 `WatercolorCover` 和 caption 之间即可。

- [ ] **Step 3: 感官验收(临时挂到 hero)**

修改 App.tsx 的 index 0 section:

```tsx
if (i === 0) {
  return (
    <section key={i} ref={refs[i]!} style={{ position: 'relative' }}>
      <Constellation mode="hero" active={true} />
      <HeroDesktop />
      <h2 style={{ fontSize: 32, marginTop: 32 }}>{titles[0]}</h2>
      <BottleInput />
    </section>
  );
}
```

Run: `pnpm --filter @lyra/website dev`
Expected: Hero 中间 400×400 水彩封面 A + `给你的早安。` 显示 ~3s → 全部淡出 → 淡入水彩 B + `我猜你今天想要慢一点。` → 循环。
reduce-motion 时:静态卡在 A,不循环。

- [ ] **Step 4: Commit**

```bash
git add 音乐播放器/website/src/components 音乐播放器/website/src/App.tsx
git commit -m "feat(website): HeroDesktop 8s demo with watercolor covers (Task 7)"
```

---

## Task 8: Hero section + ScrollHint

**Files:**
- Create: `音乐播放器/website/src/components/ScrollHint.tsx`
- Create: `音乐播放器/website/src/sections/Hero.tsx`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: `HeroDesktop`、`BottleInput`、`Constellation`、`HERO`
- Produces: `<Hero />` 完整成品 hero section,`<ScrollHint />` 3s 后自动隐藏的 ↓ 提示

- [ ] **Step 1: 写入 ScrollHint.tsx**

```tsx
import { useEffect, useState } from 'react';

export function ScrollHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', bottom: 40, left: 0, right: 0,
        textAlign: 'center', fontSize: 20, color: 'var(--text-color-dim)',
        transition: 'opacity 1s var(--ease-out)',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
      }}
    >
      ↓
    </div>
  );
}
```

- [ ] **Step 2: 写入 sections/Hero.tsx**

```tsx
import { forwardRef } from 'react';
import { Constellation } from '../components/Constellation';
import { HeroDesktop } from '../components/HeroDesktop';
import { BottleInput } from '../components/BottleInput';
import { ScrollHint } from '../components/ScrollHint';
import { HERO } from '../copy/ledger';

export const Hero = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section ref={ref} style={{ position: 'relative' }}>
      <Constellation mode="hero" active={true} />
      <HeroDesktop />
      <h1 style={{
        fontSize: 40, margin: '48px 0 8px', fontWeight: 400,
        letterSpacing: '0.02em',
      }}>
        {HERO.bigZh}
      </h1>
      <p style={{
        fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
        fontSize: 14, color: 'var(--text-color-soft)', marginBottom: 40,
      }}>
        {HERO.bigEn}
      </p>
      <BottleInput />
      <ScrollHint />
    </section>
  );
});
Hero.displayName = 'Hero';
```

- [ ] **Step 3: 修改 App.tsx 使用 Hero component**

```tsx
import { Hero } from './sections/Hero';

// 在 sections 循环里替换 index 0 的 case:
if (i === 0) return <Hero key={i} ref={refs[i]!} />;
```

- [ ] **Step 4: 感官验收 §7 验收 1**

Run: `pnpm --filter @lyra/website dev`
Expected: 打开就是完整 hero — 天琴座在右上、8s 水彩循环、hero 大字 + 英文斜体、输入框、下方 hint、底部 ↓ 3s 后消失。**访客不用滚也能感受到 Lyra 在**。

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/website/src/components/ScrollHint.tsx 音乐播放器/website/src/sections/Hero.tsx 音乐播放器/website/src/App.tsx
git commit -m "feat(website): assemble Hero section — she's already waiting (Task 8)"
```

---

## Task 9: §1 Listening + §2 OneSongOneLine + §3 Memory + 插图 3 件

**Files:**
- Create: `音乐播放器/website/src/components/illust/Window.tsx`
- Create: `音乐播放器/website/src/components/illust/CoverMock.tsx`
- Create: `音乐播放器/website/src/components/illust/MemoryFile.tsx`
- Create: `音乐播放器/website/src/sections/Listening.tsx`
- Create: `音乐播放器/website/src/sections/OneSongOneLine.tsx`
- Create: `音乐播放器/website/src/sections/Memory.tsx`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: `LISTENING / ONE_SONG_ONE_LINE / MEMORY` from ledger
- Produces: 3 个 forwardRef section 组件

- [ ] **Step 1: 写入 illust/Window.tsx**

```tsx
export function Window() {
  return (
    <svg viewBox="0 0 200 260" width="200" height="260" style={{ opacity: 0.9 }}>
      {/* 窗框 */}
      <rect x="30" y="30" width="140" height="180" fill="none"
            stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
      <line x1="100" y1="30" x2="100" y2="210" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      <line x1="30" y1="120" x2="170" y2="120" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
      {/* 窗台 */}
      <line x1="20" y1="215" x2="180" y2="215" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      {/* 小灯 */}
      <circle cx="50" cy="240" r="6" fill="#f5c76a" opacity="0.8" />
      <circle cx="50" cy="240" r="16" fill="#f5c76a" opacity="0.15" />
      {/* 透进的一束微光 */}
      <path d="M 100 30 L 60 210 L 140 210 Z"
            fill="#f5c76a" opacity="0.08" />
    </svg>
  );
}
```

- [ ] **Step 2: 写入 illust/CoverMock.tsx**

模拟一张 Lyra 中央界面 mock:一张水彩封面 + 一根光带占位:

```tsx
import { WatercolorCover } from './WatercolorCover';

export function CoverMock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <WatercolorCover index={0} />
      {/* 情绪光带占位:一条水平淡橙线 */}
      <div style={{
        width: 400, height: 12,
        background: 'linear-gradient(90deg, transparent, #f5c76a, #7c8ff0, transparent)',
        opacity: 0.4, borderRadius: 6,
      }} />
    </div>
  );
}
```

- [ ] **Step 3: 写入 illust/MemoryFile.tsx**

```tsx
import { MEMORY } from '../../copy/ledger';

export function MemoryFile() {
  return (
    <div style={{
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13, lineHeight: 1.8,
      background: 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(0, 0, 0, 0.06)',
      borderRadius: 8,
      padding: 24,
      maxWidth: 480,
      color: 'var(--text-color-soft)',
      userSelect: 'text',
    }}>
      {MEMORY.fileLines.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre' }}>{line || ' '}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 写入 sections/Listening.tsx**

```tsx
import { forwardRef } from 'react';
import { Window } from '../components/illust/Window';
import { LISTENING } from '../copy/ledger';

export const Listening = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{
      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 80,
      maxWidth: 900, flexWrap: 'wrap', justifyContent: 'center',
    }}>
      <Window />
      <div>
        <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 24px' }}>{LISTENING.title}</h2>
        {LISTENING.body.map((line, i) => (
          <p key={i} style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: 'var(--text-color-soft)' }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  </section>
));
Listening.displayName = 'Listening';
```

- [ ] **Step 5: 写入 sections/OneSongOneLine.tsx**

```tsx
import { forwardRef } from 'react';
import { CoverMock } from '../components/illust/CoverMock';
import { ONE_SONG_ONE_LINE } from '../copy/ledger';

export const OneSongOneLine = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{ textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 24px' }}>{ONE_SONG_ONE_LINE.title}</h2>
      {ONE_SONG_ONE_LINE.body.map((line, i) => (
        <p key={i} style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: 'var(--text-color-soft)' }}>
          {line}
        </p>
      ))}
      <div style={{ margin: '48px 0' }}>
        <CoverMock />
      </div>
      {ONE_SONG_ONE_LINE.captions.map((line, i) => (
        <p key={i} style={{
          fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
          fontSize: 16, color: 'var(--text-color-soft)', margin: '8px 0',
        }}>
          &ldquo;{line}&rdquo;
        </p>
      ))}
    </div>
  </section>
));
OneSongOneLine.displayName = 'OneSongOneLine';
```

- [ ] **Step 6: 写入 sections/Memory.tsx**

```tsx
import { forwardRef } from 'react';
import { MemoryFile } from '../components/illust/MemoryFile';
import { MEMORY, FOOTER } from '../copy/ledger';

export const Memory = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{
      display: 'flex', flexDirection: 'row', gap: 60, alignItems: 'center',
      maxWidth: 1000, flexWrap: 'wrap', justifyContent: 'center',
    }}>
      <MemoryFile />
      <div style={{ maxWidth: 380 }}>
        <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 24px' }}>{MEMORY.title}</h2>
        {MEMORY.body.map((line, i) => (
          <p key={i} style={{ fontSize: 17, lineHeight: 1.8, margin: 0, color: 'var(--text-color-soft)' }}>
            {line}
          </p>
        ))}
        <a
          href={`${FOOTER.githubUrl}/blob/main/docs/superpowers/samples/memory.md`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-block', marginTop: 24,
            fontSize: 14, color: 'var(--text-color-dim)',
            textDecoration: 'none', borderBottom: '1px dashed currentColor',
          }}
        >
          {MEMORY.sampleLink}
        </a>
      </div>
    </div>
  </section>
));
Memory.displayName = 'Memory';
```

- [ ] **Step 7: App.tsx 挂上 3 个 section**

替换 map 里 index 1/2/3 的分支:

```tsx
if (i === 1) return <Listening key={i} ref={refs[i]!} />;
if (i === 2) return <OneSongOneLine key={i} ref={refs[i]!} />;
if (i === 3) return <Memory key={i} ref={refs[i]!} />;
```

- [ ] **Step 8: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected: 从 hero 往下滚,依次看到窗 + `她在听。`、封面 mock + `一首歌,一句话。` + italic 引用、memory.md 代码块 + `她记得那晚你在听什么。` + `她的记忆样例 →` link。背景色平滑跟着 scroll 变。

- [ ] **Step 9: Commit**

```bash
git add 音乐播放器/website/src/components/illust 音乐播放器/website/src/sections 音乐播放器/website/src/App.tsx
git commit -m "feat(website): §1 Listening + §2 OneSong + §3 Memory (Task 9)"
```

---

## Task 10: §4 Dream + §5 Silence + §6 Growth

**Files:**
- Create: `音乐播放器/website/src/sections/Dream.tsx`
- Create: `音乐播放器/website/src/sections/Silence.tsx`
- Create: `音乐播放器/website/src/sections/Growth.tsx`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: `Constellation`(fullscreen mode)、`DREAM / SILENCE / GROWTH` from ledger
- Produces: 3 个 forwardRef section 组件。§4 内嵌 fullscreen Constellation;§5 无额外动效(光弦静默由 LyraString 自己钩子处理);§6 视觉上双光弦通过再叠一根 SVG 达成

- [ ] **Step 1: 写入 sections/Dream.tsx**

```tsx
import { forwardRef } from 'react';
import { Constellation } from '../components/Constellation';
import { DREAM } from '../copy/ledger';

interface Props { active: boolean; }

export const Dream = forwardRef<HTMLElement, Props>(({ active }, ref) => (
  <section ref={ref} style={{ position: 'relative' }}>
    <Constellation mode="fullscreen" active={active} />
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{DREAM.title}</h2>
      {DREAM.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Dream.displayName = 'Dream';
```

- [ ] **Step 2: 写入 sections/Silence.tsx**

```tsx
import { forwardRef } from 'react';
import { SILENCE } from '../copy/ledger';

export const Silence = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{ textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{SILENCE.title}</h2>
      {SILENCE.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Silence.displayName = 'Silence';
```

- [ ] **Step 3: 写入 sections/Growth.tsx**

```tsx
import { forwardRef } from 'react';
import { GROWTH } from '../copy/ledger';

/**
 * §6 双光弦:一条水平中央装饰线拆成两根 SVG stroke,视觉上暗示"两个 loop 平行前进"。
 * 全局 LyraString 在这一节仍存在,双光弦是 §6 自己的额外装饰。
 */
export const Growth = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref} style={{ position: 'relative' }}>
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.3 }}
    >
      <defs>
        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c76a" />
          <stop offset="100%" stopColor="#7c8ff0" />
        </linearGradient>
      </defs>
      <path d="M 380 0 Q 400 300 380 600" stroke="url(#growthGrad)" strokeWidth="1" fill="none" />
      <path d="M 420 0 Q 400 300 420 600" stroke="url(#growthGrad)" strokeWidth="1" fill="none" opacity="0.6" />
    </svg>
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 640 }}>
      <h2 style={{ fontSize: 32, fontWeight: 400, margin: '0 0 32px' }}>{GROWTH.title}</h2>
      {GROWTH.body.map((line, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.9, margin: '4px 0', color: 'var(--text-color-soft)',
        }}>
          {line}
        </p>
      ))}
    </div>
  </section>
));
Growth.displayName = 'Growth';
```

- [ ] **Step 4: 修改 App.tsx 挂 3 个 section 并传 active state**

```tsx
if (i === 4) return <Dream key={i} ref={refs[i]!} active={active === 4} />;
if (i === 5) return <Silence key={i} ref={refs[i]!} />;
if (i === 6) return <Growth key={i} ref={refs[i]!} />;
```

同时把 App.tsx 顶部 `<Constellation mode="hero" active={true} />` 挂到 hero 内部(已在 Task 8 完成);**移除 App.tsx 里之前 index 4 的临时 fullscreen constellation 分支**——现在归 Dream 组件内部管。

- [ ] **Step 5: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected:
- 滚到 §4:整个屏幕转为深靛蓝 + 反白字,天琴座 5 星全屏放大,2s 后 ζ 星流星,`她会做梦。` 大字反白
- 滚到 §5:仍深靛,`她宁愿沉默,也不放错的歌。`,光弦静止 8s
- 滚到 §6:回到清晨米白,两根光弦淡淡贯穿,`她也在长大。`

- [ ] **Step 6: Commit**

```bash
git add 音乐播放器/website/src/sections 音乐播放器/website/src/App.tsx
git commit -m "feat(website): §4 Dream + §5 Silence + §6 Growth (Task 10)"
```

---

## Task 11: Footer + 下载按钮

**Files:**
- Create: `音乐播放器/website/src/sections/Footer.tsx`
- Modify: `音乐播放器/website/src/App.tsx`

**Interfaces:**
- Consumes: `FOOTER` from ledger
- Produces: 一个 forwardRef Footer section,3 个下载按钮全部 link 到 `FOOTER.releasesUrl`,`GitHub` 链接 link 到 `FOOTER.githubUrl`

- [ ] **Step 1: 写入 sections/Footer.tsx**

```tsx
import { forwardRef } from 'react';
import { FOOTER } from '../copy/ledger';

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 24px',
  borderRadius: 22,
  border: '1px solid rgba(0, 0, 0, 0.15)',
  background: 'rgba(255, 255, 255, 0.5)',
  backdropFilter: 'blur(20px)',
  color: 'var(--text-color)',
  textDecoration: 'none',
  fontSize: 14,
  transition: 'background var(--motion-fast) var(--ease-out)',
};

export const Footer = forwardRef<HTMLElement>((_, ref) => (
  <section ref={ref}>
    <div style={{ textAlign: 'center', maxWidth: 640 }}>
      <p style={{
        fontFamily: 'var(--font-serif-italic)', fontStyle: 'italic',
        fontSize: 24, color: 'var(--text-color-soft)', margin: '0 0 40px',
      }}>
        {FOOTER.tagline}
      </p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {(['mac', 'win', 'linux'] as const).map((k) => (
          <a key={k} href={FOOTER.releasesUrl} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
            {FOOTER.downloads[k]}
          </a>
        ))}
      </div>
      <p style={{ marginTop: 32, fontSize: 13, color: 'var(--text-color-dim)' }}>
        {FOOTER.early}
      </p>
      <p style={{ marginTop: 48, fontSize: 13 }}>
        <a href={FOOTER.githubUrl} target="_blank" rel="noopener noreferrer"
           style={{ color: 'var(--text-color-dim)', textDecoration: 'none' }}>
          GitHub
        </a>
      </p>
    </div>
  </section>
));
Footer.displayName = 'Footer';
```

- [ ] **Step 2: 修改 App.tsx 使用 Footer 组件**

```tsx
if (i === 7) return <Footer key={i} ref={refs[i]!} />;
```

同时把 App.tsx 里所有临时占位 `<h2>{titles[i]}</h2>` 分支都应该已被替换掉(hero + 6 个 section + footer);删除 map 里的兜底 `return <section>...` 分支或改成 `throw new Error('unhandled section')` 以让漏挂立即暴露。

**清理后的 App.tsx 完整版**:

```tsx
import { useRef, useState } from 'react';
import { AmbientBackground } from './components/AmbientBackground';
import { LyraString } from './components/LyraString';
import { useSectionAmbient } from './hooks/useSectionAmbient';
import { SECTION_COLORS, DARK_SECTIONS } from './theme/ambient';
import { Hero } from './sections/Hero';
import { Listening } from './sections/Listening';
import { OneSongOneLine } from './sections/OneSongOneLine';
import { Memory } from './sections/Memory';
import { Dream } from './sections/Dream';
import { Silence } from './sections/Silence';
import { Growth } from './sections/Growth';
import { Footer } from './sections/Footer';

export default function App() {
  const refs = Array.from({ length: 8 }, () => useRef<HTMLElement>(null));
  const [active, setActive] = useState(0);
  useSectionAmbient(refs, {
    colors: SECTION_COLORS,
    darkSections: DARK_SECTIONS,
    onActiveChange: setActive,
  });

  return (
    <>
      <AmbientBackground />
      <LyraString activeSectionIndex={active} silentSectionIndex={5} />
      <main>
        <Hero ref={refs[0]!} />
        <Listening ref={refs[1]!} />
        <OneSongOneLine ref={refs[2]!} />
        <Memory ref={refs[3]!} />
        <Dream ref={refs[4]!} active={active === 4} />
        <Silence ref={refs[5]!} />
        <Growth ref={refs[6]!} />
        <Footer ref={refs[7]!} />
      </main>
    </>
  );
}
```

- [ ] **Step 3: 感官验收**

Run: `pnpm --filter @lyra/website dev`
Expected: 滚到底,看到 `你若来,她一直都在。` italic 大字 + 3 个 pill 下载按钮(点击去 GitHub Releases) + `v0.2 · early. 她还没学完话。` + 底部 `GitHub` 链接。

- [ ] **Step 4: Commit**

```bash
git add 音乐播放器/website/src/sections/Footer.tsx 音乐播放器/website/src/App.tsx
git commit -m "feat(website): Footer with downloads + tagline (Task 11)"
```

---

## Task 12: 全站验收 + build + Lighthouse

**Files:**
- 无新代码文件
- 可能 Modify:任何在验收里发现问题的文件

**Interfaces:**
- Consumes: 全部前置 tasks
- Produces: 一个可 `pnpm --filter @lyra/website build` 出静态产物、通过 §7 验收清单的可发布网站

- [ ] **Step 1: 全站感官验收(Spec §7 全 8 条)**

Run: `pnpm --filter @lyra/website dev`

依次验证并勾选:

  1. [ ] 打开就是 Hero,访客不用滚也能感受到 Lyra 在(氛围 + 光弦 + 天琴座 + 8s demo + 输入框都在位)
  2. [ ] 从顶滚到底,时段基色平滑无跳变;§4/§5 的字色反转正确
  3. [ ] 光弦任何时候都不刺眼,访客可无视但注意时能感到"活着";§5 静默 8s 真的静默
  4. [ ] DevTools rendering panel 开 `prefers-reduced-motion: reduce`,所有动画退化到瞬时或静态,页面完全可读
  5. [ ] Hero 输入框留信 → 关闭页面 → 再打开,占位符变成 "你上次说的那句,她还记着。再说一句吗?"
  6. [ ] Chrome + Safari(macOS)+ Edge 各截一张 hero 图,视觉一致(字体、圆角、阴影一致)
  7. [ ] Lighthouse Performance ≥ 90(见 Step 3)
  8. [ ] 无 console error、无 React hydration warning

- [ ] **Step 2: production build**

Run: `pnpm --filter @lyra/website build`
Expected:
- 无 TypeScript error
- 产物在 `音乐播放器/website/dist/`
- `du -sh 音乐播放器/website/dist/` 观察总大小(未 gzip)

Run: `pnpm --filter @lyra/website preview`
在 preview 打开的 URL 上再过一遍 Step 1 的清单。

- [ ] **Step 3: Lighthouse 检查**

DevTools → Lighthouse → Desktop → Performance + Accessibility → Generate report(需在 preview 模式,不能在 dev 模式)。

Expected:
- Performance ≥ 90
- Accessibility ≥ 95

若不达标,常见修复:
- 缺 `alt` / `aria-label`:补 aria(所有装饰 SVG 已有 `aria-hidden="true"`,主内容 h1/h2/link 已默认可读)
- Google Fonts 拖 LCP:在 index.html 用 `<link rel="preload" as="style">` 或降级到 system serif
- CLS 高:确认 `HeroDesktop` 的 `visible` 切换用 opacity 而不是 mount/unmount(已如此设计)

- [ ] **Step 4: bundle 大小检查**

Run: `find 音乐播放器/website/dist -name '*.js' -o -name '*.css' | xargs -I{} sh -c 'gzip -c {} | wc -c | awk -v f={} "{print f, \$1}"'`

Expected: 总 gzip < 500 KB。React runtime 大概 45 KB gzip,应用代码 < 50 KB gzip 是合理目标。

若超过,常见问题:
- 意外引入了大依赖 → `pnpm --filter @lyra/website why <包名>` 排查
- SVG 内联过大 → 检查 illust/*.tsx 有无冗余 path

- [ ] **Step 5: Commit(若前面步骤修了任何东西)**

若 Step 1-4 有任何修改,commit:

```bash
git add 音乐播放器/website
git commit -m "chore(website): acceptance pass — reduced-motion, a11y, bundle (Task 12)"
```

若无修改,跳过 commit,直接进入下一步。

- [ ] **Step 6: 打 v0.1 tag**

```bash
git tag -a website-v0.1 -m "Lyra 官网 v0.1 — Hero + 6 sections + Footer, ready for Cloudflare Pages"
```

**至此 v0.1 完成。**下一步(不在本 plan 内):
- 部署到 Cloudflare Pages / GitHub Pages
- 定域名
- 打 Tauri build 后回来把 3 个下载按钮改成直链

---

## Self-Review

**1. Spec coverage** — 对照 spec §1..§8:
- §1 骨相 5 条 → 全站 CSS globals + 组件设计已体现(无导航栏在 App.tsx 直接不做、反 chrome 在验收里检查、克制到 chrome 缺失在组件规格里落实)
- §2 项目骨架 → Task 1-3 落地
- §3 分节结构(8 节 + 每节文案)→ Task 8-11 逐个实现,文案全部 pin 在 copy/ledger.ts(Task 2)
- §4.1 Hero γ 8s demo → Task 7
- §4.2 BottleInput → Task 6
- §4.3 光弦 + §5 静默 → Task 4
- §4.4 Constellation → Task 5
- §4.5 滚动 → 时段基色 → Task 3
- §4.6 手绘 SVG 插图 → Task 5(Constellation)、Task 7(WatercolorCover)、Task 9(Window/CoverMock/MemoryFile)、Task 10(Growth 双弦)
- §5 组件依赖图 → App.tsx 完整版(Task 11 Step 2)一比一对应
- §6 反范围 → 全 plan 无引入 nav/router/tracker/cookie/newsletter/搜索等
- §7 验收 8 条 → Task 12 Step 1 逐条勾选
- §8 开放问题 5 条 → v0.1 均按 spec 里的默认(抽象水彩不找 illustrator / releases 页而非 dmg 直链 / GitHub link 占位为 `https://github.com/daoyu/lyra` — 若你 repo URL 不是这个,ledger.ts 里改)

**2. Placeholder scan** — 通过。所有 "TBD/TODO" 类只出现在:
- `theme/ambient.ts` 的注释 `// TODO: 待 app 侧导出后改为 relative import` — 是合理的对齐 TODO,不是本 plan 未完成
- `useLetterInBottle.ts` 里 spec 提到的 "灌输 > 50 条 v2 再管" — 未写进代码,不是 v0.1 目标

**3. Type consistency** — 通过。抽查:
- `useSectionAmbient` 的 opts 包含 `onActiveChange`(Task 3 Step 6 定义,Task 4 Step 3 使用)—— ✓ 一致
- `Constellation` 的 `mode: 'hero' | 'fullscreen'` + `active: boolean`(Task 5 定义,Task 8/10 使用)—— ✓
- `LyraString` 的 `activeSectionIndex + silentSectionIndex`(Task 4 定义,Task 11 使用)—— ✓
- `useLetterInBottle` 返回 `{ hasPreviousLetter, save }`(Task 6 定义,BottleInput 使用)—— ✓
- `HeroDesktop` / `BottleInput` / `ScrollHint` 均无 props(Task 6-8)—— ✓
- `Dream` 的 `active: boolean` 是 forwardRef 的第二个 props 参数(Task 10)—— 需注意:forwardRef 的 props 类型是 `<HTMLElement, { active: boolean }>`,已按此声明 ✓

Plan self-review 通过,直接进入 handoff。
