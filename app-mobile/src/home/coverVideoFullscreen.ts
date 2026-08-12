/** Gate for cover → portrait MV fullscreen (spec 2026-08-12). */
export function shouldEnterVideoFromCover(opts: {
  isPlayingOrPaused: boolean;
  hasCurrentCover: boolean;
  isNeighborSlot: boolean;
}): boolean {
  return opts.isPlayingOrPaused && opts.hasCurrentCover && !opts.isNeighborSlot;
}
