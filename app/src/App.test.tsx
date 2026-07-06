import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the Lyra title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: /lyra/i })).toBeInTheDocument();
  });

  it("renders the English tagline", () => {
    render(<App />);
    expect(screen.getByText(/between the things you say/i)).toBeInTheDocument();
  });

  it("renders the Chinese tagline", () => {
    render(<App />);
    expect(screen.getByText("未成曲调先有情。")).toBeInTheDocument();
  });
});
