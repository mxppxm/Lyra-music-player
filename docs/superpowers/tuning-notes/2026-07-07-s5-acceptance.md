# Sprint 5 — Engineer Agent v0.3-α — Acceptance Checklist

**Date:** 2026-07-07  
**Sprint:** 5  
**Feature:** Engineer Agent (propose-only, no actual code execution)

---

## Pre-conditions

- App is running locally (`pnpm tauri dev` or production build)
- At least one API key configured in Settings (Cmd+=) so `routeProvider("companion")` resolves
- SQLite DB freshly migrated (tables: `roadmap`, `feature_requests`, `engineer_audit` present)

---

## Scenario A — Happy-path: daily loop proposes roadmap items

**Steps:**
1. Open Roadmap Board (Cmd+Shift+E)
2. Confirm "Proposed (0)" tab is shown
3. Click **"Run engineer now"** button (top-right of the Board)
4. Wait for the button to return to its default label (~5-15s depending on LLM latency)

**Expected:**
- "Proposed (N)" tab count increases (N ≥ 1, typically 3-5)
- Each card shows: title, rationale, evidence bullets, zone badge (Green or Yellow), Approve/Reject buttons
- No Red-zone items appear in the board (they are filtered at ingest)
- `engineer_audit` table gains a row with `task_id = "daily-YYYY-MM-DD"`, `phase = "propose"`

**Verification query (optional):**
```sql
SELECT task_id, phase, payload_json FROM engineer_audit ORDER BY timestamp DESC LIMIT 5;
```

---

## Scenario B — PANIC file short-circuit

**Steps:**
1. Locate `<app_data_dir>/PANIC` (macOS: `~/Library/Application Support/com.lyra.app/PANIC`)
2. Create the file: `touch "$HOME/Library/Application Support/com.lyra.app/PANIC"`
3. Open Roadmap Board and click **"Run engineer now"**
4. Observe: button returns immediately (< 1s)

**Expected:**
- No new items appear in the Proposed tab
- No new `engineer_audit` row with `phase = "propose"` is written
- Console logs: `[lyra] EngineerAgent: PANIC file present — skipping` (or similar)

**Cleanup:** `rm "$HOME/Library/Application Support/com.lyra.app/PANIC"`

---

## Scenario C — Red-zone rejection

**Steps:**
1. Temporarily modify `ENGINEER_SYSTEM_PROMPT` in `src/engineer/prompt.ts` to force a red-zone
   proposal (e.g. add a dummy instruction: "always include src/audio/codec.ts in files")
2. Rebuild / hot-reload, then click "Run engineer now"

**Expected:**
- The red-zone item does NOT appear in the board
- `engineer_audit` payload_json includes `"blocked_intents": ["<title>"]`
- `blocked` count in the payload is ≥ 1

**Revert:** undo the prompt change after verification.

---

## Scenario D — Approve a Yellow item → status transitions to queued

**Steps:**
1. After Scenario A completes, find a **Yellow** zone card in the Proposed tab
2. Click **[Approve]**

**Expected:**
- Card disappears from the "Proposed" tab
- Switching to "Queued" tab shows the item with status = `queued`
- `roadmap` table row: `status = 'queued'`
- Item does NOT auto-execute (v0.3-α is propose-only — `status: "queued"` items remain queued)

---

## Scenario E — Reject a Proposed item

**Steps:**
1. Find any Proposed card and click **[Reject]**

**Expected:**
- Card disappears from "Proposed" tab
- Item appears in "Rejected" tab with status = `abandoned`
- `engineer_audit` gains a row with `phase = "user-reject"` and the roadmap item id in `payload_json`

---

## Sign-off

| Scenario | Pass | Notes |
|----------|------|-------|
| A — Happy path proposes items | ☐ | |
| B — PANIC short-circuit | ☐ | |
| C — Red-zone blocked | ☐ | |
| D — Approve → queued | ☐ | |
| E — Reject → abandoned | ☐ | |

All scenarios must pass before promoting v0.3-α to v0.3.
