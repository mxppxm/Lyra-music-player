// Boundary map: path → zone (green / yellow / red)
// Red paths are NEVER inserted into roadmap — rejected at ingest.

export type ZoneResolution = {
  zone: "green" | "yellow" | "red";
  reason: string;
};

const GREEN_PATTERNS: RegExp[] = [
  /^agents\/.*\/prompts\//,
  /^themes\//,
  /^scripts\/scrapers\//,
  /^plugins\//,
  /^content\//,
  /^docs\/generated\//,
];

const RED_PATTERNS: RegExp[] = [
  /^src\/audio\//,
  /^src\/security\//,
  /^src\/engineer\//, // engineer cannot rewrite itself
  /\.env/,
  /^config\/secrets\//,
];

export function resolveZone(path: string): ZoneResolution {
  for (const pat of RED_PATTERNS) {
    if (pat.test(path)) {
      return { zone: "red", reason: `matches red pattern ${pat.source}` };
    }
  }
  for (const pat of GREEN_PATTERNS) {
    if (pat.test(path)) {
      return { zone: "green", reason: `matches green pattern ${pat.source}` };
    }
  }
  return { zone: "yellow", reason: "no explicit pattern — default yellow" };
}

export function partitionByZone(paths: string[]): {
  green: string[];
  yellow: string[];
  red: string[];
} {
  const green: string[] = [];
  const yellow: string[] = [];
  const red: string[] = [];
  for (const p of paths) {
    const { zone } = resolveZone(p);
    if (zone === "green") green.push(p);
    else if (zone === "yellow") yellow.push(p);
    else red.push(p);
  }
  return { green, yellow, red };
}
