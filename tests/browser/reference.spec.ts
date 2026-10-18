import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { eventMock } from "./helpers/events.ts";

// Optional comparison with the owner's new visual reference, preserved outside app source.
const referenceDirectory = resolve(
  process.env.HER_HOBBY_HOUR_DESIGN_DIR || "her-hobby-hour",
);

for (const width of [1440, 390]) {
  test(`approved brand styles match the new reference at ${width}px`, async ({
    page,
  }, testInfo) => {
    const reference = join(referenceDirectory, "home-preview.html");
    test.skip(
      !existsSync(reference),
      "Set HER_HOBBY_HOUR_DESIGN_DIR to the supplied design folder.",
    );
    const original = await page.context().newPage();
    for (const tab of [page, original])
      await tab.setViewportSize({ width, height: 1000 });
    await original.goto(pathToFileURL(reference).href);
    await eventMock(page);
    await expect(page.locator(".event-card")).toHaveCount(1);
    await Promise.all([
      page.evaluate(() => document.fonts.ready),
      original.evaluate(() => document.fonts.ready),
    ]);
    // Navigation, real event data and responsive sizing retain the current app's behavior.
    for (const [actual, expected, properties] of [
      ["body", "body", ["fontFamily", "backgroundColor", "color"]],
      [".hero h1", ".hero h1", ["fontFamily", "color"]],
      [".hero-cta", ".btn", ["backgroundColor", "borderRadius"]],
      [".event-card h3", ".event h4", ["fontFamily", "color"]],
    ] as const) {
      const read = (selector: string, tab: typeof page) =>
        tab
          .locator(selector)
          .first()
          .evaluate(
            (element, keys) => {
              const style = getComputedStyle(element);
              return Object.fromEntries(
                keys.map((key) => [
                  key,
                  key === "fontFamily"
                    ? style.fontFamily.split(",")[0]
                    : style[key as keyof CSSStyleDeclaration],
                ]),
              );
            },
            [...properties],
          );
      expect(await read(actual, page)).toEqual(await read(expected, original));
    }
    await original.screenshot({
      path: testInfo.outputPath(`approved-reference-${width}.png`),
      fullPage: true,
    });
    await original.close();
  });
}
