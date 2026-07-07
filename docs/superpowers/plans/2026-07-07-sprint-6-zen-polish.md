# Sprint 6 — 禅空虚净 UI polish

> Direct answer to `需求.md` §问题 6: "界面的设计 - 灵动，总体风格：禅，空，虚，净"

**Goal:** Push the visible surface further into the Zen aesthetic vector. Not a feature sprint — a slow, opinionated tuning of transitions, opacity, typography, and empty states so the app *feels* like breathing space instead of a piece of software.

## Aesthetic north-star, translated

| Word | UI translation |
|---|---|
| **禅** (Zen) | Fewer transitions, slower easing curves. Nothing snaps; everything drifts. |
| **空** (empty / spacious) | More whitespace. Larger padding around each element. Reduce visual density. |
| **虚** (illusory / soft) | Reduced opacity across secondary elements. Lower saturation of ambient. Text weights softer. |
| **净** (pure / clean) | Cover placeholder shows less. Trace strip more muted at rest. No borders, no lines except the emotion band itself. |

## Global Constraints

- Commit prefix `fix(lyra):` (this is UI-only polish, not new capability)
- No test-count regressions
- All changes must survive the existing HomeView / SongInfo / SmallNote / AlbumCover unit tests without needing test updates unless a testid is deliberately renamed

## Changes (one commit)

### 1. Ambient transition slowdown

`home.css`:
- `--lyra-transition-ambient` from `4s cubic-bezier(0.4, 0, 0.2, 1)` → `8s cubic-bezier(0.32, 0, 0.42, 1)` (slower, gentler ease-out)
- `--lyra-transition-fade` from `600ms` → `900ms`

### 2. Cover placeholder — very slow breath

`AlbumCover.tsx`:
- Wrap the radial-gradient placeholder in an outer div that oscillates opacity between 0.92 and 1.0 over 8 seconds via CSS `@keyframes` (add to `home.css`). Named `lyra-cover-breath`.
- The breath should be so subtle that a user only notices it after 30 seconds of looking — indicator that the cover is *alive*, not a static image.

### 3. Typography softening

`home.css`:
- `--lyra-color-song-info` `rgba(0,0,0,0.65)` → `rgba(0,0,0,0.58)`
- `--lyra-color-small-note` `rgba(0,0,0,0.55)` → `rgba(0,0,0,0.50)`

`SongInfo.tsx`:
- Add `line-height: 1.6` (from browser default)
- Add `letter-spacing: 0.02em`

`SmallNote.tsx`:
- `line-height` `1.35` → `1.7` (breath between lines)

### 4. Input box — even more transparent

`InputBox.tsx`:
- Change background alpha from `0.6` → `0.4`
- Add subtle inset border via `boxShadow` `inset 0 0 0 1px rgba(0,0,0,0.03)`

### 5. Trace strip — softer at rest

`TraceStrip.tsx`:
- Default opacity from `0.65` → `0.55`

### 6. Spacing (space, ma)

`home.css`:
- `--lyra-space-cover-to-band` `24px` → `36px`
- `--lyra-space-band-to-song` `20px` → `28px`
- `--lyra-space-song-to-note` `12px` → `18px`
- `--lyra-space-trace-to-input` `32px` → `44px`
- `--lyra-viewport-padding` `40px` → `56px`

### 7. Idle empty state

`HomeView.tsx`:
- When `state.kind === "idle"` AND `traceItems.length === 0`, render an even sparser view: no cover shown at all, only a single line "Lyra 在听" centered vertically, plus the input box. When the user first types, transition to normal layout.
- This gives a beautiful "空" first-impression before any dialogue.

## Files touched

```
src/home.css                     # MODIFIED — tokens + breath keyframes
src/home/AlbumCover.tsx          # MODIFIED — breath animation
src/home/SongInfo.tsx            # MODIFIED — line-height, letter-spacing
src/home/SmallNote.tsx           # MODIFIED — line-height
src/home/InputBox.tsx            # MODIFIED — background alpha, inset border
src/home/TraceStrip.tsx          # MODIFIED — default opacity
src/home/HomeView.tsx            # MODIFIED — sparse idle state
```

## Commit

Single commit: `fix(lyra): 禅空虚净 UI polish sweep (Sprint 6)`

## Acceptance

Manually verify at `pnpm tauri dev`:
- Idle state (fresh app, no turns yet) — you should see almost nothing except the slogan and input
- Playing state — cover breathes so subtly you have to *look* for it
- Ambient shift when PAD changes — takes 8 seconds, no perceived snap
- Input box glass effect — softer

**No new tests.** All existing HomeView / SongInfo / SmallNote tests remain intact; only assertion values would change if we were being exhaustive, but the polish is scoped to visual defaults, not testable behaviors.
