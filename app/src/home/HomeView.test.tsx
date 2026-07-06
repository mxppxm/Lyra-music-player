import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeView } from "./HomeView";

describe("HomeView", () => {
  it("renders the ambient surface, cover, band, song info, note, and input", () => {
    render(<HomeView onOpenSettings={() => {}} />);
    expect(screen.getByTestId("ambient-surface")).toBeInTheDocument();
    expect(screen.getByTestId("album-cover-frame")).toBeInTheDocument();
    expect(screen.getByTestId("emotion-light-band")).toBeInTheDocument();
    expect(screen.getByTestId("song-info")).toBeInTheDocument();
    expect(screen.getByTestId("small-note")).toBeInTheDocument();
    expect(screen.getByTestId("lyra-input")).toBeInTheDocument();
  });

  it("displays fake song info from fakeData", () => {
    render(<HomeView onOpenSettings={() => {}} />);
    expect(screen.getByText(/Nuvole Bianche/)).toBeInTheDocument();
    expect(screen.getByText(/Ludovico Einaudi/)).toBeInTheDocument();
  });
});
