import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HistoryOverlay, formatRelativeTime } from "./HistoryOverlay";
import type { Orchestrator } from "@lyra/core";

vi.mock("@lyra/core/db/repo/turnRepo", () => ({
  listRecentTurns: vi.fn(),
}));

vi.mock("@lyra/core/db/repo/libraryRepo", () => ({
  getTrack: vi.fn(),
}));

import { listRecentTurns } from "@lyra/core/db/repo/turnRepo";
import { getTrack } from "@lyra/core/db/repo/libraryRepo";

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

  it("shows empty state when there is no history", async () => {
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("history-empty")).toBeInTheDocument();
    });
  });

  it("lists songs with rationale, time and emotion dot", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(track);
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    expect(await screen.findByText("Nuvole Bianche")).toBeInTheDocument();
    expect(screen.getByText("Ludovico Einaudi")).toBeInTheDocument();
    expect(screen.getByText("舒缓的旋律，陪你慢下来")).toBeInTheDocument();
    expect(screen.getByText("5 分钟前")).toBeInTheDocument();
    expect(screen.getByTestId("history-item-0")).toBeInTheDocument();
  });

  it("falls back when the song is no longer in the library", async () => {
    vi.mocked(listRecentTurns).mockResolvedValue([turn]);
    vi.mocked(getTrack).mockResolvedValue(null);
    render(
      <HistoryOverlay open={true} onClose={() => {}} orchestrator={makeStubOrchestrator()} />,
    );
    expect(await screen.findByText("（歌曲已不在库中）")).toBeInTheDocument();
  });

  it("replays the song through the orchestrator when card is clicked and closes", async () => {
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
      turn.agent_response.rationale,
      turn.current_emotion,
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("closes on backdrop click", async () => {
    const onClose = vi.fn();
    render(
      <HistoryOverlay open={true} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-empty");
    await act(async () => {
      fireEvent.click(screen.getByTestId("history-backdrop"));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("closes on the close button", async () => {
    const onClose = vi.fn();
    render(
      <HistoryOverlay open={true} onClose={onClose} orchestrator={makeStubOrchestrator()} />,
    );
    await screen.findByTestId("history-empty");
    await act(async () => {
      fireEvent.click(screen.getByTestId("history-close"));
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
    // jsdom's fireEvent.pointerDown drops clientY, so construct pointer events
    // with explicit coordinates to exercise the manual-drag close path.
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