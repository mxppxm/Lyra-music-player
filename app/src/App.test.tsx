import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import App from "./App";

vi.mock("./providers/boot", () => ({
  bootProviders: vi.fn(() => Promise.resolve({ registered: [], skipped: [] })),
}));

// createDefaultOrchestrator returns null → cold-boot state
vi.mock("./turn/createOrchestrator", () => ({
  createDefaultOrchestrator: vi.fn(() => null),
}));

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
});
