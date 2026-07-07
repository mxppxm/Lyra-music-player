import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock featureRequestRepo ───────────────────────────────────────────────────
const insertMock = vi.fn();
const listUnconsumedMock = vi.fn();
const markConsumedMock = vi.fn();

vi.mock("../db/repo/featureRequestRepo", () => ({
  insert: (...a: unknown[]) => insertMock(...a),
  listUnconsumed: (...a: unknown[]) => listUnconsumedMock(...a),
  markConsumed: (...a: unknown[]) => markConsumedMock(...a),
}));

import { featureRequestBus } from "./featureRequestBus";

beforeEach(() => {
  insertMock.mockReset().mockResolvedValue(undefined);
  listUnconsumedMock.mockReset().mockResolvedValue([]);
  markConsumedMock.mockReset().mockResolvedValue(undefined);
  featureRequestBus._reset();
});

describe("featureRequestBus.post", () => {
  it("calls featureRequestRepo.insert with generated id and timestamp", async () => {
    await featureRequestBus.post({
      from_agent: "companion",
      desire: "Support ambient mode",
      observed_pattern: "User idles 30+ min",
      urgency: "important",
    });
    expect(insertMock).toHaveBeenCalledOnce();
    const arg = insertMock.mock.calls[0][0];
    expect(arg.id).toBeTruthy();
    expect(arg.from_agent).toBe("companion");
    expect(arg.desire).toBe("Support ambient mode");
    expect(typeof arg.created_at).toBe("number");
    expect(arg.consumed).toBe(false);
  });

  it("increments queueLength after post", async () => {
    expect(featureRequestBus.queueLength).toBe(0);
    await featureRequestBus.post({
      from_agent: "emotion",
      desire: "Better sad-mode handling",
      observed_pattern: "",
      urgency: "nice_to_have",
    });
    expect(featureRequestBus.queueLength).toBe(1);
  });
});

describe("featureRequestBus.drainUnconsumed", () => {
  it("delegates to featureRequestRepo.listUnconsumed", async () => {
    const fakeItems = [
      { id: "fr-01", from_agent: "companion", desire: "x", consumed: false, urgency: "important", observed_pattern: "", created_at: Date.now() },
    ];
    listUnconsumedMock.mockResolvedValueOnce(fakeItems);
    const items = await featureRequestBus.drainUnconsumed();
    expect(listUnconsumedMock).toHaveBeenCalledOnce();
    expect(items).toHaveLength(1);
  });
});

describe("featureRequestBus.markConsumed", () => {
  it("delegates to repo.markConsumed with ids", async () => {
    await featureRequestBus.markConsumed(["fr-01", "fr-02"]);
    expect(markConsumedMock).toHaveBeenCalledWith(["fr-01", "fr-02"]);
  });

  it("is a no-op for empty ids array", async () => {
    await featureRequestBus.markConsumed([]);
    expect(markConsumedMock).toHaveBeenCalledWith([]);
  });
});

describe("featureRequestBus._reset", () => {
  it("clears the in-memory queue", async () => {
    await featureRequestBus.post({
      from_agent: "library",
      desire: "Add playlist shuffle",
      observed_pattern: "",
      urgency: "nice_to_have",
    });
    expect(featureRequestBus.queueLength).toBe(1);
    featureRequestBus._reset();
    expect(featureRequestBus.queueLength).toBe(0);
  });
});
