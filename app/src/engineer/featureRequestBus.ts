// featureRequestBus — in-memory queue with DB mirror for persistence
import type { FeatureRequest, FeatureRequestFromAgent, FeatureRequestUrgency } from "./types";
import * as featureRequestRepo from "../db/repo/featureRequestRepo";

export type PostRequest = {
  from_agent: FeatureRequestFromAgent;
  desire: string;
  observed_pattern: string;
  urgency: FeatureRequestUrgency;
};

// In-memory queue (survives until app restart; DB mirrors for across-restart)
const _queue: FeatureRequest[] = [];

export const featureRequestBus = {
  /**
   * Post a new feature request — enqueues in memory AND persists to DB.
   */
  async post(req: PostRequest): Promise<void> {
    const entry: FeatureRequest = {
      id: crypto.randomUUID(),
      created_at: Date.now(),
      from_agent: req.from_agent,
      desire: req.desire,
      observed_pattern: req.observed_pattern,
      urgency: req.urgency,
      consumed: false,
    };
    _queue.push(entry);
    await featureRequestRepo.insert(entry);
  },

  /**
   * Drain all unconsumed requests from DB (includes across-restart entries).
   */
  async drainUnconsumed(): Promise<FeatureRequest[]> {
    return featureRequestRepo.listUnconsumed();
  },

  /**
   * Mark a set of requests as consumed in DB.
   */
  async markConsumed(ids: string[]): Promise<void> {
    await featureRequestRepo.markConsumed(ids);
    for (const item of _queue) {
      if (ids.includes(item.id)) {
        item.consumed = true;
      }
    }
  },

  /** Peek at the in-memory queue length (useful in tests). */
  get queueLength(): number {
    return _queue.filter((r) => !r.consumed).length;
  },

  /** Reset the in-memory queue (test helper). */
  _reset(): void {
    _queue.length = 0;
  },
};
