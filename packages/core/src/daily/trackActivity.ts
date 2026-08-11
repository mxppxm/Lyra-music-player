// daily/trackActivity.ts — fire-and-forget 行为埋点

import { insertActivityEvent } from "../db/repo/activityEventsRepo";
import { dayKey } from "./dayKey";

export type TrackActivityInput = {
  name: string;
  songId?: string | null;
  turnId?: string | null;
  props?: Record<string, unknown>;
  platform?: string;
  /** Injectable for tests */
  now?: number;
  idGen?: () => string;
};

/**
 * Persist one activity event. Never throw to callers — log and swallow.
 */
export async function trackActivity(input: TrackActivityInput): Promise<void> {
  try {
    const ts = input.now ?? Date.now();
    const id =
      input.idGen?.() ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `evt-${ts}-${Math.random().toString(36).slice(2, 9)}`);
    await insertActivityEvent({
      id,
      ts,
      dayKey: dayKey(new Date(ts)),
      name: input.name,
      songId: input.songId,
      turnId: input.turnId,
      props: input.props,
      platform: input.platform ?? "ios",
    });
  } catch (err) {
    console.warn("[lyra] trackActivity failed:", input.name, err);
  }
}
