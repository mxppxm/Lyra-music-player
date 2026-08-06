# Lyra

[English](./README.md) · **简体中文**

> **Between the things you say. 未成曲调先有情。**

一个会为你歌唱、记得你、自我成长的音乐 agent。**不只是一个音乐播放器。**

Lyra 是一款 **pnpm monorepo** 形式的音乐 agent，基于 **React 19** + **TypeScript 5** 构建。它以 **Tauri 2 桌面应用**（`app/`）和 **iOS 应用**（`app-mobile/`，基于 Capacitor）两种形态发布，共享同一套核心 `@lyra/core`。它管理你的本地音乐库、维护情绪状态，并通过 LLM 后端实时推荐与播放歌曲——随着你与它的互动，逐步理解你的心境与审美。

## 仓库结构

```
Lyra-music-player/                  # pnpm monorepo（pnpm-workspace.yaml）
├── app/                            # Tauri 2 桌面应用（React + Rust）
├── app-mobile/                     # iOS 应用（Capacitor 7 + React）
├── packages/
│   ├── core/                       # @lyra/core — 共享 agent 大脑（agents / memory / library / providers）
│   ├── platform/                   # @lyra/platform — 平台接口契约
│   ├── platform-desktop/           # @lyra/platform-desktop — 桌面实现（Tauri IPC）
│   └── platform-ios/               # @lyra/platform-ios — iOS 实现（原生音频插件、Capacitor）
├── website/                        # 官方网站（Vite）
├── docs/                           # 产品文档、计划、规格与设计笔记
│   ├── business-model.md
│   ├── emotional-computing.md
│   ├── feature-gaps.md
│   ├── music-licensing-policy.md
│   ├── promotion-strategy.md
│   └── superpowers/                # plans/ 与 specs/
├── scripts/                        # 共享构建 / 资源脚本
├── start.sh                        # 便捷启动脚本 — cd app && pnpm tauri dev
└── 需求.md                         # 原始产品需求（中文）
```

应用层的桌面开发者指南见 [`app/README.md`](./app/README.md)。

## 核心特性

- **本地音乐库** — 基于 SQLite 存储（桌面：`tauri-plugin-sql`；iOS：`@capacitor-community/sqlite`）元数据与收听历史；通过 bigram 分词 + 歌词语义嵌入快速匹配中文歌曲
- **情感 agent 状态** — 用 PAD 模型（愉悦度 / 激活度 / 支配度）追踪心境、收听模式与审美偏好；感知层将 LLM 判断、规则信号与 Open-Meteo 天气融合进当前情绪状态
- **多 LLM 支持** — 可插拔 provider（Anthropic、DeepSeek、智谱），外加 OpenAI 兼容网关（桌面为 SupaNet `fxb`，iOS/core 为 SenseNova），支持自动 fallback 与瞬时错误重试；歌词搜索使用 OpenAI 嵌入
- **歌曲推荐** — 通过 `song-recommender` 策略按时间段与心境推荐歌曲
- **Bilibili 集成** — 访问 `api.bilibili.com` 的 CORS 代理、DASH 音频流播放、FFT 提取音频特征（能量、频谱质心 → 真实 PAD），以及歌词提取与语义嵌入
- **iOS 原生播放** — 自研 `LyraAudioPlugin`，配套原生播放队列，支持后台长时收听、锁屏控制与灵动岛（Live Activity）
- **沉浸式播放器** — 一键启动 Lyra、跨切歌保持的沉浸式界面、情绪光晕背景，以及克制的动效（crossfade、AnimatedMount 蒙层、可折叠 dock）
- **山水首页** — 水墨 Canvas 叠加摄影背景，营造房间的整体气质
- **每周信件** — 每个星期天，Lyra 以第一人称给你写一封本周回顾（Rust `weekly.rs` + HTML 渲染）
- **系统集成** — Tauri 插件处理 opener（URI / 路径）与通知；托盘呼吸图标；真机调试日志面板（iOS）

## 技术栈

### 共享层（`packages/`）
- **@lyra/core** — 平台无关的 agent 大脑：agents、memory、library、providers、recommendation
- **@lyra/platform** + **@lyra/platform-desktop** + **@lyra/platform-ios** — 接口契约与各平台实现

### 桌面端（`app/`）
- **React 19** + **TypeScript 5**
- **Vite 7** 打包与开发服务器
- **Vitest 1.6** + **Testing Library** 单元与组件测试
- **@tauri-apps/api** 与后端 IPC 通信

