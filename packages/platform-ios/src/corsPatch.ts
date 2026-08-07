import { Capacitor, CapacitorHttp } from "@capacitor/core";

/**
 * Gateways that don't answer CORS preflight, so WKWebView `fetch` dies with
 * "TypeError: Load failed" before the request ever leaves the webview.
 * CapacitorHttp runs through the native URLSession, which is not bound by
 * CORS — so we route these endpoints through it.
 *
 * Patched gateways:
 *  - fxb gateway (https://fxb.supa.net.cn:6443): returns 405 for OPTIONS.
 *    Retired as primary (37% of requests hung 50s+), kept as a fallback.
 *  - SenseNova gateway (https://token.sensenova.cn): returns 404 for OPTIONS
 *    (even though it echoes `Access-Control-Allow-Origin: capacitor://localhost`,
 *    a 404 status still fails the browser's preflight check).
 * Safari navigation and curl (no Origin) work for both — only CORS is broken.
 *
 * Only patches on the iOS native platform:
 *  - on web, CapacitorHttp's web implementation calls `fetch` internally,
 *    which would recurse into this very patch (infinite loop);
 *  - on Tauri/Electron the platform-ios code is never loaded.
 */
const FXB_PREFIX = "https://fxb.supa.net.cn:6443/";
const SENSENOVA_PREFIX = "https://token.sensenova.cn/";

// Keep in sync with provider TIMEOUT_MS:
//  - FxbProvider: 45s (packages/core/src/providers/fxb.ts) — flaky gateway,
//    slow tail measured at 16s+;
//  - SensenovaProvider: 40s (packages/core/src/providers/sensenova.ts) —
//    generous safety margin for the free reasoning model when it's slow.
const NATIVE_TIMEOUT_MS = 45_000;
const SENSENOVA_TIMEOUT_MS = 20_000;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function toRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers) as Record<string, string>;
  }
  return headers as Record<string, string>;
}

function timeoutFor(url: string): number {
  return url.startsWith(SENSENOVA_PREFIX) ? SENSENOVA_TIMEOUT_MS : NATIVE_TIMEOUT_MS;
}

export function patchFetchForCors(): void {
  if (Capacitor.getPlatform() !== "ios") return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;

  const origFetch = window.fetch.bind(window);
  window.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = requestUrl(input);
    if (url.startsWith(FXB_PREFIX) || url.startsWith(SENSENOVA_PREFIX)) {
      let body: unknown;
      if (init?.body != null && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = undefined;
        }
      }
      const res = await CapacitorHttp.request({
        url,
        method: init?.method ?? "GET",
        headers: toRecord(init?.headers),
        data: body,
        connectTimeout: timeoutFor(url),
        readTimeout: timeoutFor(url),
      });
      const payload =
        res.data === undefined || res.data === null
          ? ""
          : typeof res.data === "string"
            ? res.data
            : JSON.stringify(res.data);
      return new Response(payload, {
        status: res.status,
        headers: new Headers(res.headers),
      });
    }
    return origFetch(input, init);
  }) as typeof fetch;
}
