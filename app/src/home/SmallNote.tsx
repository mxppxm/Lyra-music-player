import { useEffect, useState } from "react";

export type SmallNoteProps = {
  text: string;
  ellipsizeAt?: number;
  autoCollapseMs?: number;
  color?: string;
};

export function SmallNote({
  text,
  ellipsizeAt = 40,
  autoCollapseMs = 8_000,
  color,
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
      data-lyra-hover="small_note"
      className={`lyra-small-note${isLong ? " lyra-small-note--clickable" : ""}`}
      onClick={() => isLong && setExpanded((e) => !e)}
      style={color ? { color } : undefined}
    >
      {display}
    </div>
  );
}
