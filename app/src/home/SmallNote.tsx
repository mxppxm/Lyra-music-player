import { useEffect, useState } from "react";

export type SmallNoteProps = {
  text: string;
  ellipsizeAt?: number;
  autoCollapseMs?: number;
};

export function SmallNote({
  text,
  ellipsizeAt = 40,
  autoCollapseMs = 8_000,
}: SmallNoteProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const id = setTimeout(() => setExpanded(false), autoCollapseMs);
    return () => clearTimeout(id);
  }, [expanded, autoCollapseMs]);

  const isLong = text.length > ellipsizeAt;
  const display = !isLong || expanded ? text : text.slice(0, ellipsizeAt) + "…";

  return (
    <div
      data-testid="small-note"
      onClick={() => isLong && setExpanded((e) => !e)}
      style={{
        color: "var(--lyra-color-small-note)",
        fontSize: "var(--lyra-note-font-size)",
        fontFamily: "var(--lyra-note-family)",
        fontStyle: "italic",
        textAlign: "center",
        maxWidth: "var(--lyra-cover-size)",
        cursor: isLong ? "pointer" : "default",
        transition: "var(--lyra-transition-note-height)",
        whiteSpace: "pre-wrap",
        userSelect: "none",
      }}
    >
      {display}
    </div>
  );
}
