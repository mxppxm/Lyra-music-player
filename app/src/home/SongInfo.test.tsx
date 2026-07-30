import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SongInfo } from "./SongInfo";

describe("SongInfo", () => {
  it("renders title wrapped in 《》 and artist joined by middle dot", () => {
    render(<SongInfo title="Nuvole Bianche" artist="Ludovico Einaudi" />);
    expect(
      screen.getByText("《Nuvole Bianche》 · Ludovico Einaudi"),
    ).toBeInTheDocument();
  });

  it("uses the song-info CSS class for styling", () => {
    render(<SongInfo title="a" artist="b" />);
    const node = screen.getByTestId("song-info");
    expect(node.className).toContain("lyra-song-info");
  });
});
