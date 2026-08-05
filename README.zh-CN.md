# Lyra

[English](./README.md) · **简体中文**

> **Between the things you say. 未成曲调先有情。**

一个会为你歌唱、记得你、自我成长的音乐 agent。**不只是一个音乐播放器。**

Lyra 是一款**pnpm monorepo** 形式的音乐 agent，基于 **React 19** + **TypeScript 5** 构建。它以 **Tauri 2 桌面应用**（`app/`）和 **iOS 应用**（`app-mobile/`，基于 Capacitor）两种形态发布，共享同一套核心 `@lyra/core`。它管理你的本地音乐库、维护情绪状态，并通过 LLM 后端实时推荐与编排歌曲——随着你与它的互动，逐步理解你的心境与审美。

## 仓库结构

```
Lyra-music-player/                  # pnpm monorepo（pnpm-workspace.yaml）
├── app/                            # Tauri 2 桌面应用（React + Rust）
├── app-mobile/                     # iOS 应用（Capacitor 7 + React）
├── packages/
│   ├── core/                       # @lyra/core — 共享 agent 大脑（agents / memory / library）
│   ├── platform/                   # @lyra/platform — 平台接口契约
│   ├── platform-desktop/           # @lyra/platform-desktop — 桌面实现
│   └── platform-ios/               # @lyra/platform-ios — iOS 实现（原生音频插件）
├── website/                        # 官方网站（Vite）
├── docs/                           # 产品文档、计划、规格与设计笔记
│   ├── business-model.md
│   ├── emotional-computing.md
│   ├── feature-gaps.md
│   ├── music-licensing-policy.md
│   ├── promotion-strategy.md
│   └── superpowers/                # plans / specs / tuning notes
├── scripts/                        # 共享构建 / 资源脚本
├── start.sh                        # 便捷启动脚本 — cd app && pnpm tauri dev
└── 需求.md                         # 原始产品需求（中文）
```

应用层的桌面开发者指南见 [`app/README.md`](./app/README.md)。

## 核心特性

- **本地音乐库** — 基于 SQLite 存储元数据与收听历史；通过 bigram 分词 + 歌词语义搜索快速匹配中文歌曲
- **情感 agent 状态** — 用 PAD 模型追踪心境、收听模式与审美偏好
- **多 LLM 支持** — 可插拔的模型 provider（Anthropic、DeepSeek、智谱、豆包、OpenAI、本地 Ollama，以及 SenseNova / SupaNet 网关），支持自动 fallback 与瞬时错误重试
- **歌曲推荐** — 通过 `song-recommender` 策略按时间段与心境推荐歌曲
- **iOS 原生播放** — 自研 `LyraAudioPlugin`（mediagrid → 原生），配套原生播放队列，支持后台长时收听、锁屏与灵动岛控制
- **沉浸式播放器** — 一键启动 Lyra、跨切歌保持的沉浸式界面、情绪光晕背景、动效打磨（FLIP dock、crossfade、AnimatedMount 蒙层）
- **山水首页** — 水墨 Canvas 叠加摄影背景，营造房间的整体气质
- **每周信件** — 每个星期天，Lyra 以第一人称给你写一封本周回顾
- **系统集成** — 通过 `keyring` 访问系统钥匙串，通过 Tauri 插件处理文件对话框与 URI（桌面）；真机调试日志面板（iOS）

## 技术栈

### 共享层（`packages/`）
- **@lyra/core** — 平台无关的 agent 大脑：agents、memory、library、LLM 调用点
- **@lyra/platform** + **@lyra/platform-desktop** + **@lyra/platform-ios** — 接口契约与各平台实现

### 桌面端（`app/`）
- **React 19** + **TypeScript 5**
- **Vite 7** 打包与开发服务器
- **Vitest 1.6** + **Testing Library** 单元与组件测试
- **@tauri-apps/api** 与后端 IPC 通信

### iOS 端（`app-mobile/`）
- **Capacitor 7**（iOS），配合 `@capacitor-community/sqlite`、filesystem、preferences
- **自研 `LyraAudioPlugin`** — 原生音频播放队列，支持后台收听与锁屏控制
- 通过 workspace 依赖共享 `@lyra/core` 的 UI 组件（MobileHomeView）

### 后端（Rust，桌面端）
- **Tauri 2** 桌面框架
- **SQLite**（通过 `tauri-plugin-sql`）持久化存储
- **rodio**（symphonia 后端）音频播放
- **keyring** 安全存储凭据（macOS 原生）

### 工具链
- **pnpm 10.27** 包管理器 + workspaces
- **@tauri-apps/cli** / **@capacitor/cli** 构建与打包

## 快速开始

### 环境要求

- **Node.js** 18+，配合 **pnpm 10.27**
- **Rust 1.70+**（Tauri 桌面后端）
- **Xcode 命令行工具**（macOS）— iOS 还需 **Xcode 15+** 与 `@capacitor/cli`

