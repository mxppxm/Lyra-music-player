// providers/registry.ts — 统一使用 @lyra/core 的 ProviderRegistry 单例
// （app 桌面端 bootProviders 注册与 core Orchestrator/agents 查询必须
//   命中同一 registry，否则桌面端 new EmotionAgent() 会因 core registry
//   为空而抛错、createDefaultOrchestrator 返回 null）
export * from "@lyra/core/providers/registry";
