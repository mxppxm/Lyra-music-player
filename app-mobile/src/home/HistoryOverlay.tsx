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
import {
  listDailySnapshots,
  type DailySnapshotRow,
} from "@lyra/core/db/repo/dailySnapshotsRepo";
import { runDaily } from "@lyra/core/daily/runDaily";
import { dayKey, yesterdayDayKey } from "@lyra/core/daily/dayKey";
import { trackActivity } from "@lyra/core/daily/trackActivity";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";
import type { CurrentEmotion, DialogueTurn, LibraryTrack } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";
import { IconFavorite, IconHistory } from "./icons";
import { lightTap } from "./immersiveStatusBar";
import { DailyDigestSheet } from "./DailyDigestSheet";

const MAX_HISTORY = 50;
const TAB_ORDER = ["history", "favorites", "daily"] as const;
type SheetTab = (typeof TAB_ORDER)[number];

const DRAG_THRESHOLD_RATIO = 0.35;
const CLOSE_ANIM_MS = 360;
const EXIT_MARGIN = 60;
const SPRING_STIFFNESS = 220;
const SPRING_DAMPING = 22;
const MASS = 1;
const LEAVE_MS = 230;

function HistorySheetLoading({
  label = "加载中",
  testId,
}: {
  label?: string;
  testId?: string;
}) {
  return (
    <div
      className="lyra-mobile-history__loading"
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="lyra-mobile-thinking__dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
      <p className="lyra-mobile-history__loading-label">{label}</p>
    </div>
  );
}

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
  const [dailies, setDailies] = useState<DailySnapshotRow[]>([]);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyOpen, setDailyOpen] = useState<{
    dayKey: string;
    html: string;
    origin: { top: number; left: number; width: number; height: number };
  } | null>(null);
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
    const idx = TAB_ORDER.indexOf(next);
    const left = Math.max(0, idx) * width;
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
    Promise.all([
      listRecentTurns(MAX_HISTORY),
      listFavorites(),
      listDailySnapshots(30).catch(() => [] as DailySnapshotRow[]),
      runDaily({ dayKey: yesterdayDayKey() }).catch(() => null),
    ])
      .then(async ([turns, favRows, dailyRows]) => {
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
        const refreshed = await listDailySnapshots(30).catch(() => dailyRows);
        setDailies(refreshed);
        setDailyOpen(null);
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
          setDailies([]);
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
      // Daily sheet is open — never start History drag-to-dismiss.
      if (dailyOpen) return;
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
    [open, dailyOpen],
  );

  const handlePagesScroll = useCallback(() => {
    if (scrollSyncLockRef.current) return;
    const el = pagesRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / width);
    const next = TAB_ORDER[Math.max(0, Math.min(TAB_ORDER.length - 1, idx))]!;
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
        void trackActivity({
          name: favorited ? "favorite_add" : "favorite_remove",
          songId,
        });
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
    if (!open) setDailyOpen(null);
  }, [open]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const openDaily = useCallback(
    (row: DailySnapshotRow, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      lightTap();
      setDailyOpen({
        dayKey: row.day_key,
        html: row.html,
        origin: {
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        },
      });
    },
    [],
  );

  const refreshDailyList = useCallback(async () => {
    const rows = await listDailySnapshots(30).catch(() => [] as DailySnapshotRow[]);
    setDailies(rows);
    return rows;
  }, []);

  /** Manual: force-rebuild today's digest from whatever data exists so far. */
  const handleGenerateDaily = useCallback(async () => {
    if (dailyBusy) return;
    lightTap();
    setDailyBusy(true);
    void trackActivity({ name: "daily_generate_manual", props: { day: "today" } });
    try {
      const today = dayKey();
      const result = await runDaily({ dayKey: today, force: true });
      const rows = await refreshDailyList();
      const row = rows.find((r) => r.day_key === result.dayKey);
      if (row) {
        setDailyOpen({
          dayKey: row.day_key,
          html: row.html,
          origin: {
            top: window.innerHeight * 0.4,
            left: 24,
            width: Math.max(200, window.innerWidth - 48),
            height: 56,
          },
        });
      }
    } catch (err) {
      console.warn("[lyra-ios] generate daily:", err);
    } finally {
      setDailyBusy(false);
    }
  }, [dailyBusy, refreshDailyList]);

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
      className={[
        "lyra-mobile-history",
        dailyOpen ? "lyra-mobile-history--daily-locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
            aria-label="历史、收藏与日报"
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
            <button
              type="button"
              role="tab"
              aria-selected={tab === "daily"}
              className={[
                "lyra-mobile-history__tab",
                tab === "daily" ? "lyra-mobile-history__tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid="daily-tab"
              onClick={() => {
                void trackActivity({ name: "history_open", props: { tab: "daily" } });
                selectTab("daily");
              }}
            >
              日报
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
            {loading ? (
              <HistorySheetLoading testId="history-loading" />
            ) : historyEmpty ? (
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
            ) : (
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
            {loading ? (
              <HistorySheetLoading />
            ) : favoritesEmpty ? (
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
            ) : (
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

          <section
            className="lyra-mobile-history__page"
            role="tabpanel"
            aria-label="日报"
            data-testid="daily-page"
          >
            {loading ? (
              <HistorySheetLoading />
            ) : (
              <>
                <div className="lyra-mobile-history__daily-actions">
                  <button
                    type="button"
                    className="lyra-mobile-history__daily-gen"
                    data-testid="daily-generate"
                    disabled={dailyBusy}
                    onClick={() => {
                      void handleGenerateDaily();
                    }}
                  >
                    {dailyBusy ? "生成中…" : "生成日报"}
                  </button>
                </div>
                {dailies.length === 0 ? (
                  <div
                    className="lyra-mobile-history__empty"
                    data-testid="daily-empty"
                  >
                    <p className="lyra-mobile-history__empty-title">还没有日报</p>
                    <p className="lyra-mobile-history__empty-sub">
                      听一会儿、说一两句心情，再点「生成日报」。
                    </p>
                  </div>
                ) : (
                  <ul className="lyra-mobile-history__list" data-testid="daily-list">
                    {dailies.map((row, i) => (
                      <li
                        key={row.day_key}
                        className="lyra-mobile-history__item"
                        data-testid={`daily-item-${i}`}
                        onClick={(e) => openDaily(row, e.currentTarget)}
                      >
                        <div className="lyra-mobile-history__body">
                          <div className="lyra-mobile-history__song">
                            <span className="lyra-mobile-history__title">
                              {row.day_key}
                            </span>
                          </div>
                          <span className="lyra-mobile-history__time">
                            {row.fallback ? "记录较少" : "已生成"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      {dailyOpen ? (
        <DailyDigestSheet
          open
          dayKey={dailyOpen.dayKey}
          html={dailyOpen.html}
          origin={dailyOpen.origin}
          onClose={() => setDailyOpen(null)}
        />
      ) : null}
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
