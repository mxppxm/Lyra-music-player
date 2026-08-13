import { getLyraPlatform } from "@lyra/platform";

export type GetHtml = (url: string) => Promise<string>;

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const RESULT_LIMIT = 5;

export async function defaultGetHtml(url: string): Promise<string> {
  return getLyraPlatform().fetchText(encodeFetchUrl(url));
}

export function encodeFetchUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

export function decodeEntities(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Unwrap DuckDuckGo `/l/?uddg=` click wrappers to the real destination. */
export function decodeDdgUrl(raw: string): string {
  let url = raw.trim();
  if (url.startsWith("//")) url = `https:${url}`;
  try {
    const u = new URL(url, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.toString();
  } catch {
    return url;
  }
}

function classHas(attrs: string, name: string): boolean {
  return new RegExp(`\\bclass=['"][^'"]*\\b${name}\\b`, "i").test(attrs);
}

function hrefOf(attrs: string): string {
  return attrs.match(/\bhref=['"]([^'"]+)['"]/i)?.[1] ?? "";
}

function isResultUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("duckduckgo.com")) return false;
    if (/\.(?:jpg|jpeg|png|gif|webp|css|js|woff2?|ico)(?:\?|$)/i.test(url)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function parseHits(html: string): SearchHit[] {
  const links: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(html))) {
    const attrs = m[1] ?? "";
    if (!classHas(attrs, "result-link") && !classHas(attrs, "result__a")) {
      continue;
    }
    const title = decodeEntities(m[2] ?? "").slice(0, 120);
    const url = decodeDdgUrl(hrefOf(attrs));
    if (!title || !isResultUrl(url) || seen.has(url)) continue;
    seen.add(url);
    links.push({ title, url });
    if (links.length >= RESULT_LIMIT) break;
  }

  const snippets: string[] = [];
  const snRe =
    /<(?:td|a|span|div)[^>]*class=['"][^'"]*result[-_]{1,2}snippet[^'"]*['"][^>]*>([\s\S]*?)<\/(?:td|a|span|div)>/gi;
  while ((m = snRe.exec(html)) && snippets.length < RESULT_LIMIT) {
    const text = decodeEntities(m[1] ?? "");
    if (text) snippets.push(text.slice(0, 240));
  }

  return links.map((link, i) => ({
    ...link,
    snippet: snippets[i] ?? "",
  }));
}

function formatHits(hits: SearchHit[]): string {
  return hits
    .map((h, i) => {
      const snippet = h.snippet ? `\n${h.snippet}` : "";
      return `${i + 1}. ${h.title}\n${h.url}${snippet}`;
    })
    .join("\n\n");
}

async function fetchEngine(url: string, getHtml: GetHtml): Promise<string> {
  try {
    return await getHtml(url);
  } catch {
    return "";
  }
}

/**
 * Keyless web search via DuckDuckGo lite, then the HTML endpoint.
 * Returns title / url / snippet only — use web_fetch to read a page.
 */
export async function webSearch(
  query: string,
  getHtml: GetHtml = defaultGetHtml,
): Promise<string> {
  const q = query.trim();
  if (!q) return "empty query";

  const encoded = encodeURIComponent(q);
  const lite = `https://lite.duckduckgo.com/lite/?q=${encoded}&kl=cn-zh`;
  let hits = parseHits(await fetchEngine(lite, getHtml));
  if (hits.length === 0) {
    const html = `https://html.duckduckgo.com/html/?q=${encoded}&kl=cn-zh`;
    hits = parseHits(await fetchEngine(html, getHtml));
  }
  if (hits.length === 0) return "no results";
  return formatHits(hits);
}
