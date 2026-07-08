export const TIME_BASE_COLORS = {
  morning: 'hsl(30, 15%, 92%)',
  forenoon: 'hsl(45, 10%, 94%)',
  afternoon: 'hsl(100, 12%, 91%)',
  dusk: 'hsl(35, 20%, 90%)',
  evening: 'hsl(28, 25%, 88%)',
  midnight: 'hsl(230, 25%, 22%)',
  predawn: 'hsl(235, 30%, 18%)',
} as const;

export const SECTION_COLORS = [
  TIME_BASE_COLORS.morning,
  TIME_BASE_COLORS.forenoon,
  TIME_BASE_COLORS.afternoon,
  TIME_BASE_COLORS.dusk,
  TIME_BASE_COLORS.midnight,
  TIME_BASE_COLORS.predawn,
  TIME_BASE_COLORS.morning,
  TIME_BASE_COLORS.morning,
] as const;

export const DARK_SECTIONS = new Set([4, 5]);
