/** Pull style + body out of a full daily HTML document for in-app rendering. */
export function splitDailyHtml(html: string): {
  styles: string;
  body: string;
  bodyClass: string;
} {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  const rawStyles = styleMatch?.[1]?.trim() ?? "";
  // Document styles target `body` — remap onto the in-app host node.
  const styles = rawStyles.replace(
    /\bbody(?=[\s.{:#\[,>+~]|$)/g,
    ".lyra-mobile-daily-sheet__body",
  );
  const bodyAttrs = bodyMatch?.[1] ?? "";
  const classMatch = /\bclass\s*=\s*["']([^"']*)["']/.exec(bodyAttrs);
  return {
    styles,
    body: (bodyMatch?.[2] ?? html).trim(),
    bodyClass: classMatch?.[1]?.trim() ?? "",
  };
}
