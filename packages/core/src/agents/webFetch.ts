import { defaultGetHtml, encodeFetchUrl } from "./webSearch";
import type { GetHtml } from "./webSearch";

const TEXT_LIMIT = 8000;

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripped.slice(0, TEXT_LIMIT);
}

/**
 * Fetch a single https page as plain text. Companion to web_search.
 */
export async function webFetch(
  url: string,
  getHtml: GetHtml = defaultGetHtml,
): Promise<string> {
  const trimmed = url.trim();
  let href = trimmed;
  try {
    href = encodeFetchUrl(trimmed);
  } catch {
    href = trimmed;
  }
  if (!href.startsWith("https://")) return "only https URLs are allowed";
  try {
    const html = await getHtml(href);
    const text = htmlToText(html);
    return text || "empty page";
  } catch (err) {
    return `fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
