import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerControls } from "./PlayerControls";

const baseProps = {
  canControl: true,
  paused: false,
  onTogglePlay: vi.fn(),
  onSkip: vi.fn(),
  onHistory: vi.fn(),
  onFavorite: vi.fn(),
};

describe("PlayerControls history / favorite layout", () => {
  it("puts history on the left and favorite on the right", () => {
    render(<PlayerControls {...baseProps} />);
    const history = screen.getByTestId("history-open-btn");
    const favorite = screen.getByTestId("favorite-btn");
    expect(history).toBeInTheDocument();
    expect(favorite).toBeInTheDocument();
    expect(history.compareDocumentPosition(favorite)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("does not render a share button in the control bar", () => {
    render(<PlayerControls {...baseProps} />);
    expect(screen.queryByTestId("share-btn")).not.toBeInTheDocument();
  });

  it("triggers onFavorite when clicked", () => {
    render(<PlayerControls {...baseProps} />);
    fireEvent.click(screen.getByTestId("favorite-btn"));
    expect(baseProps.onFavorite).toHaveBeenCalledTimes(1);
  });

  it("marks the favorite button pressed when favorited without red chrome class variants", () => {
    render(<PlayerControls {...baseProps} favorited />);
    const btn = screen.getByTestId("favorite-btn");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveClass("lyra-mobile-player-controls__favorite--on");
  });

  it("disables favorite when playback is unavailable", () => {
    render(<PlayerControls {...baseProps} canControl={false} />);
    expect(screen.getByTestId("favorite-btn")).toBeDisabled();
  });

  it("does not render favorite when no onFavorite handler is provided", () => {
    render(<PlayerControls {...baseProps} onFavorite={undefined} />);
    expect(screen.queryByTestId("favorite-btn")).not.toBeInTheDocument();
  });
});

describe("PlayerControls previous / skip gates", () => {
  it("enables previous when canGoPrevious and onPrevious are set", () => {
    const onPrevious = vi.fn();
    render(
      <PlayerControls
        {...baseProps}
        canGoPrevious
        onPrevious={onPrevious}
      />,
    );
    const prev = screen.getByTestId("prev-btn");
    expect(prev).not.toBeDisabled();
    fireEvent.click(prev);
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("disables skip when canSkip is false", () => {
    render(<PlayerControls {...baseProps} canSkip={false} />);
    expect(screen.getByTestId("skip-btn")).toBeDisabled();
  });
});
