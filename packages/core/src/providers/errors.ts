/**
 * 429 (rate-limit) error carrying the server's retry-after hint so the
 * retry layer in agents/route.ts can wait out the throttle window instead
 * of burning retries inside it.
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs?: number | null) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs ?? null;
  }
}
