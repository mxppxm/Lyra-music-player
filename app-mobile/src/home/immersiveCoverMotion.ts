export type ImmersiveCoverTransform = {
  x: number;
  y: number;
  scale: number;
};

export type CoverRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function coverTransformCss(motion: ImmersiveCoverTransform): string {
  return `translate(${motion.x}px, ${motion.y}px) scale(${motion.scale})`;
}

/**
 * Bridge for un-pinning: the transform that reproduces the pinned element's
 * on-screen rect from the flow box it falls back into. Transform origin is
 * the box center, so scaling never moves the center — the translate is a
 * plain center-to-center delta.
 */
export function bridgePinnedCoverTransform(
  visual: CoverRect,
  natural: CoverRect,
): ImmersiveCoverTransform {
  return {
    x: visual.left + visual.width / 2 - (natural.left + natural.width / 2),
    y: visual.top + visual.height / 2 - (natural.top + natural.height / 2),
    scale: visual.width / Math.max(natural.width, 1),
  };
}

export function compensateImmersiveCoverPosition(
  current: ImmersiveCoverTransform,
  rect: CoverRect,
  viewport: { width: number; height: number },
): ImmersiveCoverTransform {
  const correctionX =
    viewport.width / 2 - (rect.left + rect.width / 2);
  const correctionY =
    viewport.height / 2 - (rect.top + rect.height / 2);
  if (Math.abs(correctionX) < 0.01 && Math.abs(correctionY) < 0.01) {
    return current;
  }
  return {
    x: current.x + correctionX,
    y: current.y + correctionY,
    scale: current.scale,
  };
}

export type RailRole = "prev" | "current" | "next";

/**
 * While a committed swipe hands off, the page under the screen center is the
 * neighbor, not the data current. Motion, focus and accessibility all belong
 * to the page the user is looking at.
 */
export function centeredRailRole(
  direction: "next" | "previous" | null,
  handingOff: boolean,
): RailRole {
  if (!handingOff || direction === null) return "current";
  return direction === "next" ? "next" : "prev";
}

/**
 * Swiping onto the thinking page is a finished navigation, not a pending one:
 * the placeholder is a carousel page of its own, so the rail re-centers and
 * unlocks there instead of waiting for a song id that only arrives when
 * selection completes.
 */
export function shouldCenterThinkingPlaceholder(input: {
  pending: boolean;
  settling: boolean;
  direction: "next" | "previous" | null;
  committedNextSongId: string | null;
  currentSongId: string | null;
}): boolean {
  return (
    input.pending &&
    !input.settling &&
    input.direction === "next" &&
    input.committedNextSongId === null &&
    input.currentSongId === null
  );
}

export function shouldShowInlineThinking(
  immersive: boolean,
  isThinking: boolean,
  hasHandoff: boolean,
): boolean {
  return !immersive && isThinking && !hasHandoff;
}

/**
 * The immersive session spans playback and the selection gap between songs,
 * so both states toggle in both directions — leaving during "thinking" must
 * not strand the user outside immersive until the next song arrives.
 */
export function canToggleImmersive(stateKind: string): boolean {
  return stateKind === "playing" || stateKind === "thinking";
}
