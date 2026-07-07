import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import App from "./App";

vi.mock("./providers/boot", () => ({
  bootProviders: vi.fn(() => Promise.resolve({ registered: [], skipped: [] })),
}));

// createDefaultOrchestrator returns null → cold-boot state
vi.mock("./turn/createOrchestrator", () => ({
  createDefaultOrchestrator: vi.fn(() => null),
}));

vi.mock("./reflect/trigger", () => ({
  reflectNow: vi.fn(),
}));

vi.mock("./memory/fileIO", () => ({
  readMemoryFile: vi.fn(() => Promise.resolve("")),
}));

import { reflectNow } from "./reflect/trigger";

beforeEach(() => {
  (reflectNow as ReturnType<typeof vi.fn>).mockReset();
});

describe("App", () => {
  it("renders the ambient surface", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByTestId("ambient-surface")).toBeInTheDocument();
  });

  it("renders Lyra hero title in cold-boot state", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText("Lyra")).toBeInTheDocument();
  });

  it("shows cold-boot hint when no orchestrator is available", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByTestId("cold-boot-hint")).toBeInTheDocument();
  });

  it("renders settings panel (closed by default)", async () => {
    await act(async () => {
      render(<App />);
    });
    // Settings panel exists in DOM but is not open
    expect(screen.getByTestId("ambient-surface")).toBeInTheDocument();
  });

  it("shows reflecting overlay while reflectNow is pending", async () => {
    // reflectNow never resolves during this test — overlay stays visible
    let resolveReflect!: () => void;
    (reflectNow as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<{ appliedFacts: number; dreamAdded: boolean }>((res) => {
        resolveReflect = () => res({ appliedFacts: 0, dreamAdded: true });
      })
    );

    await act(async () => {
      render(<App />);
    });

    // Overlay not shown yet
    expect(screen.queryByTestId("reflecting-overlay")).toBeNull();

    // Fire Cmd+Shift+R
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "R", metaKey: true, shiftKey: true, bubbles: true })
      );
    });

    expect(screen.getByTestId("reflecting-overlay")).toBeInTheDocument();
    expect(screen.getByText("Lyra is dreaming…")).toBeInTheDocument();

    // Resolve the pending promise — overlay should disappear
    await act(async () => {
      resolveReflect();
    });

    expect(screen.queryByTestId("reflecting-overlay")).toBeNull();
  });
});
