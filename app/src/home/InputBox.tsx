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
      className="lyra-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKey}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
    />
  );
}
