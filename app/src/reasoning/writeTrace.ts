// writeTrace — Sprint 11
// Fire-and-forget helper agents call to capture their LLM interaction. Every
// call is best-effort: DB failure, missing repo, etc. → silently skipped so
// tracing never interferes with the agent's real job.

import * as reasoningTracesRepo from "../db/repo/reasoningTracesRepo";
import type { AgentKind } from "../db/repo/reasoningTracesRepo";

export type TracePayload = {
  turn_id?: string | null;
  agent_kind: AgentKind;
  prompt_text: string;
  raw_response?: string | null;
  parsed_json?: unknown;
  duration_ms?: number | null;
};

export function writeTrace(p: TracePayload): void {
  const parsed_json =
    p.parsed_json === undefined
      ? null
      : typeof p.parsed_json === "string"
        ? p.parsed_json
        : safeStringify(p.parsed_json);
  void reasoningTracesRepo
    .insert({
      turn_id: p.turn_id ?? null,
      agent_kind: p.agent_kind,
      prompt_text: p.prompt_text,
      raw_response: p.raw_response ?? null,
      parsed_json,
      duration_ms: p.duration_ms ?? null,
      ts: Date.now(),
    })
    .catch(() => {
      /* silent — tracing must never interfere with the agent */
    });
}

function safeStringify(v: unknown): string | null {
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}
