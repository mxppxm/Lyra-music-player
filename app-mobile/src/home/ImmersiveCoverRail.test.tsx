import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImmersiveCoverRail } from "./ImmersiveCoverRail";

describe("ImmersiveCoverRail", () => {
  it("exposes the inner swipe track for frame-coalesced transforms", () => {
    const trackRef = createRef<HTMLDivElement>();

    render(
      <ImmersiveCoverRail
        previous={null}
        current={{
          songId: "current",
          coverUrl: "https://example.com/current.jpg",
        }}
        next={null}
        cd={false}
        flipTransform="none"
        stride={328}
        spinning
        trackRef={trackRef}
      />,
    );

    expect(trackRef.current).toBe(
      screen.getByTestId("cover-rail-swipe-track"),
    );
  });

  it("pre-mounts previous and next slides throughout immersive mode", () => {
    render(
      <ImmersiveCoverRail
        previous={{
          songId: "previous",
          coverUrl: "https://example.com/previous.jpg",
        }}
        current={{
          songId: "current",
          coverUrl: "https://example.com/current.jpg",
        }}
        next={{
          songId: "next",
          coverUrl: "https://example.com/next.jpg",
        }}
        cd
        flipTransform="none"
        stride={328}
        spinning={false}
      />,
    );

    expect(screen.getAllByTestId("cover-art")).toHaveLength(3);
  });

  it("shows a thinking page when no next song is ready", () => {
    render(
      <ImmersiveCoverRail
        previous={null}
        current={{
          songId: "current",
          coverUrl: "https://example.com/current.jpg",
        }}
        next={null}
        cd
        flipTransform="none"
        stride={328}
        spinning={false}
      />,
    );

    expect(screen.getByTestId("cover-rail-thinking")).toBeInTheDocument();
    expect(screen.getByText("稍等", { exact: false })).toBeInTheDocument();
  });

  it("centers the thinking page when the live current song is temporarily empty", () => {
    render(
      <ImmersiveCoverRail
        previous={null}
        current={null}
        next={null}
        cd
        flipTransform="none"
        stride={328}
        spinning={false}
      />,
    );

    expect(screen.getByTestId("cover-rail-thinking")).toHaveClass(
      "lyra-mobile-cover-rail__slot--current",
    );
  });

  it("treats the committed neighbor as the live page during a handoff", () => {
    const { container } = render(
      <ImmersiveCoverRail
        previous={null}
        current={{
          songId: "current",
          coverUrl: "https://example.com/current.jpg",
        }}
        next={{
          songId: "next",
          coverUrl: "https://example.com/next.jpg",
        }}
        cd
        centeredRole="next"
        flipTransform="none"
        stride={328}
        spinning
      />,
    );

    const centered = container.querySelector(
      ".lyra-mobile-cover-rail__slot--next",
    );
    const leaving = container.querySelector(
      ".lyra-mobile-cover-rail__slot--current",
    );
    expect(centered).toHaveAttribute("aria-hidden", "false");
    expect(leaving).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the prefetched cover instance when it becomes current", () => {
    const { container, rerender } = render(
      <ImmersiveCoverRail
        previous={null}
        current={{
          songId: "current",
          coverUrl: "https://example.com/current.jpg",
        }}
        next={{
          songId: "next",
          coverUrl: "https://example.com/next.jpg",
        }}
        cd
        flipTransform="none"
        stride={328}
        spinning={false}
      />,
    );
    const prefetchedImage = container.querySelector(
      'img[src="https://example.com/next.jpg"]',
    );
    expect(prefetchedImage).not.toBeNull();

    rerender(
      <ImmersiveCoverRail
        previous={{
          songId: "current",
          coverUrl: "https://example.com/current.jpg",
        }}
        current={{
          songId: "next",
          coverUrl: "https://example.com/next.jpg",
        }}
        next={null}
        cd
        flipTransform="none"
        stride={328}
        spinning
      />,
    );

    expect(
      container.querySelector('img[src="https://example.com/next.jpg"]'),
    ).toBe(prefetchedImage);
  });
});
