import { useState, useCallback, useRef } from "react";

const DEFAULT_PLACEHOLDER = "和 Lyra 说点什么…";

export type InputBoxProps = {
  placeholder?: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function InputBox({
  placeholder = DEFAULT_PLACEHOLDER,
  onSubmit,
  disabled = false,
  onFocus,
  onBlur,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
    // iOS keeps the soft keyboard up as long as the textarea holds focus —
    // tapping the send button doesn't blur it on its own.
    ref.current?.blur();
  }, [onSubmit, value]);

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

  return (
    <div className="lyra-mobile-input-wrap" data-testid="input-box">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        enterKeyHint="send"
        className="lyra-mobile-input"
      />
      <button
        type="button"
        className="lyra-mobile-send-btn"
        aria-label="发送"
        disabled={disabled || !value.trim()}
        onClick={submit}
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
    </div>
  );
}
