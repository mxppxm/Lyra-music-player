import { useState, useCallback } from "react";

const DEFAULT_PLACEHOLDER = "和 Lyra 说点什么…";

export type InputBoxProps = {
  placeholder?: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

export function InputBox({
  placeholder = DEFAULT_PLACEHOLDER,
  onSubmit,
  disabled = false,
}: InputBoxProps) {
  const [value, setValue] = useState("");

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
    [value, onSubmit, disabled],
  );

  return (
    <textarea
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
        boxShadow: "0 1px 0 0 rgba(0,0,0,0.05)",
        display: "block",
      }}
    />
  );
}
