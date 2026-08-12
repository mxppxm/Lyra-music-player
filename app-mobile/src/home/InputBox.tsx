import { useState, useCallback, useRef, useEffect } from "react";
import { lightTap } from "./immersiveStatusBar";

const MOOD_PLACEHOLDER = "和 Lyra 说点什么…";
const SONG_PLACEHOLDER = "输入歌名…";

export type InputSubmitMode = "mood" | "song";

export type InputBoxProps = {
  placeholder?: string;
  onSubmit: (text: string, mode: InputSubmitMode) => void;
  disabled?: boolean;
  /** 播放中等场景：默认矮条，点按聚焦；软键盘起来后再展开发送区。 */
  collapsible?: boolean;
  /** 软键盘已起来 —— 此时才滑出发送按钮、拉高胶囊。 */
  keyboardReady?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function InputBox({
  placeholder,
  onSubmit,
  disabled = false,
  collapsible = false,
  keyboardReady = false,
  onFocus,
  onBlur,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<InputSubmitMode>("mood");
  const [expanded, setExpanded] = useState(!collapsible);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef(value);
  const pendingFocusRef = useRef(false);
  const collapseTimerRef = useRef<number | null>(null);
  valueRef.current = value;

  const resolvedPlaceholder =
    placeholder ?? (mode === "song" ? SONG_PLACEHOLDER : MOOD_PLACEHOLDER);

  // idle: 矮提示条 → pending: 已聚焦等键盘 → composer: 键盘已起，发送区滑出
  const phase: "idle" | "pending" | "composer" = !collapsible
    ? "composer"
    : !expanded
      ? "idle"
      : keyboardReady
        ? "composer"
        : "pending";

  useEffect(() => {
    if (!collapsible) {
      setExpanded(true);
      return;
    }
    if (!valueRef.current.trim() && document.activeElement !== ref.current) {
      setExpanded(false);
    }
  }, [collapsible]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current === null) return;
    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text, mode);
    setValue("");
    ref.current?.blur();
  }, [onSubmit, value, mode]);

  const handleModePointer = useCallback(
    (next: InputSubmitMode) => {
      if (disabled) return;
      if (next === mode) {
        submit();
        return;
      }
      lightTap();
      setMode(next);
    },
    [disabled, mode, submit],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      e.preventDefault();
      submit();
    },
    [disabled, submit],
  );

  const focusInput = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.inert = false;
    el.removeAttribute("aria-hidden");
    el.tabIndex = 0;
    el.focus();
  }, []);

  const expand = useCallback(() => {
    if (disabled || phase !== "idle") return;
    lightTap();
    pendingFocusRef.current = true;
    setExpanded(true);
    focusInput();
  }, [disabled, focusInput, phase]);

  useEffect(() => {
    if (phase === "idle" || !pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    if (document.activeElement !== ref.current) {
      focusInput();
    }
  }, [focusInput, phase]);

  const handleFocus = useCallback(() => {
    clearCollapseTimer();
    if (collapsible) setExpanded(true);
    onFocus?.();
  }, [clearCollapseTimer, collapsible, onFocus]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onBlur?.();
      if (!collapsible) return;
      const next = e.relatedTarget as Node | null;
      if (next && wrapRef.current?.contains(next)) return;
      clearCollapseTimer();
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null;
        if (document.activeElement === ref.current) return;
        if (wrapRef.current?.contains(document.activeElement)) return;
        if (valueRef.current.trim()) return;
        setExpanded(false);
      }, 180);
    },
    [clearCollapseTimer, collapsible, onBlur],
  );

  const handleCollapsedKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (phase !== "idle" || disabled) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      expand();
    },
    [disabled, expand, phase],
  );

  const canSend = !disabled && value.trim().length > 0;
  const idle = phase === "idle";
  const composer = phase === "composer";
  const sendInert = !composer;

  return (
    <div
      ref={wrapRef}
      className={[
        "lyra-mobile-input-wrap",
        phase === "idle" ? "lyra-mobile-input-wrap--collapsed" : "",
        phase === "pending" ? "lyra-mobile-input-wrap--pending" : "",
        phase === "composer" && collapsible
          ? "lyra-mobile-input-wrap--composer"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="input-box"
      data-mode={mode}
      data-phase={phase}
      data-collapsed={idle ? "1" : "0"}
      role={idle ? "button" : undefined}
      tabIndex={idle && !disabled ? 0 : undefined}
      aria-label={idle ? "展开输入" : undefined}
      onClick={idle ? expand : undefined}
      onKeyDown={idle ? handleCollapsedKey : undefined}
    >
      <span className="lyra-mobile-input-collapsed-hint" aria-hidden="true">
        {MOOD_PLACEHOLDER}
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        rows={1}
        enterKeyHint="send"
        className="lyra-mobile-input"
        tabIndex={idle ? -1 : undefined}
        aria-hidden={idle || undefined}
        inert={idle || undefined}
      />
      <div
        className="lyra-mobile-mode-seg"
        role="group"
        aria-label="发送模式"
        aria-hidden={sendInert || undefined}
        data-mode={mode}
        data-can-send={canSend ? "1" : "0"}
        onClick={(e) => e.stopPropagation()}
        inert={sendInert || undefined}
      >
        <span
          className="lyra-mobile-mode-seg-thumb"
          data-mode={mode}
          aria-hidden="true"
        />
        <button
          type="button"
          className={[
            "lyra-mobile-mode-btn",
            mode === "mood" ? "lyra-mobile-mode-btn--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={mode === "mood" ? "心情发送" : "切换到心情"}
          aria-pressed={mode === "mood"}
          disabled={disabled || (mode === "mood" && !canSend)}
          onPointerDown={(e) => {
            if (mode !== "mood") e.preventDefault();
          }}
          onClick={() => handleModePointer("mood")}
        >
          <svg
            className="lyra-mobile-send-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 19V5M12 5l-6 6M12 5l6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={[
            "lyra-mobile-mode-btn",
            mode === "song" ? "lyra-mobile-mode-btn--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={mode === "song" ? "精准搜歌发送" : "切换到精准搜歌"}
          aria-pressed={mode === "song"}
          disabled={disabled || (mode === "song" && !canSend)}
          onPointerDown={(e) => {
            if (mode !== "song") e.preventDefault();
          }}
          onClick={() => handleModePointer("song")}
        >
          <svg
            className="lyra-mobile-send-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M9 18V6l10-2v12"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="7" cy="18" r="2.4" fill="currentColor" />
            <circle cx="17" cy="16" r="2.4" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
