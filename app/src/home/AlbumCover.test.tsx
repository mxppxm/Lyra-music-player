import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumCover } from "./AlbumCover";

describe("AlbumCover", () => {
  it("renders an img when coverUrl is provided", () => {
    render(<AlbumCover coverUrl="/covers/a.jpg" alt="Nuvole Bianche cover" />);
    const img = screen.getByRole("img", { name: /nuvole bianche/i });
    expect(img).toHaveAttribute("src", "/covers/a.jpg");
  });

  it("renders a placeholder div when coverUrl is null", () => {
    render(<AlbumCover coverUrl={null} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("album-cover-placeholder")).toBeInTheDocument();
  });

  it("applies the design-token size and radius", () => {
    render(<AlbumCover coverUrl="/x.jpg" />);
    const box = screen.getByTestId("album-cover-frame");
    expect(box.style.width).toBe("var(--lyra-cover-size)");
    expect(box.style.height).toBe("var(--lyra-cover-size)");
    expect(box.style.borderRadius).toBe("var(--lyra-cover-radius)");
  });
});
