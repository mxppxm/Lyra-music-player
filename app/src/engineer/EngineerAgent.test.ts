import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Tauri invoke ─────────────────────────────────────────────────────────
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

// ── Mock repos ────────────────────────────────────────────────────────────────
const insertItemMock = vi.fn();
const insertEntryMock = vi.fn();
vi.mock("../db/repo/roadmapRepo", () => ({ insertItem: (...a: unknown[]) => insertItemMock(...a) }));
vi.mock("../db/repo/engineerAuditRepo", () => ({
  insertEntry: (...a: unknown[]) => insertEntryMock(...a),
}));

// ── Mock featureRequestBus ────────────────────────────────────────────────────
const drainMock = vi.fn();
const markConsumedMock = vi.fn();
vi.mock("./featureRequestBus", () => ({
  featureRequestBus: {
    drainUnconsumed: (...a: unknown[]) => drainMock(...a),
    markConsumed: (...a: unknown[]) => markConsumedMock(...a),
  },
}));

import { EngineerAgent } from "./EngineerAgent";
import type { ModelProvider } from "../types";

function makeProvider(jsonResponse: string): ModelProvider {
  return {
    chat: vi.fn().mockResolvedValue({ content: jsonResponse }),
  } as unknown as ModelProvider;
}

const greenProposal = {
  title: "Add zen theme",
  rationale: "Users want a calmer look for night sessions.",
  evidence: ["feature_request fr-01"],
  proposed_change: { zone: "green", files: ["themes/zen.css"], summary: "Add zen CSS theme" },
  priority: 70,
  effort: "S",
};

const redProposal = {
  title: "Hack audio codec",
  rationale: "Improve compression.",
  evidence: [],
  proposed_change: {
    zone: "yellow",
    files: ["src/audio/codec.ts"], // red by path
    summary: "Rewrite audio codec",
  },
  priority: 80,
  effort: "L",
};

const yellowProposal = {
  title: "Improve HomeView layout",
  rationale: "Better spacing for readability.",
  evidence: ["user session 2026-07-07"],
  proposed_change: { zone: "yellow", files: ["src/ui/HomeView.tsx"], summary: "Adjust grid layout" },
  priority: 55,
  effort: "M",
};

beforeEach(() => {
  invokeMock.mockReset();
  insertItemMock.mockReset();
  insertEntryMock.mockReset();
  drainMock.mockReset();
  markConsumedMock.mockReset();

  invokeMock.mockResolvedValue(false); // no PANIC by default
  drainMock.mockResolvedValue([]);
  insertItemMock.mockResolvedValue(undefined);
  insertEntryMock.mockResolvedValue(undefined);
  markConsumedMock.mockResolvedValue(undefined);
});

describe("EngineerAgent.runDailyLoop — PANIC short-circuit", () => {
  it("returns immediately with skipped when PANIC file present", async () => {
    invokeMock.mockResolvedValue(true);
    const agent = new EngineerAgent({ provider: makeProvider("[]") });
    const result = await agent.runDailyLoop();
    expect(result.skipped).toContain("PANIC file present");
    expect(result.proposed).toBe(0);
    expect(insertItemMock).not.toHaveBeenCalled();
  });
});

describe("EngineerAgent.runDailyLoop — happy path", () => {
  it("proposes green items and writes audit entry", async () => {
    const provider = makeProvider(JSON.stringify([greenProposal]));
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.proposed).toBe(1);
    expect(result.blocked).toBe(0);
    expect(result.skipped).toHaveLength(0);
    expect(insertItemMock).toHaveBeenCalledOnce();
    const item = insertItemMock.mock.calls[0][0];
    expect(item.title).toBe("Add zen theme");
    expect(item.status).toBe("proposed");
    expect(item.created_by).toBe("engineer-daily");
  });

  it("proposes both green and yellow items", async () => {
    const provider = makeProvider(JSON.stringify([greenProposal, yellowProposal]));
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.proposed).toBe(2);
    expect(insertItemMock).toHaveBeenCalledTimes(2);
  });

  it("marks feature requests as consumed after loop", async () => {
    drainMock.mockResolvedValue([{ id: "fr-01", desire: "x", from_agent: "companion", urgency: "nice_to_have", observed_pattern: "", created_at: Date.now(), consumed: false }]);
    const provider = makeProvider(JSON.stringify([greenProposal]));
    const agent = new EngineerAgent({ provider });
    await agent.runDailyLoop();
    expect(markConsumedMock).toHaveBeenCalledWith(["fr-01"]);
  });

  it("writes an audit entry with phase=propose", async () => {
    const provider = makeProvider(JSON.stringify([greenProposal]));
    const agent = new EngineerAgent({ provider });
    await agent.runDailyLoop();
    expect(insertEntryMock).toHaveBeenCalledOnce();
    const entry = insertEntryMock.mock.calls[0][0];
    expect(entry.phase).toBe("propose");
    const payload = JSON.parse(entry.payload_json);
    expect(payload.proposed).toBe(1);
    expect(payload.cost_estimate_usd).toBe(0.01);
  });
});

describe("EngineerAgent.runDailyLoop — red-zone rejection", () => {
  it("blocks items whose files touch red paths and logs blocked_intents", async () => {
    const provider = makeProvider(JSON.stringify([redProposal]));
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.proposed).toBe(0);
    expect(result.blocked).toBe(1);
    expect(insertItemMock).not.toHaveBeenCalled();
    const entry = insertEntryMock.mock.calls[0][0];
    const payload = JSON.parse(entry.payload_json);
    expect(payload.blocked_intents).toContain("Hack audio codec");
  });

  it("blocks items with explicit zone: 'red' in LLM output", async () => {
    const explicitRedProposal = {
      ...greenProposal,
      title: "Explicit red zone item",
      proposed_change: { zone: "red", files: ["themes/zen.css"], summary: "Should be blocked" },
    };
    const provider = makeProvider(JSON.stringify([explicitRedProposal]));
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.blocked).toBe(1);
    expect(insertItemMock).not.toHaveBeenCalled();
  });

  it("passes green through and blocks red in same batch", async () => {
    const provider = makeProvider(JSON.stringify([greenProposal, redProposal, yellowProposal]));
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.proposed).toBe(2);
    expect(result.blocked).toBe(1);
  });
});

describe("EngineerAgent.runDailyLoop — LLM failure handling", () => {
  it("returns skipped on LLM error and writes llm-error audit entry", async () => {
    const provider = {
      chat: vi.fn().mockRejectedValue(new Error("network timeout")),
    } as unknown as ModelProvider;
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.skipped).toContain("LLM call failed");
    const entry = insertEntryMock.mock.calls[0][0];
    expect(entry.phase).toBe("llm-error");
  });

  it("returns skipped on JSON parse failure and writes parse-error audit entry", async () => {
    const provider = makeProvider("not valid json at all {{");
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.skipped).toContain("JSON parse failed");
    const entry = insertEntryMock.mock.calls[0][0];
    expect(entry.phase).toBe("parse-error");
  });

  it("returns skipped on non-array JSON", async () => {
    const provider = makeProvider(JSON.stringify({ title: "oops" }));
    const agent = new EngineerAgent({ provider });
    const result = await agent.runDailyLoop();
    expect(result.skipped).toContain("JSON parse failed");
  });
});
