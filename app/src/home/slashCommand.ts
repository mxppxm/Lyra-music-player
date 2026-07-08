// slashCommand — parse a user input as a UI command.
// Only three v0.2 commands exist. Anything else falls through so the raw
// text goes to the Orchestrator as a normal dialogue turn.

export type SlashCommand =
  | { kind: "settings" }
  | { kind: "stats" }        // opens Data Explorer at the llm_usage tab
  | { kind: "explorer" }     // opens Data Explorer at the default (turns) tab
  | { kind: "help" }         // opens Help overlay
  | { kind: "reload-musics" }; // wipes library tables and re-imports from the configured root

/** Returns a command object when the trimmed input is one of the known slash
 *  patterns. Returns null for anything else — even close misses like
 *  "/settings please" or " /settings ". Strictness keeps intent unambiguous. */
export function parseSlashCommand(raw: string): SlashCommand | null {
  const t = raw.trim();
  if (t === "/settings") return { kind: "settings" };
  if (t === "/stats") return { kind: "stats" };
  if (t === "/explorer") return { kind: "explorer" };
  if (t === "/help") return { kind: "help" };
  if (t === "/reload-musics") return { kind: "reload-musics" };
  return null;
}
