// slashCommand — parse a user input as a UI command.

import { isZeroConfigRelease } from "../config/zeroConfig";

export type SlashCommand =
  | { kind: "settings" }
  | { kind: "stats" }
  | { kind: "explorer" }
  | { kind: "help" }
  | { kind: "week" };

export function parseSlashCommand(raw: string): SlashCommand | null {
  const t = raw.trim();
  if (!isZeroConfigRelease() && t === "/settings") return { kind: "settings" };
  if (t === "/stats") return { kind: "stats" };
  if (t === "/explorer") return { kind: "explorer" };
  if (t === "/help") return { kind: "help" };
  if (t === "/week") return { kind: "week" };
  return null;
}
