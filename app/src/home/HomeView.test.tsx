import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { HomeView } from "./HomeView";
import type { Orchestrator, OrchestratorState } from "@lyra/core/turn/Orchestrator.ts";

// ── Stub orchestrator factory ─────────────────────────────────────────────────

function makeStubOrchestrator(initialState: OrchestratorState): Orchestrator {
  let _state = initialState;
  const subs = new Set<(s: OrchestratorState) => void>();
  return {
    getState: () => _state,
    subscribe: (cb: (s: OrchestratorState) => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    onUserInput: vi.fn(async () => {}),
    onListenProgress: vi.fn(),
    onSkip: vi.fn(async () => {}),
    onSongComplete: vi.fn(async () => {}),
  } as unknown as Orchestrator;
}

// ── Mock turnRepo so listRecentTurns doesn't hit real DB ──────────────────────

vi.mock("../db/repo/turnRepo", () => ({
  listRecentTurns: vi.fn(() => Promise.resolve([])),
  insertTurn: vi.fn(() => Promise.resolve()),
  updateTurn: vi.fn(() => Promise.resolve()),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("HomeView — cold boot (no orchestrator)", () => {
  it("renders Lyra hero identity and cold-boot hint", () => {
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={null} />);
    expect(screen.getByText("Lyra")).toBeInTheDocument();
    expect(screen.getByText(/Your emotional music companion/)).toBeInTheDocument();
    expect(screen.getByText(/陪你说话，替你选一首歌/)).toBeInTheDocument();
    expect(screen.getByTestId("cold-boot-hint")).toBeInTheDocument();
    expect(screen.getByText(/Lyra needs an API key to talk/)).toBeInTheDocument();
  });

  it("still renders the ambient surface in cold-boot state", () => {
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={null} />);
    expect(screen.getByTestId("ambient-surface")).toBeInTheDocument();
  });
});

describe("HomeView — idle state", () => {
  it("renders sparse idle state with slogan and input (no cover/note yet)", () => {
    const orc = makeStubOrchestrator({ kind: "idle" });
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    expect(screen.getByTestId("ambient-surface")).toBeInTheDocument();
    // Sprint 6: sparse idle shows slogan + input only, no cover/band/note
    expect(screen.getByTestId("lyra-idle-slogan")).toBeInTheDocument();
    expect(screen.getByText("让 Lyra 帮你启动")).toBeInTheDocument();
    expect(screen.getByTestId("lyra-input")).toBeInTheDocument();
    expect(screen.queryByTestId("album-cover-frame")).not.toBeInTheDocument();
    expect(screen.queryByTestId("emotion-light-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("small-note")).not.toBeInTheDocument();
  });
});

describe("HomeView — thinking state", () => {
  it("shows ellipsis note while thinking", () => {
    const orc = makeStubOrchestrator({ kind: "thinking", user_utterance: "最近有点累" });
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    expect(screen.getByTestId("small-note")).toHaveTextContent("…");
  });
});

describe("HomeView — playing state", () => {
  const playingState: OrchestratorState = {
    kind: "playing",
    turn: {
      id: "turn-1",
      timestamp: Date.now(),
      current_emotion: {
        pad: { p: 0.3, a: 0.1, d: 0.2 },
        labels: ["calm"],
        confidence: 0.8,
        source: "emotion-agent-inferred",
      },
      user_utterance: { modality: "text", content: "最近有点累" },
      agent_response: {
        song_id: "track-1",
        rationale: "舒缓的旋律，陪你慢下来",
      },
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
    },
    song: {
      id: "track-1",
      path: "/music/test.flac",
      title: "Nuvole Bianche",
      artist: "Ludovico Einaudi",
      album: undefined,
      duration_ms: undefined,
      added_at: Date.now(),
      origin: "local",
    },
  };

  it("shows real title and artist from song", () => {
    const orc = makeStubOrchestrator(playingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    const songInfo = screen.getByTestId("song-info");
    expect(songInfo.textContent).toContain("Nuvole Bianche");
    expect(songInfo.textContent).toContain("Ludovico Einaudi");
  });

  it("shows real rationale in small note", () => {
    const orc = makeStubOrchestrator(playingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    expect(screen.getByTestId("small-note")).toHaveTextContent("舒缓的旋律，陪你慢下来");
  });

  it("hides emotion light band during playback (immersive)", () => {
    const orc = makeStubOrchestrator(playingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    expect(screen.queryByTestId("emotion-light-band")).not.toBeInTheDocument();
  });
});

describe("HomeView — immersive playback across song transitions", () => {
  /** Stub orchestrator that lets the test push state changes. */
  function makeEmittingStub(initial: OrchestratorState) {
    let current = initial;
    const subs = new Set<(s: OrchestratorState) => void>();
    const orc = {
      getState: () => current,
      subscribe: (cb: (s: OrchestratorState) => void) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      onUserInput: vi.fn(async () => {}),
      onListenProgress: vi.fn(),
      onSkip: vi.fn(async () => {}),
      onSongComplete: vi.fn(async () => {}),
    } as unknown as Orchestrator;
    const emit = (s: OrchestratorState) => {
      current = s;
      for (const cb of subs) cb(s);
    };
    return { orc, emit };
  }

  const playingState: OrchestratorState = {
    kind: "playing",
    turn: {
      id: "turn-1",
      timestamp: Date.now(),
      current_emotion: {
        pad: { p: 0.3, a: 0.1, d: 0.2 },
        labels: ["calm"],
        confidence: 0.8,
        source: "emotion-agent-inferred",
      },
      user_utterance: { modality: "text", content: "最近有点累" },
      agent_response: { song_id: "track-1", rationale: "r" },
      user_reaction: {
        behavioral: { listen_duration_ms: 0, completed: false, skipped: false, repeated: 0, volume_delta: 0 },
        silence_positive: false,
      },
      emotion_delta: { p: 0, a: 0, d: 0 },
    },
    song: {
      id: "track-1",
      path: "/music/test.flac",
      title: "T",
      artist: "A",
      album: undefined,
      duration_ms: undefined,
      added_at: Date.now(),
      origin: "local",
    },
  };

  it("stays immersive through the playing → thinking song switch", () => {
    const { orc, emit } = makeEmittingStub(playingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);

    expect(screen.getByTestId("ambient-surface").className).toContain("lyra-ambient--immersive");

    act(() => emit({ kind: "thinking", user_utterance: "" }));

    expect(screen.getByTestId("ambient-surface").className).toContain("lyra-ambient--immersive");
    expect(screen.getByTestId("glass-dock-wrap").className).toContain("lyra-dock-wrap--immersive");
  });

  it("keeps emotion band hidden and song info held while thinking between songs", () => {
    const { orc, emit } = makeEmittingStub(playingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);

    expect(screen.queryByTestId("emotion-light-band")).not.toBeInTheDocument();
    expect(screen.getByTestId("song-info")).toHaveTextContent("T");

    act(() => emit({ kind: "thinking", user_utterance: "" }));

    // Normal-mode chrome must not flash back during the LLM pick-next-song gap.
    expect(screen.queryByTestId("emotion-light-band")).not.toBeInTheDocument();
    expect(screen.getByTestId("song-info")).toHaveTextContent("T");
    expect(screen.getByTestId("song-info")).toHaveTextContent("A");
  });

  it("exits immersive when the session ends in error instead of a new song", () => {
    const { orc, emit } = makeEmittingStub(playingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);

    act(() => emit({ kind: "thinking", user_utterance: "" }));
    act(() => emit({ kind: "error", message: "boom" }));

    expect(screen.getByTestId("ambient-surface").className).not.toContain("lyra-ambient--immersive");
  });
});

describe("HomeView — proactive-pending state", () => {
  const pendingState: OrchestratorState = {
    kind: "proactive-pending",
    intent: {
      id: "i1",
      createdAt: 1000,
      validUntil: 1000 + 30 * 60_000,
      kind: "morning",
      urgency: 0.5,
      hint: "早上第一次打开",
    },
    song: {
      id: "track-1",
      path: "/music/test.flac",
      title: "Nuvole Bianche",
      artist: "Ludovico Einaudi",
      album: undefined,
      duration_ms: undefined,
      added_at: Date.now(),
      origin: "local",
    },
    rationale: "早安。我想先放这首给你。",
  };

  it("shows rationale and offered song", () => {
    const orc = makeStubOrchestrator(pendingState);
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    expect(screen.getByTestId("small-note")).toHaveTextContent("早安。我想先放这首给你。");
    const songInfo = screen.getByTestId("song-info");
    expect(songInfo.textContent).toContain("Nuvole Bianche");
    expect(songInfo.textContent).toContain("Ludovico Einaudi");
  });
});

describe("HomeView — error state", () => {
  it("shows error message in small note", () => {
    const orc = makeStubOrchestrator({
      kind: "error",
      message: "B 站上暂时没搜到合适的歌，换种心情说说看？",
    });
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    expect(screen.getByTestId("small-note")).toHaveTextContent(
      "B 站上暂时没搜到合适的歌，换种心情说说看？",
    );
  });

  it("shows a calm ripple glyph alongside the error note", () => {
    const orc = makeStubOrchestrator({
      kind: "error",
      message: "连接超时",
    });
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    const note = screen.getByTestId("small-note");
    expect(note.querySelector(".lyra-small-note__glyph")).not.toBeNull();
  });

  it("keeps the note glyph-free outside the error state", () => {
    const orc = makeStubOrchestrator({
      kind: "thinking",
      user_utterance: "最近有点累",
    });
    render(<HomeView onOpenSettings={() => {}} onOpenDataExplorer={() => {}} onOpenHelp={() => {}} orchestrator={orc} />);
    const note = screen.getByTestId("small-note");
    expect(note.querySelector(".lyra-small-note__glyph")).toBeNull();
  });
});
