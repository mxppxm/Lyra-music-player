import { hasBundledProviders } from "../providers/bundledKeys";

/** Release builds with keys baked in at compile time — no Settings UI. */
export function isZeroConfigRelease(): boolean {
  return import.meta.env.VITE_LYRA_ZERO_CONFIG === "true";
}

export function expectsBundledProviders(): boolean {
  return isZeroConfigRelease() || hasBundledProviders();
}
