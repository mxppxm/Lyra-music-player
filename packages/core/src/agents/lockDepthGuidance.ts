/** 锁定循环：按遍数注入心理深度与发问规则（写入 Companion brief）。 */
export function lockDepthGuidance(lockPlayCount: number): string {
  const n = Math.max(1, Math.floor(lockPlayCount));
  const lines: string[] = [
    "主写：为什么还停在这首、心里可能在发生什么（沉浸/确认/回避/卡住或松动）。朋友旁白，禁止诊断术语与咨询腔。",
    "禁写：拆歌词或编曲当主菜；复述情绪 labels；同义改写旧句。歌名或整体氛围最多一笔带过。",
  ];

  if (n <= 2) {
    lines.push(
      `深度阶段=轻触（第 ${n} 遍）：点「为什么会锁住 / 想停在这」的感觉。禁止发问。`,
    );
  } else if (n <= 4) {
    lines.push(
      `深度阶段=下探（第 ${n} 遍）：写可能在确认或回避什么、反复碰哪一块。可偶发一句修辞问；不要要求她回答。`,
    );
  } else if (n <= 7) {
    lines.push(
      `深度阶段=深（第 ${n} 遍）：点出「还在转」本身说明了什么；心里可能在松或在硬。修辞问为主；不要要求她回答。`,
    );
  } else {
    lines.push(
      `深度阶段=顶（第 ${n} 遍）：少而重的一刀。可偶尔抛一个可回的真问；若近期小注里已经问过，则禁止再问。真问要短、有重量，不要连环追问。`,
    );
  }

  return lines.join("\n");
}
