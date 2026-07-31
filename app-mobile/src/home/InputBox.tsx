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

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      const text = value.trim();
      if (!text) return;
      onSubmit(text);
      setValue("");
    },
    [disabled, onSubmit, value],
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
        rows={2}
        className="lyra-mobile-input"
      />
      <button
        type="button"
        className="lyra-mobile-send-btn"
        disabled={disabled || !value.trim()}
        onClick={() => {
          const text = value.trim();
          if (!text) return;
          onSubmit(text);
          setValue("");
        }}
      >
        发送
      </button>
    </div>
  );
}
