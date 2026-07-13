# Sprint 1b-α Visual Smoke — Tuning Notes

**Date:** 2026-07-06
**App state:** Sprint 1b-α head `3094458` (fake data)
**Gates before smoke:** vitest 126/126 · typecheck 0 errors · pnpm build ok (205 KB JS, 65 KB gzip)

## How to observe

```bash
cd /Users/daoyu/Documents/my-github/Lyra-music-player/app
pnpm tauri dev
```

## Checklist (fill during smoke)

- [ ] Ambient background is quiet + time-aware
- [ ] Cover size and radius feel right
- [ ] Cover placeholder tint reads as "current-color deep" not gray
- [ ] Emotion light band renders with the fake 20-sample waveform
- [ ] SongInfo reads `《Nuvole Bianche》 · Ludovico Einaudi` with 《》 + middle dot
- [ ] Small note is one italic serif line ending in `…`
- [ ] Click on small note expands; waits 8s; auto-collapses
- [ ] Trace strip shows 3 tiny dots above the input
- [ ] Input capsule + placeholder feel right
- [ ] Enter submits + clears (check devtools console for `[lyra] user said: ...`)
- [ ] Space toggles console.log stub (`[lyra] toggle playback (α stub)`)
- [ ] Space in the input textarea does NOT trigger the stub
- [ ] Cmd+, opens the Settings modal

## Observed deltas (fill during smoke)

_(User elected to proceed without filing deltas — Sprint 1b-β planning begins on the α head. Any visual issues discovered during β can be logged here retroactively.)_

## Screenshot

_(deferred)_

## Recommendation

**Proceed to Sprint 1b-β** — user green-light after α gate.

## Notes

_(free-form observations — feel of aesthetic, comparisons to intended clone/文人 tone, anything qualitative)_
