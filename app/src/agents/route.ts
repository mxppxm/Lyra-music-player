// agents/route.ts — 统一使用 @lyra/core 的路由/降级实现
// （provider registry 已统一为 core 单例；app 侧 EngineerAgent/WeeklyAgent/
//   ReflectAgent/LLMPerceptionAgent 与 core agents 共享同一 retry/backoff
//   语义与 fallback 链，避免主链与感知链降级行为漂移）
export * from "@lyra/core/agents/route";
