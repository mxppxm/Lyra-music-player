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
import { looksLikePartialLyrics } from "@lyra/core/agents/LyricsAgent";
import type { PAD } from "../lib/color";
import { setImmersiveStatusBar } from "./immersiveStatusBar";
import { buildSharePayload } from "./share";
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
  canToggleImmersive,
  centeredRailRole,
  compensateImmersiveCoverPosition,
  shouldCenterThinkingPlaceholder,
  shouldShowInlineThinking,
  type ImmersiveCoverTransform,
} from "./immersiveCoverMotion";

const ZERO_PAD: PAD = { p: 0, a: 0, d: 0 };
const LYRA_START_LABEL = "点我试试";

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
  const [immersive, setImmersive] = useState(false);
  const previousImmersiveRef = useRef(immersive);
  const immersiveToggleAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [noteFlipped, setNoteFlipped] = useState(false);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsFailed, setLyricsFailed] = useState(false);
  const [lyricsRefreshing, setLyricsRefreshing] = useState(false);
  const coverShiftRef = useRef<HTMLDivElement>(null);
  const swipeTrackRef = useRef<HTMLDivElement>(null);
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

  // FLIP: glide the cover to the screen center and scale it up when
  // entering immersive mode; "none" on exit animates it back.
  useLayoutEffect(() => {
    if (!immersive) {
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
  }, [immersive]);

  // The disc turns on playback state alone. Gating it on the first progress
  // tick would stall every freshly centered CD for a beat before it spins.
  const discPlaying = state.kind === "playing" && !state.paused;

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
  useLayoutEffect(() => {
    if (!immersive) {
      stabilizedCoverSongRef.current = currentSongId;
      return;
    }
    const songChanged = stabilizedCoverSongRef.current !== currentSongId;
    if (!swipePending && !songChanged) return;
    stabilizedCoverSongRef.current = currentSongId;
    const shell = coverShiftRef.current;
    if (!shell) return;
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
  }, [currentSongId, immersive, swipeDirection, swipePending]);

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
          if (!canToggleImmersive(state.kind)) return;
          const now = performance.now();
          if (now - immersiveToggleAtRef.current < 560) return;
          immersiveToggleAtRef.current = now;
          // Unlock swipe + snap before exit so FLIP isn't fighting the rail.
          if (immersive) resetSlide();
          setImmersive((v) => !v);
        }}
      >
        {!isSparseIdle && (
          <div className="lyra-mobile-content">
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
              // Keep turning through the handoff so the arriving disc is
              // already alive when it reaches the center.
              spinning={discPlaying || swipePending}
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

        {/* 天气 badge —— stage 顶部绝对定位，不参与 content 布局，不推挤沉浸元素 */}
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
            <button
              type="button"
              className="lyra-mobile-idle-slogan"
              data-testid="lyra-idle-slogan"
              onClick={handleLyraStart}
            >
              {LYRA_START_LABEL}
            </button>
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
                onShare={handleShare}
              />
            </>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <InputBox onSubmit={handleSubmit} />
          </div>
        </div>
      </div>

      <HistoryOverlay
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        orchestrator={orchestrator}
      />
    </AmbientBackground>
  );
}
