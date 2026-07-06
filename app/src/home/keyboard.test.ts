import { describe, it, expect, vi } from "vitest";
import { bindGlobalKeys, isMetaComma, isPlainSpace } from "./keyboard";

describe("keyboard predicates", () => {
  it("isPlainSpace detects unmodified space", () => {
    expect(isPlainSpace(new KeyboardEvent("keydown", { key: " " }))).toBe(true);
    expect(isPlainSpace(new KeyboardEvent("keydown", { key: " ", metaKey: true }))).toBe(false);
  });

  it("isMetaComma detects Cmd+, on mac and Ctrl+, elsewhere", () => {
    expect(isMetaComma(new KeyboardEvent("keydown", { key: ",", metaKey: true }))).toBe(true);
    expect(isMetaComma(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }))).toBe(true);
    expect(isMetaComma(new KeyboardEvent("keydown", { key: "," }))).toBe(false);
  });
});

describe("bindGlobalKeys", () => {
  it("invokes onOpenSettings on Cmd+,", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", metaKey: true }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(onTogglePlayback).not.toHaveBeenCalled();
    off();
  });

  it("invokes onTogglePlayback on plain Space", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(onTogglePlayback).toHaveBeenCalled();
    off();
  });

  it("ignores Space when focus is in an input element", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(onTogglePlayback).not.toHaveBeenCalled();
    document.body.removeChild(input);
    off();
  });

  it("returns a function that unbinds", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback });
    off();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", metaKey: true }));
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
});
