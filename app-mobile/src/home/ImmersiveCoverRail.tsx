import type { PointerEvent, Ref } from "react";
import { CoverArt } from "./CoverBackground";
import type { RailRole } from "./immersiveCoverMotion";

export type CoverRailSlot = {
  songId: string;
  coverUrl: string | null;
};

export type ImmersiveCoverRailProps = {
  previous: CoverRailSlot | null;
  current: CoverRailSlot | null;
  next: CoverRailSlot | null;
  /** Morph square ↔ vinyl — same CoverArt instance across immersive toggle. */
  cd: boolean;
  /**
   * Neighbors stay mounted for the whole immersive session so the track
   * behaves like a traditional previous | current | next carousel.
   */
  /** Page under the screen center — the committed neighbor mid-handoff. */
  centeredRole?: RailRole;
  /** Shared immersive FLIP translate/scale for the cover shell. */
  flipTransform: string;
  /** Horizontal swipe offset (px) — inner layer only. */
  stride: number;
  spinning: boolean;
  shiftRef?: Ref<HTMLDivElement>;
  trackRef?: Ref<HTMLDivElement>;
  onPointerDown?: (e: PointerEvent) => void;
};

type RailRenderSlot = {
  key: string;
  role: RailRole;
  cover: CoverRailSlot | null;
};

/**
 * One cover shell for playing view (never remount on immersive toggle).
 * Neighbors appear only while swiping so rest-state matches pre-swipe immersive.
 */
export function ImmersiveCoverRail({
  previous,
  current,
  next,
  cd,
  centeredRole = "current",
  flipTransform,
  stride,
  spinning,
  shiftRef,
  trackRef,
  onPointerDown,
}: ImmersiveCoverRailProps) {
  const coverSlots: RailRenderSlot[] = [];
  if (cd) {
    if (previous) {
      coverSlots.push({ key: previous.songId, role: "prev", cover: previous });
    }
    if (current) {
      coverSlots.push({ key: current.songId, role: "current", cover: current });
      coverSlots.push(
        next
          ? { key: next.songId, role: "next", cover: next }
          : { key: "thinking-next", role: "next", cover: null },
      );
    } else {
      // After the gesture safety timeout drops its snapshot, thinking state
      // has no live current song. Keep the placeholder centered until the
      // selected song arrives instead of snapping back to an empty track.
      coverSlots.push({
        key: "thinking-current",
        role: "current",
        cover: null,
      });
    }
  } else if (current) {
    coverSlots.push({ key: current.songId, role: "current", cover: current });
  }

  return (
    <div
      ref={shiftRef}
      className="lyra-mobile-cover-shift lyra-mobile-cover-rail-wrap"
      style={{ transform: flipTransform === "none" ? undefined : flipTransform }}
      data-testid="cover-rail"
      onPointerDown={cd ? onPointerDown : undefined}
    >
      <div
        ref={trackRef}
        className="lyra-mobile-cover-rail-swipe"
        data-testid="cover-rail-swipe-track"
      >
        <div
          className={[
            "lyra-mobile-cover-rail",
            cd ? "lyra-mobile-cover-rail--neighbors" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="cover-rail-disc"
          style={
            cd
              ? { ["--rail-stride" as string]: `${stride}px` }
              : undefined
          }
        >
          {coverSlots.map((slot) => (
            <div
              key={slot.key}
              className={[
                "lyra-mobile-cover-rail__slot",
                `lyra-mobile-cover-rail__slot--${slot.role}`,
                slot.cover ? "" : "lyra-mobile-cover-rail__slot--thinking",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden={slot.role !== centeredRole}
              data-testid={
                slot.cover ? undefined : "cover-rail-thinking"
              }
            >
              {slot.cover ? (
                <CoverArt
                  url={slot.cover.coverUrl}
                  cd={cd}
                  active={slot.role === centeredRole}
                  spinning={slot.role === centeredRole && cd && spinning}
                />
              ) : (
                <div
                  className="lyra-mobile-cover-rail__thinking"
                  role={slot.role === centeredRole ? "status" : undefined}
                  aria-label={
                    slot.role === centeredRole ? "稍等" : undefined
                  }
                >
                  稍等
                  <span className="lyra-mobile-thinking__dots" aria-hidden>
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
