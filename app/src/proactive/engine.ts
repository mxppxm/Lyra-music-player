import type { ProactiveIntent, PolitenessState, RuleContext, ProactiveKind } from "./types";
import type { SulkStore } from "./sulkStore";
import { politenessGate } from "./politeness";
import { setBreathing } from "../tray/trayBridge";
import { sendLyraProactiveNotification } from "../tray/notification";

export type ProactiveEngineDeps = {
  rules: Array<(ctx: RuleContext) => ProactiveIntent | null>;
  politenessState: PolitenessState;
  sulkStore: SulkStore;
  fulfill: (intent: ProactiveIntent) => Promise<void>;
  now?: () => number;
};

export class ProactiveEngine {
  private deps: ProactiveEngineDeps;

  constructor(deps: ProactiveEngineDeps) {
    this.deps = deps;
  }

  async tick(ctx: RuleContext): Promise<void> {
    const { rules, politenessState, sulkStore, fulfill } = this.deps;
    const now = (this.deps.now ?? Date.now)();

    // 1. Collect intents from all rules
    const intents: ProactiveIntent[] = [];
    for (const rule of rules) {
      const intent = rule(ctx);
      if (intent !== null) intents.push(intent);
    }

    if (intents.length === 0) return;

    // 2. Sort by urgency descending so highest-urgency intent gets first chance
    intents.sort((a, b) => b.urgency - a.urgency);

    // Build effective politeness state — honour conservative mode (daily_limit → 1)
    const effectiveState: PolitenessState & { _dailyLimit?: number } = {
      ...politenessState,
      _dailyLimit: sulkStore.isConservativeMode() ? 1 : 3,
    };
    const sulkUntil = sulkStore.getSulkUntil();

    // 3. Run gate; first passing intent wins
    for (const intent of intents) {
      const gateResult = politenessGate(intent, effectiveState, now, sulkUntil);
      if (gateResult.pass) {
        // Update politeness state counters
        politenessState.todayProactiveCount += 1;
        politenessState.todayKindCount[intent.kind] =
          (politenessState.todayKindCount[intent.kind] ?? 0) + 1;
        politenessState.lastKindFireAt[intent.kind] = now;

        // Signal tray + send notification before handing off to fulfill
        await setBreathing(true);
        await sendLyraProactiveNotification();

        await fulfill(intent);
        return;
      } else {
        console.debug(
          `[lyra] proactive skip kind=${intent.kind} reason=${gateResult.reason}`,
        );
      }
    }

    // 4. No intent survived — no-op
  }

  recordOutcome(
    kind: ProactiveKind,
    outcome: "accepted" | "dismissed" | "ignored" | "rejected",
  ): void {
    this.deps.sulkStore.recordProactiveOutcome(kind, outcome);
  }
}
