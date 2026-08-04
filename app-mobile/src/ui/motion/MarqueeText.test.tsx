import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MarqueeText } from "./MarqueeText";

describe("MarqueeText", () => {
  it("renders its children inside the marquee track", () => {
    const text = "《A long song title》 · Some Artist";
    const { container } = render(<MarqueeText>{text}</MarqueeText>);
    expect(container.querySelector(".lyra-marquee")).not.toBeNull();
    expect(container.querySelector(".lyra-marquee__track")?.textContent).toBe(
      text,
    );
  });

  it("stays inactive when the text fits the container", () => {
    const { container } = render(<MarqueeText>title</MarqueeText>);
    expect(container.querySelector(".lyra-marquee--active")).toBeNull();
  });
});
