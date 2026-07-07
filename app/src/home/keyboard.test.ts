import { describe, it, expect, vi } from "vitest";
import { bindGlobalKeys, isMetaEqual, isMetaShiftR, isPlainSpace } from "./keyboard";

describe("keyboard predicates", () => {
  it("isPlainSpace detects unmodified space", () => {
    expect(isPlainSpace(new KeyboardEvent("keydown", { key: " " }))).toBe(true);
    expect(isPlainSpace(new KeyboardEvent("keydown", { key: " ", metaKey: true }))).toBe(false);
  });

  it("isMetaEqual detects Cmd+= on mac and Ctrl+= elsewhere", () => {
    expect(isMetaEqual(new KeyboardEvent("keydown", { key: "=", metaKey: true }))).toBe(true);
    expect(isMetaEqual(new KeyboardEvent("keydown", { key: "=", ctrlKey: true }))).toBe(true);
    expect(isMetaEqual(new KeyboardEvent("keydown", { key: "=" }))).toBe(false);
  });

  it("isMetaShiftR detects Cmd+Shift+R (lowercase and uppercase key)", () => {
    expect(isMetaShiftR(new KeyboardEvent("keydown", { key: "R", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isMetaShiftR(new KeyboardEvent("keydown", { key: "r", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isMetaShiftR(new KeyboardEvent("keydown", { key: "r", metaKey: true }))).toBe(false);
    expect(isMetaShiftR(new KeyboardEvent("keydown", { key: "r", shiftKey: true }))).toBe(false);
    expect(isMetaShiftR(new KeyboardEvent("keydown", { key: "t", metaKey: true, shiftKey: true }))).toBe(false);
  });
});

describe("bindGlobalKeys", () => {
  it("invokes onOpenSettings on Cmd+=", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", metaKey: true }));
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
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", metaKey: true }));
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("invokes onReflectNow on Cmd+Shift+R", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const onReflectNow = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback, onReflectNow });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "R", metaKey: true, shiftKey: true }));
    expect(onReflectNow).toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(onTogglePlayback).not.toHaveBeenCalled();
    off();
  });

  it("does not throw when onReflectNow is omitted and Cmd+Shift+R is pressed", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback });
    expect(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "R", metaKey: true, shiftKey: true }));
    }).not.toThrow();
    off();
  });

  it("Cmd+Shift+R does not trigger onTogglePlayback or onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    const onTogglePlayback = vi.fn();
    const onReflectNow = vi.fn();
    const off = bindGlobalKeys({ onOpenSettings, onTogglePlayback, onReflectNow });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", ctrlKey: true, shiftKey: true }));
    expect(onTogglePlayback).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
    off();
  });
});
