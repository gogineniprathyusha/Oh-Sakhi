import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { eventMock } from "./helpers/events.ts";

// Optional comparison against the original, unmodified design supplied by the owner.
const reference =
  process.env.HER_HOUR_REFERENCE_HTML ||
  join(homedir(), "Downloads", "her-hour-interactive-preview.html");

for (const width of [1440, 390]) {
  test(`reference design styles match at ${width}px`, async ({ page }) => {
    test.skip(
      !existsSync(reference),
      "Set HER_HOUR_REFERENCE_HTML to the supplied preview file to run this comparison.",
    );
    const original = await page.context().newPage();
    for (const tab of [page, original]) {
      await tab.setViewportSize({ width, height: 1000 });
      await tab.clock.setFixedTime(new Date("2026-10-13T16:00:00Z"));
    }
    await original.goto(pathToFileURL(reference).href);
    await eventMock(page);
    await expect(page.locator(".event-card")).toHaveCount(1);
    await Promise.all([
      page.evaluate(() => document.fonts.ready),
      original.evaluate(() => document.fonts.ready),
    ]);
    const selectors = {
      ".hero": ["backgroundImage", "borderRadius", "minHeight"],
      ".hero h1": [
        "fontFamily",
        "fontSize",
        "lineHeight",
        "fontWeight",
        "letterSpacing",
        "color",
      ],
      ".hero p": ["fontFamily", "fontSize", "lineHeight", "color"],
      ".grid": ["gap"],
      ".event-art": ["height", "backgroundImage"],
      ".event-card": ["borderRadius", "boxShadow"],
      ".brand": ["fontSize", "fontFamily", "letterSpacing"],
      ".sidebar": ["width", "backgroundColor", "padding"],
      ".btn": ["borderRadius", "fontSize", "fontWeight", "backgroundColor"],
    };
    const readStyles = (tab: Page) =>
      tab.evaluate(
        (map: Record<string, string[]>) =>
          Object.fromEntries(
            Object.entries(map).map(([selector, properties]) => {
              const style = getComputedStyle(document.querySelector(selector)!);
              return [
                selector,
                Object.fromEntries(
                  properties.map((property) => [
                    property,
                    style[property as keyof CSSStyleDeclaration],
                  ]),
                ),
              ];
            }),
          ),
        selectors,
      );
    expect(await readStyles(page)).toEqual(await readStyles(original));
    await original.screenshot({
      path: `test-results/reference-${width}.png`,
      fullPage: true,
    });
    await original.close();
  });
}
