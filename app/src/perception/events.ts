// perception/events.ts — 统一使用 @lyra/core 的感知事件总线
// （与 core 原实现逐字节一致，re-export 保证 app 侧所有模块与 core
//   Orchestrator 共享同一个 EventBus 实例与类型，避免双总线断链）
export * from "@lyra/core/perception/events";
