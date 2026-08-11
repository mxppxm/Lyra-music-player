import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { normalizeCoverUrl } from "./CoverBackground";
import { GlowCanvas } from "./GlowCanvas";
import { ThinkingNote } from "./ThinkingNote";
import { useCoverPalette } from "./coverPalette";
import { SongInfo } from "./SongInfo";
import { SmallNote } from "./SmallNote";
import { InputBox } from "./InputBox";
import { PlayerControls } from "./PlayerControls";
import { TrackLockButton } from "./TrackLockButton";
import { HistoryOverlay } from "./HistoryOverlay";
import { WeatherBadge } from "./WeatherBadge";
import type { WeatherContext } from "@lyra/core/recommendation/timeContext";
import { ProgressBar, progressLabel } from "./ProgressBar";
import { useProgress } from "../audio/useProgress";
import { useNowPlaying } from "../audio/useNowPlaying";
import { useAutoAdvance } from "../audio/useAutoAdvance";
import { usePrefetchNext } from "../audio/usePrefetchNext";
import { invalidatePlaybackQueueRefills } from "../audio/refillPlaybackQueue";
import { useTurn } from "../turn/useTurn";
import type { Orchestrator } from "@lyra/core";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";
import {
  isFavorite,
  toggleFavorite,
} from "@lyra/core/db/repo/favoritesRepo";
import { looksLikePartialLyrics } from "@lyra/core/agents/LyricsAgent";
import type { PAD } from "../lib/color";
import { setImmersiveStatusBar, lightTap } from "./immersiveStatusBar";
import { buildSharePayload } from "./share";
import { IconHistory, IconShare } from "./icons";
import { LyraAudio } from "@lyra/platform-ios";
import { useImmersiveSwipe } from "./useImmersiveSwipe";
import type {
  SwipeDirection,
  SwipeOffsetPhase,
} from "./useImmersiveSwipe";
import {
  ImmersiveCoverRail,
  type CoverRailSlot,
} from "./ImmersiveCoverRail";
import {
  bridgePinnedCoverTransform,
  canToggleImmersive,
  centeredRailRole,
  compensateImmersiveCoverPosition,
  coverTransformCss,
  shouldCenterThinkingPlaceholder,
  shouldShowInlineThinking,
  type ImmersiveCoverTransform,
} from "./immersiveCoverMotion";

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };
const LYRA_START_LABEL = "点我试试";
/** Matches the `.lyra-mobile-cover-shift` transform transition. */
const IMMERSIVE_FLIP_MS = 560;
/** Dock FLIP (560ms) + the last module's delay (600ms) + its own 420ms. */
const CONTENT_INTRO_MS = 1100;

type MobileHomeViewProps = {
  orchestrator: Orchestrator;
  /** 当前天气（App 天气 tick 拉取后传入）—— 播放时展示天气 badge。 */
  weather?: WeatherContext | null;
};

