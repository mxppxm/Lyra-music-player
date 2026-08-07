// HistoryOverlay — 播放历史面板。记录当时选的歌、那行文案、时间和情绪。
// Opened from the history icon in the dock (HomeView).
import { useEffect, useState } from "react";
import { AnimatedMount } from "../ui/motion/AnimatedMount";
import { listRecentTurns } from "../db/repo/turnRepo";
import { getTrack } from "../db/repo/libraryRepo";
import { songDisplayTitle, songDisplayArtist } from "../library/display";
import { padHSL } from "../lib/color";
import { IconHistory } from "./icons";
import type { DialogueTurn, LibraryTrack } from "../types";
import type { Orchestrator } from "@lyra/core/turn/Orchestrator.ts";

const MAX_HISTORY = 50;

export type HistoryOverlayProps = {
  open: boolean;
  onClose: () => void;
  orchestrator: Orchestrator;
};

type HistoryEntry = {
  turn: DialogueTurn;
  track: LibraryTrack | null;
};

export function HistoryOverlay({
  open,
  onClose,
  orchestrator,
}: HistoryOverlayProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listRecentTurns(MAX_HISTORY)
      .then(async (turns) => {
        const tracks = await Promise.all(
          turns.map((t) => getTrack(t.agent_response.song_id).catch(() => null)),
        );
        if (cancelled) return;
        setEntries(turns.map((turn, i) => ({ turn, track: tracks[i] })));
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleReplay = (entry: HistoryEntry) => {
    if (!entry.track) return;
    void orchestrator.onReplaySong(
      entry.track,
      entry.turn.agent_response.rationale,
      entry.turn.current_emotion,
    );
    onClose();
  };

  return (
    <AnimatedMount
      open={open}
      zIndex={9998}
      enterMs={420}
      exitMs={220}
      backdrop={
        <div
          data-testid="history-backdrop"
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      }
    >
      <div
        role="dialog"
        aria-label="播放历史"
        data-testid="history-overlay"
        className="settings-modal"
        style={{ maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }}
      >
        <h2>播放历史</h2>

        {loading && (
          <p data-testid="history-loading" style={{ opacity: 0.6 }}>
            正在翻阅记忆…
          </p>
        )}

        {!loading && entries.length === 0 && (
          <p data-testid="history-empty" style={{ opacity: 0.6 }}>
            还没有播放记录。和我说句话，我替你挑一首。
          </p>
        )}

        <ul className="lyra-history-list">
          {entries.map((entry, i) => (
            <HistoryRow
              key={entry.turn.id}
              index={i}
              entry={entry}
              onReplay={handleReplay}
            />
          ))}
        </ul>

        <div className="settings-actions">
          <button onClick={onClose} data-testid="history-close">
            好
          </button>
        </div>
      </div>
      <style>
        {`
        .lyra-motion-panel--center.lyra-motion--entering {
          animation: lyra-history-in 420ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        .lyra-motion-panel--center.lyra-motion--leaving {
          animation: lyra-history-out 220ms cubic-bezier(0.4, 0, 0.76, 0.2) both;
        }
        .lyra-motion--entering .lyra-modal-backdrop {
          animation: lyra-history-backdrop-in 250ms ease both;
        }
        .lyra-motion--leaving .lyra-modal-backdrop {
          animation: lyra-history-backdrop-out 200ms ease both;
        }
        @keyframes lyra-history-in {
          0%   { opacity: 0; transform: translateY(28px) scale(0.94); }
          50%  { opacity: 1; }
          60%  { transform: translateY(-5px) scale(1.02); }
          78%  { transform: translateY(2px) scale(0.995); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lyra-history-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(12px) scale(0.975); }
        }
        @keyframes lyra-history-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes lyra-history-backdrop-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        `}
      </style>
    </AnimatedMount>
  );
}

function HistoryRow({
  entry,
  index,
  onReplay,
}: {
  entry: HistoryEntry;
  index: number;
  onReplay: (entry: HistoryEntry) => void;
}) {
  const { turn, track } = entry;
  const { h, s, l } = padHSL(turn.current_emotion.pad);
  const moodColor = `hsl(${h}, ${Math.max(30, s)}%, ${Math.max(38, Math.min(70, l))}%)`;
  const title = track ? songDisplayTitle(track) : "（歌曲已不在库中）";
  const artist = track ? songDisplayArtist(track) : "";
  const rationale = turn.agent_response.rationale.trim() || "…";

  return (
    <li className="lyra-history-item">
      <span
        className="lyra-history-mood"
        style={{ background: moodColor }}
        data-testid={`history-mood-${index}`}
        aria-hidden
      />
      <div className="lyra-history-body">
        <div className="lyra-history-song">
          <span className="lyra-history-title">{title}</span>
          {artist && <span className="lyra-history-artist">{artist}</span>}
        </div>
        <p className="lyra-history-note">{rationale}</p>
        <span className="lyra-history-time">
          {formatRelativeTime(turn.timestamp)}
        </span>
      </div>
      <button
        type="button"
        className="lyra-history-replay"
        disabled={!track}
        onClick={() => onReplay(entry)}
        title="再听一次"
        aria-label={`再听一次 ${title}`}
        data-testid={`history-replay-${index}`}
      >
        <IconHistory size={16} />
      </button>
    </li>
  );
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
