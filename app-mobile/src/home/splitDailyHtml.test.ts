import { describe, it, expect } from "vitest";
import { splitDailyHtml } from "./splitDailyHtml";

describe("splitDailyHtml", () => {
  it("extracts style and body and remaps body selectors", () => {
    const html = `<!doctype html><html><head><style>
  body.daily-letter{color:red}
  body h1{font-size:1rem}
</style></head><body class="daily-letter"><h1>昨天</h1></body></html>`;
    const { styles, body, bodyClass } = splitDailyHtml(html);
    expect(styles).toContain(".lyra-mobile-daily-sheet__body.daily-letter{color:red}");
    expect(styles).toContain(".lyra-mobile-daily-sheet__body h1{font-size:1rem}");
    expect(body).toContain("<h1>昨天</h1>");
    expect(bodyClass).toBe("daily-letter");
  });
});
