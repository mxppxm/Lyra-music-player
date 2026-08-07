// library/parseTrackIdentity.ts — 统一使用 @lyra/core 实现
// （app 桌面端与 core 共用同一解析逻辑，避免「点歌」与「B 站兜底」
//   两条路径解析出不同 songTitle/artist）
export * from "@lyra/core/library/parseTrackIdentity";
