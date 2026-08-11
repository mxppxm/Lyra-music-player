// Capture a DOM node as PNG and open the system share sheet (iOS-friendly).
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { toPng } from "html-to-image";

export type ShareDailyImageResult =
  | { ok: true; via: "share" | "download" }
  | { ok: false; reason: string };

function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  if (i < 0) throw new Error("bad data url");
  return dataUrl.slice(i + 1);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",", 2);
  if (!header || data == null) throw new Error("bad data url");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function shareViaCapacitor(
  dataUrl: string,
  filename: string,
  dayKey: string,
): Promise<void> {
  const path = filename;
  await Filesystem.writeFile({
    path,
    data: dataUrlToBase64(dataUrl),
    directory: Directory.Cache,
  });
  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  });
  await Share.share({
    title: `Lyra 日报 · ${dayKey}`,
    text: `Lyra 日报 · ${dayKey}`,
    url: uri,
    dialogTitle: "分享日报",
  });
}

async function shareViaWebShare(
  dataUrl: string,
  filename: string,
  dayKey: string,
): Promise<"share" | "download"> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], filename, { type: "image/png" });
  const title = `Lyra 日报 · ${dayKey}`;
  const payload = {
    files: [file],
    title,
    text: title,
  };

  if (typeof navigator.share === "function") {
    // Prefer files when the WebView allows them (Capacitor https scheme often does).
    const canFiles =
      typeof navigator.canShare !== "function" ||
      navigator.canShare({ files: [file] });
    if (canFiles) {
      await navigator.share(payload);
      return "share";
    }
    // Text-only share still surfaces the system sheet (same as track share).
    try {
      await navigator.share({ title, text: title });
      return "share";
    } catch {
      // fall through
    }
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "download";
}

async function captureNode(el: HTMLElement): Promise<string> {
  const width = Math.max(el.scrollWidth, el.clientWidth, 1);
  const height = Math.max(el.scrollHeight, el.clientHeight, 1);
  if (width < 8 || height < 8) {
    throw new Error(`capture size too small (${width}x${height})`);
  }
  // Wait a frame so layout/fonts settle before rasterizing.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  return toPng(el, {
    cacheBust: true,
    pixelRatio: Math.min(2, window.devicePixelRatio || 2),
    backgroundColor: "#f3ebe0",
    width,
    height,
    style: {
      height: `${height}px`,
      width: `${width}px`,
      overflow: "visible",
      // Avoid external webfont embedding failures in WKWebView.
      fontFamily: '"Songti SC", "Songti TC", Georgia, serif',
    },
    filter: (node) => {
      // Skip link/script; keep style — it scopes daily letter look.
      if (node instanceof HTMLElement) {
        const tag = node.tagName;
        if (tag === "SCRIPT" || tag === "LINK") return false;
      }
      return true;
    },
  });
}

/**
 * Rasterize `el` and share as PNG.
 * Native iOS: Capacitor Share (file URI) when the plugin is linked;
 * otherwise Web Share / download fallback (same family as track share).
 */
export async function shareDailyImage(
  el: HTMLElement,
  dayKey: string,
): Promise<ShareDailyImageResult> {
  const filename = `lyra-daily-${dayKey}.png`;
  try {
    const dataUrl = await captureNode(el);
    if (!dataUrl || dataUrl.length < 32) {
      return { ok: false, reason: "capture empty" };
    }

    if (Capacitor.isNativePlatform()) {
      const shareAvailable =
        typeof Capacitor.isPluginAvailable === "function"
          ? Capacitor.isPluginAvailable("Share")
          : true;
      if (shareAvailable) {
        try {
          await shareViaCapacitor(dataUrl, filename, dayKey);
          return { ok: true, via: "share" };
        } catch (err) {
          console.warn(
            "[lyra-ios] Share plugin failed, falling back to Web Share:",
            err instanceof Error ? err.message : err,
          );
        }
      }
      const via = await shareViaWebShare(dataUrl, filename, dayKey);
      // WKWebView download clicks are usually no-ops — treat as failure so UI alerts.
      if (via === "download") {
        return {
          ok: false,
          reason: "share unavailable (plugin not linked; download unsupported)",
        };
      }
      return { ok: true, via };
    }

    const via = await shareViaWebShare(dataUrl, filename, dayKey);
    return { ok: true, via };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "cancelled" };
    }
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[lyra-ios] shareDailyImage:", reason);
    return { ok: false, reason };
  }
}
