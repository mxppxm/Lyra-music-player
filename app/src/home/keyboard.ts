export type KeyboardHandlers = {
  onTogglePlayback: () => void;
  onOpenSettings: () => void;
};

export function isPlainSpace(e: KeyboardEvent): boolean {
  return e.key === " " && !e.metaKey && !e.ctrlKey && !e.altKey;
}

export function isMetaComma(e: KeyboardEvent): boolean {
  return e.key === "," && (e.metaKey || e.ctrlKey);
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    target.isContentEditable
  );
}

export function bindGlobalKeys(h: KeyboardHandlers): () => void {
  const handler = (e: KeyboardEvent) => {
    if (isMetaComma(e)) {
      e.preventDefault();
      h.onOpenSettings();
      return;
    }
    if (isPlainSpace(e)) {
      if (isEditingTarget(e.target)) return;
      e.preventDefault();
      h.onTogglePlayback();
      return;
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