### 快速运行

```bash
# 克隆
git clone git@github.com:daoyuly/Lyra-music-player.git
cd Lyra-music-player

# 从 monorepo 根目录安装全部 workspace 依赖
pnpm install

# 启动桌面应用（开发模式）
sh start.sh
# — 等价于：
#   cd app && pnpm tauri dev
```

### 常用命令（在 `app/` 目录下执行）

```bash
pnpm tauri dev       # 热重载启动桌面应用
pnpm typecheck       # TypeScript 类型检查
pnpm test            # 一次性运行全部测试
pnpm test:watch      # Vitest 监听模式
pnpm build           # Vite 生产构建
pnpm tauri build     # 打包可分发的二进制
```

### iOS 端（`app-mobile/`）

```bash
cd app-mobile
pnpm install
pnpm build && pnpm cap:sync    # 打包 JS 并同步原生 iOS 工程
# 然后在 Xcode 中打开 / 构建：pnpm cap:open
```

运行真机调试控制台的方式见下文 [移动调试日志面板](#移动调试日志面板-app-mobile) 章节。

## 持久化与配置

- **SQLite 数据库** — `~/Library/Application Support/com.daoyu.lyra/lyra.db`
- **钥匙串** — API key 与机密通过 macOS 原生钥匙串存储（`keyring` crate）
- **Bundle ID** — `com.daoyu.lyra`

## 提交规范

所有提交使用 conventional commits 风格，scope 固定为 `lyra`：

```
feat(lyra):     新功能
fix(lyra):      bug 修复
docs(lyra):     文档
refactor(lyra): 无行为变化的重构
test(lyra):     测试
chore(lyra):    构建、依赖、工具
```

## 贡献

1. 从 `main` 拉出分支：`git checkout -b feat/lyra-my-feature`
2. 按规范提交
3. 验证：`pnpm typecheck && pnpm test`
4. 提交 PR

## 文档

- [应用开发者指南](./app/README.md) — 桌面端环境、结构、IPC 与内部细节
- [移动调试日志面板](#移动调试日志面板-app-mobile) — `app-mobile` 的真机调试控制台
- [商业模式](./docs/business-model.md)
- [情感计算](./docs/emotional-computing.md)
- [功能缺口](./docs/feature-gaps.md)
- [音乐授权策略](./docs/music-licensing-policy.md)
- [推广策略](./docs/promotion-strategy.md)
- [设计规格与计划](./docs/superpowers/)

## 许可

专有 — 除非仓库根目录存在 LICENSE 文件另作说明，否则保留一切权利。

## 维护者备忘

- **Agent 定位**：Lyra 是一个音乐 *agent* — 不是播放器，也不是推荐工具，而是一个会通过对话学习与成长的对话实体。设计决策围绕这一 agency 模型展开。
- **共享大脑**：`packages/core`（`@lyra/core`）承载平台无关的 agent 逻辑，桌面端与 iOS 端都消费它。跨平台行为请放在这里，而不是各应用外壳里。
- **Rust crate 名称**：`Cargo.toml` 目前仍使用 `name = "app"` 与 `lib.name = "lyra_lib"`，将在后续统一重命名扫荡中调整。产品/项目名统一为 "Lyra"。

## 移动调试日志面板（`app-mobile`）

iOS 应用（`app-mobile/`）内置一个隐藏的真机调试控制台：`OnScreenLog`
（`app-mobile/src/App.tsx`）拦截 `console.log/warn/error`（仅以 `[lyra` 开头的行）
并把它们渲染到设备屏幕上一个悬浮的半透明面板上，因此真机调试无需 Xcode 控制台。

**它已被编译排除在正式构建之外——正常构建中完全没有该 UI。** 启用方式：

1. 在 `app-mobile/.env.production.local`（已被 git 忽略，切勿提交任何 key）写入：
   ```
   VITE_LYRA_DEBUG_LOG=true
   ```
2. 重新构建并部署应用：
   ```bash
   pnpm -C app-mobile build
   pnpm -C app-mobile cap:sync
   cd app-mobile/ios/App
   xcodebuild build -workspace App.xcworkspace -scheme App \
     -configuration Debug -destination 'platform=iOS,id=<设备UDID>' \
     -derivedDataPath ../DerivedData
   xcrun devicectl device install app --device <设备UDID> ../DerivedData/Build/Products/Debug-iphoneos/App.app
   xcrun devicectl device process launch --device <设备UDID> com.jiuri.lyra
   ```

启用后，面板默认收起——点击右下角的小 **📜 日志(off)** 按钮展开；点击面板标题栏可再次收起。日志最多保留 200 行。从 env 文件中删除 `VITE_LYRA_DEBUG_LOG` 并重新构建即可发布干净版本。
