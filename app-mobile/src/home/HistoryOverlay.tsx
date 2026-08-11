// HistoryOverlay — 播放历史 / 收藏（固定高度底部单 + 横向滑动 Tab）。
import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { listRecentTurns } from "@lyra/core/db/repo/turnRepo";
import { getTrack } from "@lyra/core/db/repo/libraryRepo";
import {
  getFavoriteSongIds,
  listFavorites,
  toggleFavorite,
} from "@lyra/core/db/repo/favoritesRepo";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";
import type { CurrentEmotion, DialogueTurn, LibraryTrack } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { IconFavorite, IconHistory } from "./icons";
import { lightTap } from "./immersiveStatusBar";

const MAX_HISTORY = 50;
const DRAG_THRESHOLD_RATIO = 0.35;
const CLOSE_ANIM_MS = 360;
const EXIT_MARGIN = 60;
const SPRING_STIFFNESS = 220;
const SPRING_DAMPING = 22;
const MASS = 1;
const LEAVE_MS = 230;

const FAVORITE_REPLAY_EMOTION: CurrentEmotion = {
  pad: { p: 0.25, a: 0.1, d: 0.2 },
  labels: ["favorite"],
  confidence: 0.5,
  source: "emotion-agent-inferred",
};

export type HistoryOverlayProps = {
  open: boolean;
  onClose: () => void;
  orchestrator: Orchestrator;
  /** Notify parent when a favorite toggles (keeps dock heart in sync). */
  onFavoriteChange?: (songId: string, favorited: boolean) => void;
};

type SheetTab = "history" | "favorites";

type HistoryEntry = {
  turn: DialogueTurn;
  track: LibraryTrack | null;
};

type FavoriteEntry = {
  songId: string;
  favoritedAt: number;
  track: LibraryTrack | null;
};

