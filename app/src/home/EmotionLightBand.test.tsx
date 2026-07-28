import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmotionLightBand } from "./EmotionLightBand";

describe("EmotionLightBand", () => {
  it("renders an SVG with viewBox 0 0 400 32", () => {
    render(<EmotionLightBand samples={[]} />);
    const svg = screen.getByTestId("emotion-light-band");
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 32");
  });

  it("renders no hairline when samples are empty (layout placeholder only)", () => {
    render(<EmotionLightBand samples={[]} />);
    expect(screen.queryByTestId("emotion-band-hairline")).toBeNull();
    expect(screen.queryByTestId("emotion-band-sample-0")).toBeNull();
    expect(screen.getByTestId("emotion-light-band")).toBeInTheDocument();
  });

  it("renders one path/rect per sample, up to 20", () => {
    const samples = Array.from({ length: 25 }, (_, i) => ({
      p: (i % 3) * 0.3 - 0.3,
      a: 0.4,
      d: 0.1,
    }));
    render(<EmotionLightBand samples={samples} />);
    const first = screen.getByTestId("emotion-band-sample-0");
    const last = screen.queryByTestId("emotion-band-sample-19");
    const over = screen.queryByTestId("emotion-band-sample-20");
    expect(first).toBeInTheDocument();
    expect(last).toBeInTheDocument();
    expect(over).toBeNull();
  });
});
