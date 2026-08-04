/**
 * Chinese ↔ English mood synonym mapping for cross-language tag matching.
 *
 * When a user says "无聊" (bored), the song profile may have the English
 * mood tag "melancholic" or "lonely".  Without this mapping, `tagOverlap`
 * returns 0 because the strings share no characters.
 *
 * Design: each "synonym group" is a set of semantically equivalent mood
 * descriptors across Chinese and English.  The `expandWithSynonyms()` function
 * takes a list of user labels / query tokens and returns the original tokens
 * PLUS all synonyms from matching groups — so "无聊" expands to include
 * "melancholic", "lonely", "bored", etc.
 */

/** A synonym group: all terms are considered equivalent for matching. */
interface SynonymGroup {
  /** Canonical English key (matches profile mood tags) */
  en: string[];
  /** Chinese equivalents (matches user input / EmotionAgent labels) */
  zh: string[];
}

const MOOD_SYNONYMS: SynonymGroup[] = [
  // ── Sad / low energy ──
  { en: ["melancholic", "melancholy"], zh: ["忧郁", "伤感", "惆怅", "郁闷", "消沉", "无聊", "空虚"] },
  { en: ["sad", "sorrowful"], zh: ["悲伤", "难过", "伤心", "哀伤", "心痛"] },
  { en: ["lonely", "solitary"], zh: ["孤独", "寂寞", "孤单", "落寞", "形单影只", "无聊", "空虚"] },
  { en: ["heartbroken"], zh: ["心碎", "失恋", "断肠", "痛彻心扉"] },
  { en: ["resigned"], zh: ["无奈", "认命", "妥协", "无力", "听天由命"] },
  { en: ["vulnerable"], zh: ["脆弱", "敏感", "不堪一击", "软弱"] },
  { en: ["wistful"], zh: ["怅惘", "若有所失", "空落落", "意难平"] },

  // ── Bored / empty (the key gap!) ──
  { en: ["bored", "listless", "apathetic"], zh: ["无聊", "空虚", "乏味", "百无聊赖", "日常倦怠", "倦怠", "没意思", "情绪低落", "低落"] },

  // ── Nostalgic / reflective ──
  { en: ["nostalgic", "nostalgia"], zh: ["怀旧", "思念", "怀念", "追忆", "想念"] },
  { en: ["contemplative", "introspective"], zh: ["沉思", "冥想", "思考人生", "发呆", "放空"] },

  // ── Warm / hopeful ──
  { en: ["warm", "tender"], zh: ["温暖", "温馨", "柔和", "治愈", "暖心"] },
  { en: ["hopeful"], zh: ["希望", "期待", "憧憬", "盼望"] },
  { en: ["touching"], zh: ["感动", "触动", "暖心", "催泪"] },

  // ── Energetic / positive ──
  { en: ["adventurous"], zh: ["冒险", "刺激", "探索", "想被刺激"] },
  { en: ["triumphant"], zh: ["胜利", "凯旋", "自豪", "成就感"] },
  { en: ["determined"], zh: ["坚定", "执着", "不屈", "决心"] },
];

/**
 * Expand a list of tokens with their cross-language synonyms.
 *
 * Example: expandWithSynonyms(["无聊", "孤独"])
 *   → ["无聊", "空虚", "乏味", "百无聊赖", "日常倦怠", "倦怠", "没意思",
 *      "bored", "listless", "apathetic",
 *      "孤独", "寂寞", "孤单", "落寞", "形单影只",
 *      "lonely", "solitary"]
 */
export function expandWithSynonyms(tokens: string[]): string[] {
  const result = new Set<string>(tokens);
  const lowerTokens = tokens.map((t) => t.toLowerCase());

  for (const group of MOOD_SYNONYMS) {
    // Check if any input token matches any term in this group
    const allTerms = [...group.en, ...group.zh].map((t) => t.toLowerCase());
    const matched = lowerTokens.some((t) =>
      allTerms.some((g) => g === t || g.includes(t) || t.includes(g)),
    );

    if (matched) {
      // Add ALL terms from the matching group (both en and zh)
      for (const t of group.en) result.add(t);
      for (const t of group.zh) result.add(t);
    }
  }

  return [...result];
}

/**
 * Check if two tokens are synonyms of each other.
 * Returns true if they belong to the same synonym group.
 */
export function areSynonyms(a: string, b: string): boolean {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();

  for (const group of MOOD_SYNONYMS) {
    const allTerms = [...group.en, ...group.zh].map((t) => t.toLowerCase());
    const aInGroup = allTerms.some((t) => t === aLow || t.includes(aLow) || aLow.includes(t));
    const bInGroup = allTerms.some((t) => t === bLow || t.includes(bLow) || bLow.includes(t));
    if (aInGroup && bInGroup) return true;
  }

  return false;
}

/**
 * Get all synonyms for a single token (both directions).
 */
export function getSynonyms(token: string): string[] {
  const lower = token.toLowerCase();
  const result: string[] = [];

  for (const group of MOOD_SYNONYMS) {
    const allTerms = [...group.en, ...group.zh].map((t) => t.toLowerCase());
    const matched = allTerms.some((t) => t === lower || t.includes(lower) || lower.includes(t));
    if (matched) {
      result.push(...group.en, ...group.zh);
    }
  }

  return result;
}