### iOS 端（`app-mobile/`）
- **Capacitor 7**，配合 `@capacitor-community/sqlite`、filesystem、preferences
- **自研 `LyraAudioPlugin`** — 原生音频播放队列，支持后台收听、锁屏控制与 Live Activity
- 通过 workspace 依赖共享 `@lyra/core` 的 agent 逻辑；移动端 UI 外壳位于 `app-mobile/src`

### 后端（Rust，桌面端）
- **Tauri 2** 桌面框架
- **SQLite**（通过 `tauri-plugin-sql`）持久化存储
- **rodio**（symphonia 后端）音频播放
- **reqwest** 承担 Bilibili CORS 代理与 DASH 流下载；**lofty** 解析元数据；**rustfft** 提取音频特征
- API key 以 `secrets.json` 形式存放在应用数据目录（并非系统钥匙串，详见[持久化与配置](#持久化与配置)）

### 工具链
- **pnpm 10.27** 包管理器 + workspaces
- **@tauri-apps/cli** / **@capacitor/cli** 构建与打包

## 快速开始

### 环境要求

- **Node.js** 18+，配合 **pnpm 10.27**
- **Rust stable**（1.77+，适配 Tauri 2）— 桌面后端所需
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

**重要：`app-mobile` 是 Capacitor 项目，不是 React Native。** 它的 UI 是 React + Vite 写的 **Web 代码**，真正打到 iOS App 里的是一套被 `WKWebView` 加载的静态网页资源（`dist/` → `ios/App/App/public/`），而不是直接编译进二进制的原生代码。

首次构建：

```bash
cd app-mobile
pnpm install
pnpm build && pnpm cap:sync    # 打包 JS 并同步原生 iOS 工程
# 然后在 Xcode 中打开 / 构建：pnpm cap:open
```

#### 修改 Web 代码（`.tsx` / `.js` / `.css`）后，必须同步才能上真机

- 你改的这些文件属于「网页源码」，**不会**因为直接 `xcodebuild` 编译而更新。
- 原生 App 加载的是 `ios/App/App/public/` 里的静态文件，只有把新编译的资源同步进去，真机才会显示新代码。
- 因此每次改完 Web 代码，都要重复 **打包 → 同步 → 编译** 三连（第 1、2 步可合并）：

```bash
cd app-mobile
npx cap sync ios        # 1) 自动跑 build 并把新网页拷进 ios/App/App/public
# 2) 然后重新编译安装（Xcode Run，或 xcodebuild）
```

> 注意：仅当你**改了原生 Swift 代码**（`ios/App/App/*.swift`，如 `Lyra*Plugin`）或**增减了原生插件**时，才必须重新编译原生层；只改页面的话原生壳不需要重编，但同步步骤（`npx cap sync ios`）不能省。

运行真机调试控制台的方式见下文 [移动调试日志面板](#移动调试日志面板-app-mobile) 章节。

## 持久化与配置

- **SQLite 数据库** — `~/Library/Application Support/com.daoyu.lyra/lyra.db`（桌面端）
- **API key 与机密** — 桌面端：以明文 JSON（`secrets.json`）存放在应用数据目录（**未使用** `keyring` crate / 系统钥匙串）；iOS 端：Capacitor Preferences
- **Bundle ID** — 桌面端 `com.daoyu.lyra`；iOS 端 `com.jiuri.lyra`

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
- **共享大脑**：`packages/core`（`@lyra/core`）承载平台无关的 agent 逻辑，桌面端与 iOS 端都消费它。跨平台行为请放在这里，而不是各应用外壳里。注意：`app/src` 中仍有多个子系统（`db`、`providers`、`recommendation`、`memory`、`proactive`、`reflect`）的本地副本，早于 packages 拆分、且已产生分叉——桌面 boot 注册 SupaNet `fxb` 网关，而 core 注册 SenseNova。触碰到这些代码时请迁移到 `@lyra/core`。
- **Rust crate 名称**：`Cargo.toml` 目前仍使用 `name = "app"` 与 `lib.name = "lyra_lib"`，将在后续统一重命名扫荡中调整。产品/项目名统一为 "Lyra"。
- **已知技术债**：桌面端机密以明文 JSON 存储，未接入系统钥匙串；替换为真正的 keychain 存储已列入待办。

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
