import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./providers/boot", () => ({
  bootProviders: vi.fn(() => Promise.resolve({ registered: [], skipped: [] })),
}));

describe("App", () => {
  it("renders the HomeView surface", () => {
    render(<App />);
    expect(screen.getByTestId("ambient-surface")).toBeInTheDocument();
  });

  it("renders the SongInfo line from fake data", () => {
    render(<App />);
    expect(screen.getByText(/Nuvole Bianche/)).toBeInTheDocument();
  });

  it("renders the input placeholder", () => {
    render(<App />);
    expect(screen.getByPlaceholderText("和 Lyra 说点什么…")).toBeInTheDocument();
  });
});
