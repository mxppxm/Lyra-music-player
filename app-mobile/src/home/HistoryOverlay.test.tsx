import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HistoryOverlay, formatRelativeTime } from "./HistoryOverlay";
import type { Orchestrator } from "@lyra/core";

vi.mock("@lyra/core/daily/trackActivity", () => ({
  trackActivity: vi.fn(async () => {}),
}));
vi.mock("@lyra/core/daily/PlaySessionTracker", () => ({
  playSessionTracker: {
    noteLyricsOpen: vi.fn(),
    noteProgress: vi.fn(),
    noteSeek: vi.fn(),
    notePause: vi.fn(),
    noteResume: vi.fn(),
    noteBackground: vi.fn(),
    noteForeground: vi.fn(),
  },
}));

vi.mock("@lyra/core/db/repo/turnRepo", () => ({
  listRecentTurns: vi.fn(),
}));

vi.mock("@lyra/core/db/repo/libraryRepo", () => ({
  getTrack: vi.fn(),
}));

vi.mock("@lyra/core/db/repo/favoritesRepo", () => ({
  listFavorites: vi.fn(),
  getFavoriteSongIds: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock("@lyra/core/db/repo/dailySnapshotsRepo", () => ({
  listDailySnapshots: vi.fn(),
}));

vi.mock("@lyra/core/daily/runDaily", () => ({
  runDaily: vi.fn(),
}));

vi.mock("@lyra/core/daily/dayKey", () => ({
  yesterdayDayKey: vi.fn(() => "2026-08-10"),
  dayKey: vi.fn(() => "2026-08-11"),
}));

import { listRecentTurns } from "@lyra/core/db/repo/turnRepo";
import { getTrack } from "@lyra/core/db/repo/libraryRepo";
import {
  listFavorites,
  getFavoriteSongIds,
  toggleFavorite,
} from "@lyra/core/db/repo/favoritesRepo";
import { listDailySnapshots } from "@lyra/core/db/repo/dailySnapshotsRepo";
import { runDaily } from "@lyra/core/daily/runDaily";

const turn = {
  id: "turn-1",
  timestamp: Date.now() - 5 * 60_000,
  current_emotion: {
    pad: { p: 0.3, a: 0.1, d: 0.2 },
    labels: ["calm"],
    confidence: 0.8,
    source: "emotion-agent-inferred" as const,
  },
  user_utterance: { modality: "text" as const, content: "最近有点累" },
  agent_response: { song_id: "track-1", rationale: "舒缓的旋律，陪你慢下来" },
  user_reaction: {
    behavioral: {
      listen_duration_ms: 0,
      completed: false,
      skipped: false,
      repeated: 0,
      volume_delta: 0,
    },
    silence_positive: false,
  },
  emotion_delta: { p: 0, a: 0, d: 0 },
};

const track = {
  id: "track-1",
  path: "/music/test.flac",
  title: "Nuvole Bianche",
  artist: "Ludovico Einaudi",
  album: undefined,
  duration_ms: undefined,
  added_at: Date.now(),
  origin: "local" as const,
};

function makeStubOrchestrator(): Orchestrator {
  return {
    onReplaySong: vi.fn(async () => {}),
  } as unknown as Orchestrator;
}

beforeEach(() => {
  vi.mocked(listRecentTurns).mockResolvedValue([]);
  vi.mocked(getTrack).mockResolvedValue(null);
  vi.mocked(listFavorites).mockResolvedValue([]);
  vi.mocked(getFavoriteSongIds).mockResolvedValue(new Set());
  vi.mocked(toggleFavorite).mockResolvedValue({ favorited: true });
  vi.mocked(listDailySnapshots).mockResolvedValue([]);
  vi.mocked(runDaily).mockResolvedValue({
    dayKey: "2026-08-10",
    html: "<html></html>",
    sparse: true,
    created: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryOverlay", () => {
  it("renders nothing when closed", () => {
    render(
      <HistoryOverlay open={false} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    expect(screen.queryByTestId("history-overlay")).not.toBeInTheDocument();
  });

  it("shows tabs instead of a title", async () => {
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    expect(await screen.findByTestId("history-tab")).toBeInTheDocument();
    expect(screen.getByTestId("favorites-tab")).toBeInTheDocument();
    expect(screen.getByTestId("daily-tab")).toBeInTheDocument();
    expect(screen.queryByText("播放历史")).not.toBeInTheDocument();
  });

  it("shows empty state when there is no history", async () => {
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("history-empty")).toBeInTheDocument();
    });
  });

  it("shows favorites empty state on the favorites tab", async () => {
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-empty");
    await act(async () => {
      fireEvent.click(screen.getByTestId("favorites-tab"));
    });
    expect(await screen.findByTestId("favorites-empty")).toBeInTheDocument();
  });

  it("shows daily empty state on the daily tab", async () => {
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-empty");
    await act(async () => {
      fireEvent.click(screen.getByTestId("daily-tab"));
    });
    expect(await screen.findByTestId("daily-empty")).toBeInTheDocument();
    expect(screen.getByTestId("daily-generate")).toBeInTheDocument();
  });

  it("manual generate force-runs today and opens the sheet", async () => {
    vi.mocked(runDaily).mockResolvedValue({
      dayKey: "2026-08-11",
      html: "<html><body class='daily-letter daily-letter-v2'><h1>手搓</h1></body></html>",
      sparse: false,
      created: true,
    });
    vi.mocked(listDailySnapshots)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          day_key: "2026-08-11",
          html: "<html><body class='daily-letter daily-letter-v2'><h1>手搓</h1></body></html>",
          turn_count: 1,
          event_count: 4,
          fallback: 0,
          created_at: Date.now(),
        },
      ]);
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await act(async () => {
      fireEvent.click(await screen.findByTestId("daily-tab"));
    });
    await screen.findByTestId("daily-generate");
    expect(screen.getByTestId("daily-generate")).toHaveTextContent("生成日报");
    await act(async () => {
      fireEvent.click(screen.getByTestId("daily-generate"));
    });
    await waitFor(() => {
      expect(runDaily).toHaveBeenCalledWith({
        dayKey: "2026-08-11",
        force: true,
      });
    });
    expect(await screen.findByTestId("daily-sheet")).toBeInTheDocument();
  });

  it("opens a daily snapshot in a sheet", async () => {
    vi.mocked(listDailySnapshots).mockResolvedValue([
      {
        day_key: "2026-08-10",
        html: "<html><body><h1>昨日回顾</h1></body></html>",
        turn_count: 3,
        event_count: 12,
        fallback: 0,
        created_at: Date.now(),
      },
    ]);
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await act(async () => {
      fireEvent.click(await screen.findByTestId("daily-tab"));
    });
    expect(await screen.findByTestId("daily-item-0")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("daily-item-0"));
    });
    expect(await screen.findByTestId("daily-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("daily-share")).toBeInTheDocument();
    expect(screen.getByTestId("daily-capture")).toHaveTextContent("昨日回顾");
  });

  it("lists songs with title, artist, time and emotion dot (no stored copy)", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(track);
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    expect(await screen.findByText("Nuvole Bianche")).toBeInTheDocument();
    expect(screen.getByText("Ludovico Einaudi")).toBeInTheDocument();
    expect(screen.queryByText("舒缓的旋律，陪你慢下来")).not.toBeInTheDocument();
    expect(screen.getByText("5 分钟前")).toBeInTheDocument();
    expect(screen.getByTestId("history-item-0")).toBeInTheDocument();
  });

  it("lists favorites on the favorites tab", async () => {
    vi.mocked(listFavorites).mockResolvedValue([
      { song_id: "track-1", favorited_at: Date.now() - 60_000 },
    ]);
    vi.mocked(getTrack).mockResolvedValue(track);
    vi.mocked(getFavoriteSongIds).mockResolvedValue(new Set(["track-1"]));
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await act(async () => {
      fireEvent.click(await screen.findByTestId("favorites-tab"));
    });
    expect(await screen.findByTestId("favorite-item-0")).toBeInTheDocument();
    expect(screen.getByText("Nuvole Bianche")).toBeInTheDocument();
  });

  it("toggles favorite from a history row without replaying", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(track);
    vi.mocked(toggleFavorite).mockResolvedValue({ favorited: true });
    const orc = makeStubOrchestrator();
    const onFavoriteChange = vi.fn();
    render(
      <HistoryOverlay
        open={true}
        onClose={() => {}}
        orchestrator={orc}
        onFavoriteChange={onFavoriteChange}
      />,
    );
    const fav = await screen.findByTestId("history-fav-0");
    await act(async () => {
      fireEvent.click(fav);
    });
    expect(toggleFavorite).toHaveBeenCalledWith("track-1");
    expect(orc.onReplaySong).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onFavoriteChange).toHaveBeenCalledWith("track-1", true),
    );
  });

  it("falls back when the song is no longer in the library", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(null);
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    expect(await screen.findByText("（歌曲已不在库中）")).toBeInTheDocument();
  });

  it("replays via orchestrator without passing stored rationale, then closes", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(track);
    const orc = makeStubOrchestrator();
    const onClose = vi.fn();
    render(<HistoryOverlay open={true} onClose={onClose} orchestrator={orc} />);
    const card = await screen.findByTestId("history-item-0");
    await act(async () => {
      fireEvent.click(card);
    });
    expect(orc.onReplaySong).toHaveBeenCalledWith(
      track,
      "",
      turn.current_emotion,
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("closes on backdrop click and has no close button", async () => {
    const onClose = vi.fn();
    render(
      <HistoryOverlay open={true} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-empty");
    expect(screen.queryByTestId("history-close")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("history-backdrop"));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("closes when dragged down past the threshold", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(track);
    const onClose = vi.fn();
    render(
      <HistoryOverlay open={true} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByText("Nuvole Bianche");
    const sheet = screen.getByTestId("history-overlay");
    const pointer = (type: string, clientY?: number) =>
      new MouseEvent(type, { bubbles: true, clientY });
    await act(async () => {
      fireEvent(sheet, pointer("pointerdown", 100));
    });
    await act(async () => {
      fireEvent(window, pointer("pointermove", 600));
    });
    await act(async () => {
      fireEvent(window, pointer("pointerup"));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("releases the full-screen overlay after closing and can be opened again", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <HistoryOverlay open={false} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    expect(screen.queryByTestId("history-overlay")).not.toBeInTheDocument();

    rerender(
      <HistoryOverlay open={true} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-overlay");
    expect(screen.getByTestId("history-overlay")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("history-backdrop"));
    });
    rerender(
      <HistoryOverlay open={false} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("history-overlay")).not.toBeInTheDocument();
    });

    rerender(
      <HistoryOverlay open={true} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-overlay");
    expect(screen.getByTestId("history-overlay")).toBeInTheDocument();
  });
});

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000;
  it("formats just now / minutes / hours / yesterday / days / date", () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe("刚刚");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe("3 小时前");
    expect(formatRelativeTime(now - 26 * 60 * 60_000, now)).toBe("昨天");
    expect(formatRelativeTime(now - 5 * 24 * 60 * 60_000, now)).toBe("5 天前");
    const d = new Date(now - 45 * 24 * 60 * 60_000);
    expect(formatRelativeTime(now - 45 * 24 * 60 * 60_000, now)).toBe(
      `${d.getMonth() + 1}月${d.getDate()}日`,
    );
  });
});
