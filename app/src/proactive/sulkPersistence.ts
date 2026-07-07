import { loadSoulState, upsertSoulState } from "../db/repo/soulRepo";
import type { SulkSnapshot } from "./sulkStore";

const AGENT_ID = "lyra_001";

/** Load persisted sulk_until from SoulState. Returns ms epoch, or null if
 *  never set or expired. Silent on error — this is boot-time best-effort. */
export async function readPersistedSulkUntil(): Promise<number | null> {
  try {
    const state = await loadSoulState(AGENT_ID);
    const iso = state?.proactive_budget?.sulk_until;
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

/** Write a sulk snapshot back to SoulState.proactive_budget. If SoulState
 *  hasn't been loaded yet, silently no-ops — the store will be seeded on
 *  next full boot. */
export async function persistSulkSnapshot(snap: SulkSnapshot): Promise<void> {
  try {
    const state = await loadSoulState(AGENT_ID);
    if (!state) return;
    const iso =
      snap.sulkUntil !== null ? new Date(snap.sulkUntil).toISOString() : null;
    if (state.proactive_budget.sulk_until === iso) return;
    await upsertSoulState({
      ...state,
      proactive_budget: {
        ...state.proactive_budget,
        sulk_until: iso,
      },
    });
  } catch {
    // best-effort; a missed write just means the next transition writes it
  }
}