export function MobileHomeView({ orchestrator, weather }: MobileHomeViewProps) {
  const { state, submit } = useTurn(orchestrator);
  const playing = state.kind === "playing";
  const progress = useProgress(playing);
  useNowPlaying(orchestrator, state);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputBlurAtRef = useRef(0);
  const previousImmersiveRef = useRef(immersive);
  const immersiveToggleAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [noteFlipped, setNoteFlipped] = useState(false);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsFailed, setLyricsFailed] = useState(false);
  const [lyricsRefreshing, setLyricsRefreshing] = useState(false);
  const coverShiftRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeTrackRef = useRef<HTMLDivElement>(null);
  const recenterRetryRef = useRef<number | null>(null);
  const recenterRef = useRef<() => void>(() => {});
  const coverPinnedRef = useRef(false);
  const pinTimerRef = useRef<number | null>(null);
  const coverScaleRef = useRef(1);
  const coverMotionRef = useRef<ImmersiveCoverTransform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [coverTransform, setCoverTransform] = useState<string>("none");
  const lyricsRequestGen = useRef(0);

  // Keep immersive across the thinking gap between songs; only drop it when
  // the playback session itself ends.
  useEffect(() => {
    if (state.kind !== "playing" && state.kind !== "thinking") {
      setImmersive(false);
    }
  }, [state.kind]);

  useEffect(() => {
    if (previousImmersiveRef.current !== immersive) {
      previousImmersiveRef.current = immersive;
      immersiveToggleAtRef.current = performance.now();
    }
    void setImmersiveStatusBar(immersive);
    return () => {
      void setImmersiveStatusBar(false);
    };
  }, [immersive]);

  useEffect(() => {
    if (immersive) {
      document.documentElement.dataset.lyraImmersive = "true";
    } else {
      delete document.documentElement.dataset.lyraImmersive;
    }
    return () => {
      delete document.documentElement.dataset.lyraImmersive;
    };
  }, [immersive]);

  // Once the enter glide has landed, take the vinyl out of flow at exactly
  // the box it already occupies — same transform, same pixels, so nothing
  // moves. From here on, note height and progress reflows cannot reach it.
  // Pinning happens strictly between the two glides, never during one.
  const pinImmersiveCover = useCallback(() => {
    const el = coverShiftRef.current;
    if (!el || coverPinnedRef.current) return;
    const held = el.style.transform;
    el.style.transition = "none";
    el.style.transform = "none";
    const natural = el.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.margin = "0";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.width = `${natural.width}px`;
    el.style.height = `${natural.height}px`;
    // An ancestor transform would make `fixed` resolve against that box
    // instead of the viewport, so measure where left/top 0 actually lands.
    const origin = el.getBoundingClientRect();
    el.style.left = `${natural.left - origin.left}px`;
    el.style.top = `${natural.top - origin.top}px`;
    el.style.transform = held;
    void el.offsetWidth;
    el.style.transition = "";
    coverPinnedRef.current = true;
  }, []);

  // Drop back into flow without moving a pixel: whatever the column did to
  // its layout while we were pinned is absorbed into a bridge transform, so
  // the exit glide can start from the vinyl's real on-screen position.
  const releaseImmersiveCover = useCallback((): string | null => {
    const el = coverShiftRef.current;
    if (!el || !coverPinnedRef.current) return null;
    coverPinnedRef.current = false;
    const visual = el.getBoundingClientRect();
    el.style.transition = "none";
    el.style.position = "";
    el.style.margin = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
    el.style.transform = "none";
    const bridge = bridgePinnedCoverTransform(
      visual,
      el.getBoundingClientRect(),
    );
    const css = coverTransformCss(bridge);
    el.style.transform = css;
    // Flush the bridge as the transition's start value — without this the
    // browser only ever sees the final transform and skips the glide.
    void el.offsetWidth;
    el.style.transition = "";
    coverScaleRef.current = bridge.scale;
    coverMotionRef.current = bridge;
    return css;
  }, []);

  // FLIP: glide the cover to the screen center and scale it up when
  // entering immersive mode; "none" on exit animates it back.
  useLayoutEffect(() => {
    if (!immersive) {
      releaseImmersiveCover();
      coverScaleRef.current = 1;
      coverMotionRef.current = { x: 0, y: 0, scale: 1 };
      setCoverTransform("none");
      return;
    }
    const el = coverShiftRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetSize = Math.min(window.innerWidth * 0.82, 330);
    const scale = targetSize / rect.width;
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
    const dy = window.innerHeight / 2 - (rect.top + rect.height / 2);
    coverScaleRef.current = scale;
    coverMotionRef.current = { x: dx, y: dy, scale };
    setCoverTransform(`translate(${dx}px, ${dy}px) scale(${scale})`);
  }, [immersive, releaseImmersiveCover]);

  const schedulePin = useCallback(
    (delay: number) => {
      if (pinTimerRef.current !== null) {
        window.clearTimeout(pinTimerRef.current);
      }
      pinTimerRef.current = window.setTimeout(() => {
        pinTimerRef.current = null;
        pinImmersiveCover();
      }, delay);
    },
    [pinImmersiveCover],
  );

  useEffect(() => {
    if (!immersive) return;
    schedulePin(IMMERSIVE_FLIP_MS + 32);
    // Pinned coordinates are viewport-absolute, so a rotation would strand
    // the vinyl off-center: fall back into flow, re-center, pin again.
    const onResize = () => {
      const bridge = releaseImmersiveCover();
      if (bridge) setCoverTransform(bridge);
      recenterRef.current();
      schedulePin(IMMERSIVE_FLIP_MS + 32);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (pinTimerRef.current === null) return;
      window.clearTimeout(pinTimerRef.current);
      pinTimerRef.current = null;
    };
  }, [immersive, releaseImmersiveCover, schedulePin]);

  // Turn only once audio is actually moving. The session flips to "playing"
  // while the track is still loading, and a disc spinning in silence reads as
  // a bug — the first position poll lands within half a second.
  const discPlaying =
    state.kind === "playing" &&
    !state.paused &&
    (progress?.elapsedMs ?? 0) > 0;

  const title: string =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? songDisplayTitle(state.song)
      : "";

  const artist: string =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? songDisplayArtist(state.song)
      : "";

  // Surface native playback failures in the note area — the only way to see
  // *why* a track won't play without attaching a debugger.
  const currentSongId =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? state.song.id
      : null;
  const stabilizedCoverSongRef = useRef(currentSongId);
  useEffect(() => {
    setPlaybackError(null);
  }, [currentSongId]);

  // Reset lyrics card when the playing track changes.
  useEffect(() => {
    lyricsRequestGen.current += 1;
    setNoteFlipped(false);
    setLyricsText(null);
    setLyricsLoading(false);
    setLyricsFailed(false);
    setLyricsRefreshing(false);
  }, [currentSongId]);

  useAutoAdvance(orchestrator, setPlaybackError, {
    songId: currentSongId,
    playing: state.kind === "playing",
    paused: state.kind === "playing" ? Boolean(state.paused) : true,
    progress: progress?.progress ?? 0,
    elapsedMs: progress?.elapsedMs,
    durationMs: progress?.durationMs,
  });

  usePrefetchNext(orchestrator, {
    songId: currentSongId,
    playing: state.kind === "playing",
    paused: state.kind === "playing" ? Boolean(state.paused) : true,
    progress: progress?.progress ?? 0,
    trackLocked:
      state.kind === "playing" ? Boolean(state.trackLocked) : false,
  });

  const noteText: string =
    playbackError !== null
      ? `这首歌没能放出来：${playbackError}（点一下重试）`
      : state.kind === "idle"
        ? "Lyra 在等你说一句话"
        : state.kind === "thinking"
          ? ""
          : state.kind === "playing"
            ? state.turn.agent_response.rationale
            : state.kind === "proactive-pending"
              ? state.rationale
              : state.kind === "error"
                ? `${state.message}（点一下重试）`
                : "";

  const isErrorNote = playbackError !== null || state.kind === "error";

  const handleRetry = useCallback(() => {
    if (state.kind === "error") {
      void orchestrator.onRetry();
      return;
    }
    // Playback failure — replay the current track.
    if (playbackError !== null && state.kind === "playing") {
      setPlaybackError(null);
      void orchestrator.onReplaySong(
        state.song,
        state.turn.agent_response.rationale,
        state.turn.current_emotion,
      );
    }
  }, [orchestrator, playbackError, state]);

  const loadLyrics = useCallback(async () => {
    if (state.kind !== "playing") return;
    const cached = state.turn.agent_response.lyrics?.trim();
    if (cached && !looksLikePartialLyrics(cached)) {
      setLyricsText(cached);
      setLyricsFailed(false);
      setLyricsLoading(false);
      return;
    }
    if (lyricsText && !looksLikePartialLyrics(lyricsText)) return;

    const gen = ++lyricsRequestGen.current;
    setLyricsLoading(true);
    setLyricsFailed(false);
    try {
      const text = await orchestrator.getLyrics();
      if (gen !== lyricsRequestGen.current) return;
      setLyricsText(text);
    } catch {
      if (gen !== lyricsRequestGen.current) return;
      setLyricsFailed(true);
    } finally {
      if (gen === lyricsRequestGen.current) setLyricsLoading(false);
    }
  }, [orchestrator, state, lyricsText]);

  const refreshLyrics = useCallback(async () => {
    if (state.kind !== "playing" || lyricsRefreshing) return;
    const gen = ++lyricsRequestGen.current;
    setLyricsRefreshing(true);
    setLyricsFailed(false);
    try {
      const text = await orchestrator.getLyrics({ force: true });
      if (gen !== lyricsRequestGen.current) return;
      setLyricsText(text);
    } catch {
      // Keep the previous lyrics visible on failure.
      if (gen !== lyricsRequestGen.current) return;
    } finally {
      if (gen === lyricsRequestGen.current) setLyricsRefreshing(false);
    }
  }, [orchestrator, state.kind, lyricsRefreshing]);

  const handleNoteClick = useCallback(() => {
    if (isErrorNote) {
      handleRetry();
      return;
    }
    if (state.kind !== "playing") return;

    if (noteFlipped) {
      if (lyricsFailed) {
        void loadLyrics();
        return;
      }
      setNoteFlipped(false);
      return;
    }

    setNoteFlipped(true);
    void loadLyrics();
  }, [
    handleRetry,
    isErrorNote,
    loadLyrics,
    lyricsFailed,
    noteFlipped,
    state.kind,
  ]);

  const isThinking = state.kind === "thinking";

  const noteColor: string | undefined =
    playbackError !== null || state.kind === "error"
      ? "rgba(200,80,80,0.75)"
      : undefined;

  const handleTogglePlay = () => {
    if (state.kind !== "playing") return;
    if (state.paused) {
      void orchestrator.onResume();
    } else {
      void orchestrator.onPause();
    }
  };

  const handleSkip = async () => {
    if (state.kind !== "playing") return;
    invalidatePlaybackQueueRefills();
    await LyraAudio.clearNextTrack().catch(() => {});
    await orchestrator.onSkip();
  };

  const handlePrevious = useCallback(async () => {
    if (!orchestrator.canGoPrevious()) return;
    invalidatePlaybackQueueRefills();
    await LyraAudio.clearNextTrack().catch(() => {});
    await orchestrator.onPrevious();
  }, [orchestrator]);

  const canGoPrevious = orchestrator.canGoPrevious();
  const canSkip = state.kind === "playing";
  const peekPrev = orchestrator.peekPrevious();
  const peekNext = orchestrator.peekNext();
  // An empty forward plan is still swipeable: its next page is the thinking
  // placeholder and committing it asks Orchestrator to select a new song.
  const lockSwipeNext = state.kind !== "playing";

  // CD slot stride — one disc width + gap, NOT the full screen (background stays).
  const swipeStride =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth * 0.7, 280) + 48
      : 328;

  const liveCoverRaw =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? state.song.metadata?.cover
      : null;
  const coverUrl = typeof liveCoverRaw === "string" ? liveCoverRaw : null;
  const currentCoverSlot: CoverRailSlot | null = currentSongId
    ? { songId: currentSongId, coverUrl }
    : coverUrl
      ? { songId: "frozen", coverUrl }
      : null;
  const [swipeSnapshot, setSwipeSnapshot] = useState<{
    previous: ReturnType<Orchestrator["peekPrevious"]>;
    current: CoverRailSlot | null;
    next: ReturnType<Orchestrator["peekNext"]>;
  } | null>(null);

  const handleSwipeCommit = useCallback(
    async (direction: SwipeDirection) => {
      // Drop native AV queue — we're jumping to a specific neighbor via playFile.
      invalidatePlaybackQueueRefills();
      await LyraAudio.clearNextTrack().catch(() => {});
      if (direction === "next") {
        await orchestrator.onSkip();
      } else {
        await orchestrator.onPrevious();
      }
    },
    [orchestrator],
  );

  const applySwipeOffset = useCallback(
    (offset: number, phase: SwipeOffsetPhase) => {
      const track = swipeTrackRef.current;
      if (!track) return;
      track.classList.toggle(
        "lyra-mobile-cover-shift--swiping",
        phase === "drag",
      );
      track.classList.toggle(
        "lyra-mobile-cover-shift--settling",
        phase === "settle",
      );
      const localOffset = offset / coverScaleRef.current;
      track.style.transform =
        offset === 0 ? "" : `translate3d(${localOffset}px, 0, 0)`;
    },
    [],
  );

  const {
    dragging: swipeDragging,
    settling: swipeSettling,
    pending: swipePending,
    direction: swipeDirection,
    onPointerDown: onSwipePointerDown,
    shouldSuppressClick,
    snapToCenter,
    resetSlide,
  } = useImmersiveSwipe({
    enabled: immersive && (state.kind === "playing" || state.kind === "thinking"),
    lockNext: lockSwipeNext,
    canGoPrevious,
    stride: swipeStride,
    onCommit: handleSwipeCommit,
    onOffsetChange: applySwipeOffset,
  });

  const handleSwipePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!onSwipePointerDown(event)) return;
      setSwipeSnapshot({
        previous: peekPrev,
        current: currentCoverSlot,
        next: peekNext,
      });
    },
    [currentCoverSlot, onSwipePointerDown, peekNext, peekPrev],
  );

  // Snap rail before paint once the song actually changed — unlocks UI and
  // keeps the neighbor that was centered as the new current at offset 0.
  const snapFromSongRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!swipePending) {
      snapFromSongRef.current = currentSongId;
      return;
    }
    if (swipeSettling) return;
    if (!currentSongId || currentSongId === snapFromSongRef.current) return;
    snapFromSongRef.current = currentSongId;
    snapToCenter();
  }, [currentSongId, snapToCenter, swipePending, swipeSettling]);

  // The thinking page is a carousel page, not a waiting room: once its slide
  // lands, re-center and unlock there so the neighbors stay swipeable while
  // Lyra picks. Snapping only after the data already shows the placeholder
  // keeps the old cover from reappearing for a frame.
  useLayoutEffect(() => {
    if (
      !shouldCenterThinkingPlaceholder({
        pending: swipePending,
        settling: swipeSettling,
        direction: swipeDirection,
        committedNextSongId: swipeSnapshot?.next?.songId ?? null,
        currentSongId,
      })
    ) {
      return;
    }
    snapToCenter();
  }, [
    currentSongId,
    snapToCenter,
    swipeDirection,
    swipePending,
    swipeSettling,
    swipeSnapshot,
  ]);

  useEffect(() => {
    if (!immersive) resetSlide();
  }, [immersive, resetSlide]);

  // A failed navigation never produces a new song id, so the rail would wait
  // for a snap that can't come — release it once the session leaves playback.
  useEffect(() => {
    if (state.kind === "playing" || state.kind === "thinking") return;
    resetSlide();
  }, [state.kind, resetSlide]);

  const handingOff = swipeSettling || swipePending;
  const swipeActive = immersive && (swipeDragging || handingOff);
  const activeSwipeSnapshot = swipeActive ? swipeSnapshot : null;
  const displayPrevious = activeSwipeSnapshot
    ? activeSwipeSnapshot.previous
    : peekPrev;
  const displayCurrent = activeSwipeSnapshot
    ? activeSwipeSnapshot.current
    : currentCoverSlot;
  const displayNext = activeSwipeSnapshot
    ? activeSwipeSnapshot.next
    : peekNext;

  // After commit, warm title/note/palette from the neighbor display pack so
  // the handoff isn't empty while audio/state catch up.
  const handoffNeighbor =
    immersive && handingOff
      ? swipeDirection === "next"
        ? displayNext
        : swipeDirection === "previous"
          ? displayPrevious
          : null
      : null;

  // Chrome stays in flow (opacity only) so immersive enter/exit FLIP can
  // measure real boxes. When song/note height changes mid-immersive, nudge
  // the already-applied FLIP translate so the vinyl stays visually pinned.
  const recenterImmersiveCover = useCallback(() => {
    const shell = coverShiftRef.current;
    if (!shell) return;
    // Pinned covers are immune to the column's layout by construction.
    if (coverPinnedRef.current) return;
    // The enter/exit FLIP owns the transform while it plays — nudging it
    // mid-glide would snap the vinyl to center. Retry once it has landed.
    const sinceToggle = performance.now() - immersiveToggleAtRef.current;
    if (sinceToggle < IMMERSIVE_FLIP_MS) {
      if (recenterRetryRef.current === null) {
        recenterRetryRef.current = window.setTimeout(() => {
          recenterRetryRef.current = null;
          recenterRef.current();
        }, IMMERSIVE_FLIP_MS - sinceToggle + 16);
      }
      return;
    }
    const next = compensateImmersiveCoverPosition(
      coverMotionRef.current,
      shell.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
    );
    if (
      next.x === coverMotionRef.current.x &&
      next.y === coverMotionRef.current.y
    ) {
      return;
    }
    coverMotionRef.current = next;
    const transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    shell.classList.add("lyra-mobile-cover-shift--repositioning");
    shell.style.transform = transform;
    setCoverTransform(transform);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        shell.classList.remove("lyra-mobile-cover-shift--repositioning");
      });
    });
  }, []);
  recenterRef.current = recenterImmersiveCover;

  useLayoutEffect(() => {
    if (!immersive) {
      stabilizedCoverSongRef.current = currentSongId;
      return;
    }
    const songChanged = stabilizedCoverSongRef.current !== currentSongId;
    if (!swipePending && !songChanged) return;
    stabilizedCoverSongRef.current = currentSongId;
    recenterImmersiveCover();
  }, [
    currentSongId,
    immersive,
    recenterImmersiveCover,
    swipeDirection,
    swipePending,
  ]);

  // The song-change hook above only fires on the frame the id changes, but
  // the note text (and its height) lands later — rationale and lyrics arrive
  // async, and every reflow of the centered column moves the vinyl's flow
  // box. Watch the column itself so late layout changes get compensated too.
  useEffect(() => {
    if (!immersive) {
      if (recenterRetryRef.current !== null) {
        window.clearTimeout(recenterRetryRef.current);
        recenterRetryRef.current = null;
      }
      return;
    }
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => recenterImmersiveCover());
    for (const child of Array.from(content.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [currentSongId, immersive, noteFlipped, recenterImmersiveCover, state.kind]);

  const railStride = swipeStride / coverScaleRef.current;

  // Prefetch neighbor covers off-screen (display pack image half).
  useEffect(() => {
    for (const raw of [peekPrev?.coverUrl, peekNext?.coverUrl]) {
      const url = normalizeCoverUrl(raw ?? null);
      if (!url || typeof Image === "undefined") continue;
      const img = new Image();
      img.src = url;
    }
  }, [peekPrev?.coverUrl, peekNext?.coverUrl]);

  // Share the currently-playing track via the native Web Share API, which on
  // iOS opens the system share sheet (incl. WeChat). No native plugin needed.
  // If Web Share is unavailable, fall back to copying the share text.
  const playingSong =
    state.kind === "playing" || state.kind === "proactive-pending"
      ? state.song
      : null;
  const shareRationale =
    state.kind === "playing"
      ? state.turn.agent_response.rationale
      : state.kind === "proactive-pending"
        ? state.rationale
        : "";
  const handleShare = useCallback(async () => {
    if (!playingSong) return;
    const payload = buildSharePayload(playingSong, shareRationale);

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // User cancelled — don't fall back.
        if (err instanceof Error && err.name === "AbortError") return;
        // share() may be blocked (NotAllowedError) → fall through to clipboard.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(payload.text);
        window.alert("已复制分享文案，粘贴到微信即可发送");
      } catch (err) {
        console.warn("[lyra-ios] share clip fallback:", err);
      }
    }
  }, [playingSong, shareRationale]);

  useEffect(() => {
    const songId = playingSong?.id;
    if (!songId) {
      setFavorited(false);
      return;
    }
    let cancelled = false;
    void isFavorite(songId)
      .then((v) => {
        if (!cancelled) setFavorited(v);
      })
      .catch(() => {
        if (!cancelled) setFavorited(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playingSong?.id]);

  const handleFavorite = useCallback(async () => {
    if (!playingSong) return;
    const prev = favorited;
    setFavorited(!prev);
    try {
      const { favorited: next } = await toggleFavorite(playingSong.id);
      setFavorited(next);
    } catch (err) {
      setFavorited(prev);
      console.warn("[lyra-ios] toggle favorite:", err);
    }
  }, [playingSong, favorited]);

  const trackLocked =
    state.kind === "playing" && Boolean(state.trackLocked);

  const handleTrackLockToggle = useCallback(() => {
    if (state.kind !== "playing") return;
    const next = !orchestrator.isTrackLockEnabled();
    orchestrator.setTrackLock(next);
    if (next) {
      invalidatePlaybackQueueRefills();
      void LyraAudio.clearNextTrack().catch(() => {});
    }
  }, [orchestrator, state.kind]);

  const handleFavoriteChange = useCallback(
    (songId: string, next: boolean) => {
      if (playingSong?.id === songId) setFavorited(next);
    },
    [playingSong?.id],
  );

  const isSparseIdle = state.kind === "idle";
  const [idleLeaving, setIdleLeaving] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const dockFromRectRef = useRef<DOMRect | null>(null);
  const prevIdleRef = useRef(isSparseIdle);

  // FLIP: leaving idle relocates the dock from the centered slogan position
  // to the bottom. Right after layout, offset it back to where it was and
  // let the CSS transform transition glide it down — the input module slides
  // down instead of jumping.
  useLayoutEffect(() => {
    const wasIdle = prevIdleRef.current;
    prevIdleRef.current = isSparseIdle;
    if (!wasIdle || isSparseIdle) return;
    const dock = dockRef.current;
    const from = dockFromRectRef.current;
    if (!dock || !from) return;
    const dy = from.top - dock.getBoundingClientRect().top;
    dockFromRectRef.current = null;
    if (Math.abs(dy) < 1) return;
    dock.style.transition = "none";
    dock.style.transform = `translateY(${dy}px)`;
    void dock.offsetHeight;
    dock.style.transition = "";
    dock.style.transform = "";
  }, [isSparseIdle]);

  // The slogan stays mounted for the duration of its exit glide (see
  // .lyra-mobile-idle-slogan--leaving) and is torn down once that has
  // finished; returning to idle resets it so the next idle shows a fresh
  // slogan instead of a leaving one.
  useEffect(() => {
    if (isSparseIdle) {
      setIdleLeaving(false);
      return;
    }
    if (!idleLeaving) return;
    const t = window.setTimeout(() => setIdleLeaving(false), 800);
    return () => window.clearTimeout(t);
  }, [isSparseIdle, idleLeaving]);

  // The stagger intro belongs to the idle → playing scene change only. Set it
  // before paint so the very first frame of the content already carries it,
  // and drop it once it has played out — a class that lingers would re-fire
  // the keyframes every time an immersive-scoped `animation: none` is lifted.
  const [contentIntro, setContentIntro] = useState(false);
  useLayoutEffect(() => {
    if (isSparseIdle) {
      setContentIntro(false);
      return;
    }
    setContentIntro(true);
    const t = window.setTimeout(() => setContentIntro(false), CONTENT_INTRO_MS);
    return () => window.clearTimeout(t);
  }, [isSparseIdle]);

  useEffect(() => {
    if (immersive) setContentIntro(false);
  }, [immersive]);

  const handleLyraStart = () => {
    dockFromRectRef.current = dockRef.current?.getBoundingClientRect() ?? null;
    setIdleLeaving(true);
    void orchestrator.onLyraStart();
  };

  const handleSubmit = (text: string) => {
    dockFromRectRef.current = dockRef.current?.getBoundingClientRect() ?? null;
    if (isSparseIdle) setIdleLeaving(true);
    void submit(text);
  };

  const pad: PAD = handoffNeighbor
    ? handoffNeighbor.pad
    : state.kind === "playing"
      ? state.turn.current_emotion.pad
      : ZERO_PAD;

  const displayTitle = handoffNeighbor?.title ?? title;
  const displayArtist = handoffNeighbor?.artist ?? artist;
  const displayNote = handoffNeighbor?.rationale ?? noteText;
  const showInlineThinking = shouldShowInlineThinking(
    immersive,
    isThinking,
    Boolean(handoffNeighbor),
  );
  const hideInlineThinking =
    immersive && isThinking && handoffNeighbor === null;
  const paletteCoverUrl = normalizeCoverUrl(
    handoffNeighbor?.coverUrl ?? coverUrl,
  );

  // 播放会话期间（含切歌 thinking 间隙）展示天气 badge；idle 不打扰。
  const showWeather = weather !== null && weather !== undefined && state.kind !== "idle";

  const palette = useCoverPalette(paletteCoverUrl, pad);

  return (
    <AmbientBackground pad={pad}>
      <GlowCanvas palette={palette} />
      <div
        className={[
          "lyra-mobile-stage",
          isSparseIdle ? "lyra-mobile-stage--idle" : "",
          immersive ? "lyra-mobile-stage--immersive" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (shouldSuppressClick()) return;
          // Typing / dismissing the keyboard must never flip immersive.
          if (inputFocused) return;
          if (performance.now() - inputBlurAtRef.current < 400) return;
          if (!canToggleImmersive(state.kind)) return;
          const now = performance.now();
          if (now - immersiveToggleAtRef.current < IMMERSIVE_FLIP_MS) return;
          immersiveToggleAtRef.current = now;
          if (immersive) {
            // Unlock swipe + snap before exit so FLIP isn't fighting the rail,
            // then hand the exit glide the bridge as its start value. Both
            // happen in this frame, so chrome fades in step with the vinyl.
            resetSlide();
            const bridge = releaseImmersiveCover();
            if (bridge) setCoverTransform(bridge);
          }
          setImmersive((v) => !v);
        }}
      >
        {!isSparseIdle && (
          <div
            className={[
              "lyra-mobile-content",
              contentIntro ? "lyra-mobile-content--intro" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            ref={contentRef}
          >
            {/* One persistent cover shell — never remount on immersive toggle. */}
            <ImmersiveCoverRail
              shiftRef={coverShiftRef}
              cd={immersive}
              previous={
                displayPrevious
                  ? {
                      songId: displayPrevious.songId,
                      coverUrl: displayPrevious.coverUrl,
                    }
                  : null
              }
              current={displayCurrent}
              next={
                displayNext
                  ? {
                      songId: displayNext.songId,
                      coverUrl: displayNext.coverUrl,
                    }
                  : null
              }
              centeredRole={centeredRailRole(swipeDirection, handingOff)}
              flipTransform={coverTransform}
              stride={railStride}
              // The arriving disc stays still through the handoff: nothing is
              // playing yet while Lyra picks the next track.
              spinning={discPlaying}
              trackRef={swipeTrackRef}
              onPointerDown={handleSwipePointerDown}
            />
            <SongInfo title={displayTitle} artist={displayArtist} />
            {showInlineThinking ? (
              <ThinkingNote />
            ) : hideInlineThinking ? null : (
              <SmallNote
                text={displayNote}
                color={noteColor}
                error={isErrorNote}
                textLoading={
                  state.kind === "playing" &&
                  Boolean(state.rationalePending) &&
                  !handoffNeighbor
                }
                onClick={
                  isErrorNote || state.kind === "playing"
                    ? handleNoteClick
                    : undefined
                }
                flip={
                  state.kind === "playing" && !isErrorNote
                    ? {
                        flipped: noteFlipped,
                        backText: lyricsText ?? undefined,
                        loading: lyricsLoading,
                        failed: lyricsFailed,
                        refreshing: lyricsRefreshing,
                        onRefresh: () => {
                          void refreshLyrics();
                        },
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}

        <div className="lyra-mobile-idle-brand-slot" aria-hidden="true" />

        {/* 顶栏：左分享 · 右天气 —— 同水平线，沉浸式一并隐藏 */}
        {playingSong && (
          <button
            type="button"
            className="lyra-mobile-top-share"
            onClick={(e) => {
              e.stopPropagation();
              lightTap();
              void handleShare();
            }}
            title="分享到微信"
            aria-label="分享到微信"
            data-testid="share-btn"
          >
            <IconShare size={16} />
          </button>
        )}
        <WeatherBadge weather={showWeather ? weather : null} />

        <div
          ref={dockRef}
          className={[
            "lyra-mobile-dock",
            isSparseIdle ? "lyra-mobile-dock--idle" : "",
            playing ? "lyra-mobile-dock--playing" : "",
            progress ? "lyra-mobile-dock--progress" : "",
            dockExpanded ? "lyra-mobile-dock--expanded" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            if (!isSparseIdle) setDockExpanded((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isSparseIdle ? (
            <div className="lyra-mobile-idle-actions">
              <button
                type="button"
                className="lyra-mobile-idle-history"
                data-testid="idle-history-btn"
                title="播放历史"
                aria-label="播放历史"
                onClick={(e) => {
                  e.stopPropagation();
                  lightTap();
                  setHistoryOpen(true);
                }}
              >
                <IconHistory />
              </button>
              <button
                type="button"
                className="lyra-mobile-idle-slogan"
                data-testid="lyra-idle-slogan"
                onClick={handleLyraStart}
              >
                {LYRA_START_LABEL}
              </button>
            </div>
          ) : (
            <>
              {idleLeaving && (
                <button
                  type="button"
                  className="lyra-mobile-idle-slogan lyra-mobile-idle-slogan--leaving"
                  data-testid="lyra-idle-slogan"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  {LYRA_START_LABEL}
                </button>
              )}
              <div
                className={[
                  "lyra-mobile-progress-wrap",
                  progress ? "lyra-mobile-progress-wrap--show" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden={!progress}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="lyra-mobile-progress-wrap__inner">
                  <ProgressBar
                    progress={progress?.progress ?? 0}
                    durationMs={progress?.durationMs ?? 0}
                    label={
                      progress
                        ? progressLabel(progress.elapsedMs, progress.durationMs)
                        : ""
                    }
                    onSeek={(positionMs) => {
                      void LyraAudio.seek({ positionMs }).catch((err) => {
                        console.warn("[lyra-ios] seek:", err);
                      });
                    }}
                  />
                </div>
              </div>
              <PlayerControls
                canControl={playing}
                paused={state.kind === "playing" ? Boolean(state.paused) : true}
                loading={
                  state.kind === "playing" && !state.paused && progress === null
                }
                canSkip={canSkip}
                canGoPrevious={canGoPrevious}
                onTogglePlay={handleTogglePlay}
                onSkip={handleSkip}
                onPrevious={handlePrevious}
                onHistory={() => setHistoryOpen(true)}
                onFavorite={() => {
                  void handleFavorite();
                }}
                favorited={favorited}
              />
            </>
          )}
          <div
            className="lyra-mobile-input-row"
            onClick={(e) => e.stopPropagation()}
          >
            <InputBox
              onSubmit={handleSubmit}
              onFocus={() => {
                setInputFocused(true);
              }}
              onBlur={() => {
                setInputFocused(false);
                inputBlurAtRef.current = performance.now();
              }}
            />
            {playing && (
              <TrackLockButton
                locked={trackLocked}
                onToggle={handleTrackLockToggle}
                disabled={!playing}
              />
            )}
          </div>
        </div>
      </div>

      <HistoryOverlay
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        orchestrator={orchestrator}
        onFavoriteChange={handleFavoriteChange}
      />
    </AmbientBackground>
  );
}
