import { useState, useCallback, useRef } from "react";

const MOOD_PLACEHOLDER = "和 Lyra 说点什么…";
const SONG_PLACEHOLDER = "输入歌名…";

export type InputSubmitMode = "mood" | "song";

export type InputBoxProps = {
  placeholder?: string;
  onSubmit: (text: string, mode: InputSubmitMode) => void;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function InputBox({
  placeholder,
  onSubmit,
  disabled = false,
  onFocus,
  onBlur,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<InputSubmitMode>("mood");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resolvedPlaceholder =
    placeholder ?? (mode === "song" ? SONG_PLACEHOLDER : MOOD_PLACEHOLDER);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text, mode);
    setValue("");
    // iOS keeps the soft keyboard up as long as the textarea holds focus —
    // tapping the send button doesn't blur it on its own.
    ref.current?.blur();
  }, [onSubmit, value, mode]);

  const handleModePointer = useCallback(
    (next: InputSubmitMode) => {
      if (disabled) return;
      if (next === mode) {
        submit();
        return;
      }
      setMode(next);
    },
    [disabled, mode, submit],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      // Enter also commits an IME candidate (拼音/日本語); submitting there
      // would eat the word the user was still composing.
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      e.preventDefault();
      submit();
    },
    [disabled, submit],
  );

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div
      className={[
        "lyra-mobile-input-wrap",
        mode === "song" ? "lyra-mobile-input-wrap--song" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="input-box"
      data-mode={mode}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        rows={1}
        enterKeyHint="send"
        className="lyra-mobile-input"
      />
      <div
        className="lyra-mobile-mode-seg"
        role="group"
        aria-label="发送模式"
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
