// EngineerAgent — daily reflect → propose roadmap items via LLM (v0.3-α)
// PROPOSE-ONLY: never writes source files, never spawns CLI.
import type { ModelProvider, ChatMessage } from "../types";
import { routeProvider } from "../agents/route";
import { writeTrace } from "../reasoning/writeTrace";
import { ENGINEER_SYSTEM_PROMPT } from "./prompt";
import { partitionByZone } from "./boundaryMap";
import type { RoadmapItem } from "./types";
import * as roadmapRepo from "../db/repo/roadmapRepo";
import * as engineerAuditRepo from "../db/repo/engineerAuditRepo";
import { featureRequestBus } from "./featureRequestBus";
import { invoke } from "@tauri-apps/api/core";

// ── Raw LLM proposal (before validation) ─────────────────────────────────────

type RawProposal = {
  title: string;
  rationale: string;
  evidence: string[];
  proposed_change: {
    zone: string;
    files: string[];
    summary: string;
  };
  priority: number;
  effort: string;
};

function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return JSON.parse(s);
}

function parseProposals(raw: string): RawProposal[] {
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) throw new Error("LLM did not return a JSON array");
  return parsed as RawProposal[];
}

function buildContext(requests: Awaited<ReturnType<typeof featureRequestBus.drainUnconsumed>>): string {
  const lines: string[] = ["=== Feature Requests (unconsumed) ==="];
  if (requests.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of requests.slice(0, 20)) {
      lines.push(`[${r.from_agent}] ${r.desire} (urgency: ${r.urgency})`);
      if (r.observed_pattern) lines.push(`  pattern: ${r.observed_pattern}`);
    }
  }
  lines.push("");
  lines.push("=== Instructions ===");
  lines.push("请根据以上 feature requests 和你对 Lyra 项目的理解，提出 3-5 条改进建议。");
  return lines.join("\n");
}

// ── EngineerAgent ─────────────────────────────────────────────────────────────

export type DailyLoopResult = {
  proposed: number;
  blocked: number;
  skipped: string[];
};

export class EngineerAgent {
  private provider: ModelProvider;

  constructor(deps: { provider?: ModelProvider } = {}) {
    this.provider = deps.provider ?? routeProvider("companion");
  }

  async runDailyLoop(): Promise<DailyLoopResult> {
    // 1. PANIC file short-circuit
    let panicPresent = false;
    try {
      panicPresent = await invoke<boolean>("check_panic_file");
    } catch {
      // If Tauri command unavailable (test env), skip
    }
    if (panicPresent) {
      return { proposed: 0, blocked: 0, skipped: ["PANIC file present"] };
    }

    const taskId = `daily-${new Date().toISOString().slice(0, 10)}`;
    let proposed = 0;
    let blocked = 0;

    // 2. Drain unconsumed feature requests
    const requests = await featureRequestBus.drainUnconsumed();

    // 3. Build context and call LLM
    const context = buildContext(requests);
    const messages: ChatMessage[] = [
      { role: "system", content: ENGINEER_SYSTEM_PROMPT },
      { role: "user", content: context },
    ];

    let rawContent: string;
    const t0 = performance.now();
    try {
      const res = await this.provider.chat(messages, {
        max_tokens: 2048,
        temperature: 0.5,
      });
      rawContent = res.content;
      writeTrace({
        agent_kind: "engineer",
        prompt_text: context,
        raw_response: rawContent,
        parsed_json: null,   // filled by trace of proposals below is overkill
        duration_ms: Math.round(performance.now() - t0),
      });
    } catch (err) {
      await engineerAuditRepo.insertEntry({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        task_id: taskId,
        phase: "llm-error",
        payload_json: JSON.stringify({ error: String(err) }),
      });
      return { proposed: 0, blocked: 0, skipped: ["LLM call failed"] };
    }

    // 4. Parse proposals
    let proposals: RawProposal[];
    try {
      proposals = parseProposals(rawContent);
    } catch (err) {
      await engineerAuditRepo.insertEntry({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        task_id: taskId,
        phase: "parse-error",
        payload_json: JSON.stringify({ error: String(err), raw: rawContent.slice(0, 500) }),
      });
      return { proposed: 0, blocked: 0, skipped: ["JSON parse failed"] };
    }

    const blockedIntents: string[] = [];

    // 5. For each proposal: zone-check then insert or reject
    for (const p of proposals) {
      const files: string[] = Array.isArray(p.proposed_change?.files)
        ? p.proposed_change.files
        : [];
      const { red } = partitionByZone(files);

      // Also reject if LLM explicitly set zone: "red"
      const zoneIsRed = p.proposed_change?.zone === "red";

      if (red.length > 0 || zoneIsRed) {
        blocked++;
        blockedIntents.push(p.title ?? "(untitled)");
        continue;
      }

      const zone = (p.proposed_change?.zone === "green" ? "green" : "yellow") as "green" | "yellow";
      const effort = (["S", "M", "L"].includes(p.effort) ? p.effort : "M") as "S" | "M" | "L";

      const item: RoadmapItem = {
        id: crypto.randomUUID(),
        created_at: Date.now(),
        created_by: "engineer-daily",
        title: String(p.title ?? "").slice(0, 60),
        rationale: String(p.rationale ?? ""),
        evidence: Array.isArray(p.evidence) ? p.evidence.map(String) : [],
        proposed_change: {
          zone,
          files,
          summary: String(p.proposed_change?.summary ?? ""),
        },
        status: "proposed",
        priority: typeof p.priority === "number" ? Math.min(100, Math.max(0, p.priority)) : 50,
        effort,
      };

      await roadmapRepo.insertItem(item);
      proposed++;
    }

    // 6. Mark feature requests consumed
    await featureRequestBus.markConsumed(requests.map((r) => r.id));

    // 7. Write audit trail
    await engineerAuditRepo.insertEntry({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      task_id: taskId,
      phase: "propose",
      payload_json: JSON.stringify({
        proposed,
        blocked,
        blocked_intents: blockedIntents,
        feature_requests_consumed: requests.length,
        cost_estimate_usd: 0.01,
      }),
    });

    return { proposed, blocked, skipped: [] };
  }
}