export function HistoryOverlay({
  open,
  onClose,
  orchestrator,
  onFavoriteChange,
}: HistoryOverlayProps) {
  const [tab, setTab] = useState<SheetTab>("history");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [leavingIds, setLeavingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const sheetHeightRef = useRef(0);
  const velocityRef = useRef(0);
  const animFrameRef = useRef<number | undefined>(undefined);
  const targetYRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const closePendingRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const scrollSyncLockRef = useRef(false);

  const refreshFavorites = useCallback(async () => {
    const rows = await listFavorites();
    const tracks = await Promise.all(
      rows.map((r) => getTrack(r.song_id).catch(() => null)),
    );
    const next: FavoriteEntry[] = rows.map((r, i) => ({
      songId: r.song_id,
      favoritedAt: r.favorited_at,
      track: tracks[i],
    }));
    setFavorites(next);
    setFavoriteIds(new Set(rows.map((r) => r.song_id)));
  }, []);

  const scrollToTab = useCallback((next: SheetTab, smooth: boolean) => {
    const el = pagesRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const left = next === "favorites" ? width : 0;
    scrollSyncLockRef.current = true;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    } else {
      el.scrollLeft = left;
    }
    window.setTimeout(() => {
      scrollSyncLockRef.current = false;
    }, smooth ? 380 : 0);
  }, []);

  const selectTab = useCallback(
    (next: SheetTab) => {
      setTab(next);
      scrollToTab(next, true);
    },
    [scrollToTab],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLeavingIds(new Set());
    Promise.all([listRecentTurns(MAX_HISTORY), listFavorites()])
      .then(async ([turns, favRows]) => {
        const historyTracks = await Promise.all(
          turns.map((t) => getTrack(t.agent_response.song_id).catch(() => null)),
        );
        const favTracks = await Promise.all(
          favRows.map((r) => getTrack(r.song_id).catch(() => null)),
        );
        if (cancelled) return;
        setEntries(turns.map((turn, i) => ({ turn, track: historyTracks[i] })));
        setFavorites(
          favRows.map((r, i) => ({
            songId: r.song_id,
            favoritedAt: r.favorited_at,
            track: favTracks[i],
          })),
        );
        const histIds = turns.map((t) => t.agent_response.song_id).filter(Boolean);
        const ids = await getFavoriteSongIds([
          ...histIds,
          ...favRows.map((r) => r.song_id),
        ]);
        if (!cancelled) setFavoriteIds(ids);
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setFavorites([]);
          setFavoriteIds(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !sheetRef.current || typeof ResizeObserver === "undefined") return;
    const updateHeight = () => {
      sheetHeightRef.current = sheetRef.current?.offsetHeight ?? 0;
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [open]);

  // Keep pager aligned after data load (layout width becomes real).
  useEffect(() => {
    if (!open || loading) return;
    scrollToTab(tab, false);
    // Only re-snap after load; tab clicks/swipes own their scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, scrollToTab]);

  const runSpring = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const animate = () => {
      const currentY = dragYRef.current;
      const currentV = velocityRef.current;
      const target = targetYRef.current;

      const displacement = target - currentY;
      const springForce = displacement * SPRING_STIFFNESS;
      const dampingForce = -currentV * SPRING_DAMPING;
      const acceleration = (springForce + dampingForce) / MASS;

      const newV = currentV + acceleration * 0.016;
      const newY = currentY + newV * 0.016;

      const settled = Math.abs(newY - target) < 0.5 && Math.abs(newV) < 0.5;

      if (settled) {
        dragYRef.current = target;
        velocityRef.current = 0;
        isAnimatingRef.current = false;
        setDragY(target);
        return;
      }

      dragYRef.current = newY;
      velocityRef.current = newV;
      setDragY(newY);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, []);

  const springTo = useCallback(
    (target: number) => {
      targetYRef.current = target;
      runSpring();
    },
    [runSpring],
  );

  const closeSheet = useCallback(() => {
    if (closePendingRef.current) return;
    closePendingRef.current = true;
    springTo(sheetHeightRef.current + EXIT_MARGIN);
    closeTimerRef.current = window.setTimeout(() => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = undefined;
      isAnimatingRef.current = false;
      dragYRef.current = 0;
      velocityRef.current = 0;
      targetYRef.current = 0;
      closePendingRef.current = false;
      setDragY(0);
      onCloseRef.current();
    }, CLOSE_ANIM_MS);
  }, [springTo]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      const delta = e.clientY - startYRef.current;
      if (delta > 0) {
        dragYRef.current = delta;
        setDragY(delta);
      }
    };
    const onUp = () => {
      setIsDragging(false);
      const threshold = sheetHeightRef.current * DRAG_THRESHOLD_RATIO;
      if (dragYRef.current > threshold) {
        closeSheet();
      } else {
        springTo(0);
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, springTo, closeSheet]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!open) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(".lyra-mobile-history__pages") ||
        target.closest(".lyra-mobile-history__list") ||
        target.closest(".lyra-mobile-history__item") ||
        target.closest(".lyra-mobile-history__tabs") ||
        target.closest(".lyra-mobile-history__fav")
      ) {
        return;
      }
      startYRef.current = e.clientY;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      isAnimatingRef.current = false;
      setIsDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [open],
  );

  const handlePagesScroll = useCallback(() => {
    if (scrollSyncLockRef.current) return;
    const el = pagesRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const next: SheetTab = el.scrollLeft > width * 0.5 ? "favorites" : "history";
    setTab((prev) => (prev === next ? prev : next));
  }, []);

  const handleReplayHistory = useCallback(
    (entry: HistoryEntry) => {
      if (!entry.track) return;
      // Rationale arg is ignored — Orchestrator regenerates live copy.
      void orchestrator.onReplaySong(
        entry.track,
        "",
        entry.turn.current_emotion,
      );
      closeSheet();
    },
    [orchestrator, closeSheet],
  );

  const handleReplayFavorite = useCallback(
    (entry: FavoriteEntry) => {
      if (!entry.track) return;
      void orchestrator.onReplaySong(
        entry.track,
        "",
        FAVORITE_REPLAY_EMOTION,
      );
      closeSheet();
    },
    [orchestrator, closeSheet],
  );

  const handleToggleFavorite = useCallback(
    async (songId: string) => {
      if (!songId) return;
      lightTap();
      const wasFav = favoriteIds.has(songId);
      // Optimistic UI — avoid chrome flash while awaiting SQLite.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(songId);
        else next.add(songId);
        return next;
      });
      onFavoriteChange?.(songId, !wasFav);
      if (wasFav && tab === "favorites") {
        setLeavingIds((prev) => new Set(prev).add(songId));
        window.setTimeout(() => {
          setFavorites((prev) => prev.filter((f) => f.songId !== songId));
          setLeavingIds((prev) => {
            const next = new Set(prev);
            next.delete(songId);
            return next;
          });
        }, LEAVE_MS);
      }

      try {
        const { favorited } = await toggleFavorite(songId);
        if (favorited !== !wasFav) {
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            if (favorited) next.add(songId);
            else next.delete(songId);
            return next;
          });
          onFavoriteChange?.(songId, favorited);
        }
        if (favorited && !wasFav) void refreshFavorites();
      } catch (err) {
        console.warn("[lyra-ios] toggle favorite:", err);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(songId);
          else next.delete(songId);
          return next;
        });
        onFavoriteChange?.(songId, wasFav);
      }
    },
    [favoriteIds, onFavoriteChange, refreshFavorites, tab],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    setIsDragging(false);
    setTab("history");
    velocityRef.current = 0;
    dragYRef.current = 0;
    targetYRef.current = 0;
    closePendingRef.current = false;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    requestAnimationFrame(() => scrollToTab("history", false));
  }, [open, scrollToTab]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const sheetTransform = `translateY(${dragY}px)`;

  if (!open && dragY === 0) return null;

  const historyEmpty = !loading && entries.length === 0;
  const favoritesEmpty = !loading && favorites.length === 0;

  // Portal above the fixed brand layer — ambient creates z-index:0, so an
  // in-tree overlay (even at 200) still paints under .lyra-mobile-brand-layer.
  return createPortal(
    <div
      className="lyra-mobile-history"
      role="dialog"
      aria-label="历史与收藏"
      data-testid="history-overlay"
      onPointerDown={handlePointerDown}
    >
      <div
        className="lyra-mobile-history__backdrop"
        data-testid="history-backdrop"
        onClick={() => !isDragging && closeSheet()}
      />
      <div
        ref={sheetRef}
        className="lyra-mobile-history__sheet"
        style={{ transform: sheetTransform }}
      >
        <div className="lyra-mobile-history__grabber" aria-hidden />
        <div className="lyra-mobile-history__head">
          <div
            className="lyra-mobile-history__tabs"
            role="tablist"
            aria-label="历史与收藏"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
              className={[
                "lyra-mobile-history__tab",
                tab === "history" ? "lyra-mobile-history__tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid="history-tab"
              onClick={() => selectTab("history")}
            >
              历史
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "favorites"}
              className={[
                "lyra-mobile-history__tab",
                tab === "favorites" ? "lyra-mobile-history__tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid="favorites-tab"
              onClick={() => selectTab("favorites")}
            >
              收藏
            </button>
          </div>
        </div>

        <div
          ref={pagesRef}
          className="lyra-mobile-history__pages"
          data-testid="history-pages"
          onScroll={handlePagesScroll}
        >
          <section
            className="lyra-mobile-history__page"
            role="tabpanel"
            aria-label="历史"
            data-testid="history-page"
          >
            {loading && (
              <p className="lyra-mobile-history__hint" data-testid="history-loading">
                正在翻阅记忆…
              </p>
            )}
            {historyEmpty && (
              <div
                className="lyra-mobile-history__empty"
                data-testid="history-empty"
              >
                <div className="lyra-mobile-history__empty-glyph" aria-hidden>
                  <IconHistory size={26} />
                </div>
                <p className="lyra-mobile-history__empty-title">还没有听过歌</p>
                <p className="lyra-mobile-history__empty-sub">
                  和我说句话，我替你挑一首。
                </p>
              </div>
            )}
            {!historyEmpty && (
            <ul className="lyra-mobile-history__list" data-testid="history-list">
              {entries.map((entry, i) => {
                const songId = entry.turn.agent_response.song_id;
                const fav = favoriteIds.has(songId);
                return (
                  <li
                    key={entry.turn.id}
                    className="lyra-mobile-history__item"
                    onClick={() => handleReplayHistory(entry)}
                    data-testid={`history-item-${i}`}
                  >
                    <span
                      className="lyra-mobile-history__mood"
                      style={{
                        background: getMoodColor(entry.turn.current_emotion.pad),
                      }}
                      aria-hidden
                    />
                    <div className="lyra-mobile-history__body">
                      <div className="lyra-mobile-history__song">
                        <span className="lyra-mobile-history__title">
                          {entry.track
                            ? songDisplayTitle(entry.track)
                            : "（歌曲已不在库中）"}
                        </span>
                        {entry.track && entry.track.artist && (
                          <span className="lyra-mobile-history__artist">
                            {songDisplayArtist(entry.track)}
                          </span>
                        )}
                      </div>
                      <span className="lyra-mobile-history__time">
                        {formatRelativeTime(entry.turn.timestamp)}
                      </span>
                    </div>
                    {songId ? (
                      <button
                        type="button"
                        className={[
                          "lyra-mobile-history__fav",
                          fav ? "lyra-mobile-history__fav--on" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-testid={`history-fav-${i}`}
                        aria-label={fav ? "取消收藏" : "收藏"}
                        aria-pressed={fav}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleFavorite(songId);
                        }}
                      >
                        <IconFavorite filled={fav} size={18} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            )}
          </section>

          <section
            className="lyra-mobile-history__page"
            role="tabpanel"
            aria-label="收藏"
            data-testid="favorites-page"
          >
            {loading && (
              <p className="lyra-mobile-history__hint">正在翻阅记忆…</p>
            )}
            {favoritesEmpty && (
              <div
                className="lyra-mobile-history__empty"
                data-testid="favorites-empty"
              >
                <div className="lyra-mobile-history__empty-glyph" aria-hidden>
                  <IconFavorite size={26} />
                </div>
                <p className="lyra-mobile-history__empty-title">收藏是空的</p>
                <p className="lyra-mobile-history__empty-sub">
                  听歌时点心形，喜欢的歌会留在这里。
                </p>
              </div>
            )}
            {!favoritesEmpty && (
            <ul className="lyra-mobile-history__list" data-testid="favorites-list">
              {favorites.map((entry, i) => {
                const leaving = leavingIds.has(entry.songId);
                return (
                  <li
                    key={entry.songId}
                    className={[
                      "lyra-mobile-history__item",
                      leaving ? "lyra-mobile-history__item--leaving" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleReplayFavorite(entry)}
                    data-testid={`favorite-item-${i}`}
                  >
                    <div className="lyra-mobile-history__body">
                      <div className="lyra-mobile-history__song">
                        <span className="lyra-mobile-history__title">
                          {entry.track
                            ? songDisplayTitle(entry.track)
                            : "（歌曲已不在库中）"}
                        </span>
                        {entry.track && entry.track.artist && (
                          <span className="lyra-mobile-history__artist">
                            {songDisplayArtist(entry.track)}
                          </span>
                        )}
                      </div>
                      <span className="lyra-mobile-history__time">
                        {formatRelativeTime(entry.favoritedAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="lyra-mobile-history__fav lyra-mobile-history__fav--on"
                      data-testid={`favorite-fav-${i}`}
                      aria-label="取消收藏"
                      aria-pressed
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleFavorite(entry.songId);
                      }}
                    >
                      <IconFavorite filled size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function getMoodColor(pad: { p: number; a: number; d: number }): string {
  const h = 240 + (pad.p + 1) * 105;
  const s = Math.max(30, 32 + pad.a * 36);
  const l = Math.max(38, Math.min(70, 82 + pad.d * 8));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const min = Math.floor(Math.max(0, now - ts) / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
