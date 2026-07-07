# Sprint 2 Acceptance — Memory System

**Gates before user smoke:** vitest N/N pass, cargo 11/11, typecheck 0 errors, pnpm build ok.

## Automated integration smoke

- [x] Orchestrator integration test: 10 turns → shared_memory entries + memory.md sections populated after Reflect

## User manual smoke (to fill after running `pnpm tauri dev`)

Have ≥ 5 songs in the library. Configure any 2 API keys.

- [ ] After 5-10 real turns, one shows up in `~/Library/Application Support/com.daoyu.lyra/memory.md` under **Salient Moments**
- [ ] Cmd+Shift+R triggers "Lyra is dreaming…" overlay; on complete, memory.md gains:
  - Living Portrait paragraphs are non-empty and readable
  - At least one Facts line exists with tags + conclusion + conf/n
  - A Dream entry with today's timestamp exists
- [ ] Restart the app; devtools console shows `[lyra] memory boot: living_portrait=<len> facts=<count>` (or similar diagnostic — implementer adds this log in T5)
- [ ] Next turn after restart, CompanionAgent brief includes the Living Portrait paragraph (check by inspecting devtools console — if you added a debug log)

## Deltas observed

_(user fills in)_
