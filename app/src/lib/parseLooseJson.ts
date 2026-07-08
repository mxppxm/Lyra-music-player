// parseLooseJson — tolerant JSON extraction for reasoning-model outputs.
//
// Handles the shapes we see in practice from GLM-5.x / DeepSeek-R / etc:
//   - pure JSON
//   - ```json … ``` code fences
//   - `<think>…</think>` reasoning blocks (before/after/around the JSON)
//   - a JSON object surrounded by prose ("让我分析一下 { … } 好的")
//
// Throws a plain Error("bad JSON") on failure so callers can rewrap with
// their own typed error.
export function parseLooseJson(raw: string): unknown {
  let s = raw.trim();

  // Strip reasoning blocks emitted by thinking-first models. Non-greedy, DOTALL
  // via [\s\S] since JS regex `s` flag isn't universally safe here.
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip a leading ```json / ``` fence and its trailing ``` if present.
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  try {
    return JSON.parse(s);
  } catch {
    // Fall through to the substring heuristic.
  }

  // Fallback: find the first '{' and the last '}' and try parsing that slice.
  // Works for any single top-level JSON object surrounded by prose.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {
      // fall through
    }
  }

  throw new Error("bad JSON");
}
