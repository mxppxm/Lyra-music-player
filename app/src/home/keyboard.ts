export type KeyboardHandlers = {
  onTogglePlayback: () => void;
  onOpenSettings: () => void;
  onSkipNext?: () => void;
  onReflectNow?: () => void;
  onOpenRoadmap?: () => void;
  onOpenDataExplorer?: () => void;
};

export function isPlainSpace(e: KeyboardEvent): boolean {
  return e.key === " " && !e.metaKey && !e.ctrlKey && !e.altKey;
}

export function isMetaEqual(e: KeyboardEvent): boolean {
  return e.key === "=" && (e.metaKey || e.ctrlKey);
}

export function isMetaShiftR(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R");
}

export function isMetaShiftE(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "e" || e.key === "E");
}

export function isMetaShiftD(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "d" || e.key === "D");
}

export function isMetaArrowRight(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.key === "ArrowRight";
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
    if (isMetaEqual(e)) {
      e.preventDefault();
      h.onOpenSettings();
      return;
    }
    if (isMetaShiftR(e)) {
      e.preventDefault();
      h.onReflectNow?.();
      return;
    }
    if (isMetaShiftE(e)) {
      e.preventDefault();
      h.onOpenRoadmap?.();
      return;
    }
    if (isMetaShiftD(e)) {
      e.preventDefault();
      h.onOpenDataExplorer?.();
      return;
    }
    if (isMetaArrowRight(e)) {
      e.preventDefault();
      h.onSkipNext?.();
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
