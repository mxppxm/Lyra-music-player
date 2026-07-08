import { useState, useCallback, useRef, useEffect } from "react";
import { useInputDwellBus } from "../perception/useInputDwellBus";
import { bus as perceptionBus } from "../perception/events";

const DEFAULT_PLACEHOLDER = "和 Lyra 说点什么…";

export type InputBoxProps = {
  placeholder?: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  /** Grab keyboard focus on mount. Default true — otherwise Tauri users have
   *  to click the textarea before their first keystroke registers. */
  autoFocus?: boolean;
};

export function InputBox({
  placeholder = DEFAULT_PLACEHOLDER,
  onSubmit,
  disabled = false,
  autoFocus = true,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const { notifySubmit } = useInputDwellBus(perceptionBus, value);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    // Defer to next tick so the Tauri window's initial layout / focus events
    // settle before we claim keyboard focus. Without this the OS chrome
    // sometimes wins the initial focus race and typing lands nowhere.
    const t = setTimeout(() => ref.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [autoFocus, disabled]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      const text = value.trim();
      if (!text) return;
      onSubmit(text);
      notifySubmit();
      setValue("");
    },
    [value, onSubmit, disabled, notifySubmit],
  );

  return (
    <textarea
      ref={ref}
      data-testid="lyra-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKey}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      style={{
        width: "var(--lyra-input-max-width)",
        maxWidth: 800,
        height: "var(--lyra-input-height)",
        padding: "10px 20px",
        borderRadius: "var(--lyra-input-radius)",
        border: "none",
        outline: "none",
        resize: "none",
        background: "var(--lyra-color-input-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        fontFamily: "var(--lyra-song-family)",
        fontSize: "var(--lyra-song-font-size)",
        color: "var(--lyra-color-song-info)",
        boxShadow: "0 1px 0 0 rgba(0,0,0,0.05), inset 0 0 0 1px rgba(0,0,0,0.03)",
        display: "block",
      }}
    />
  );
}
