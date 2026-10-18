import { test, expect, type Locator, type Page } from "@playwright/test";
import { authMock, origin } from "./helpers/auth.ts";
import { eventState } from "./helpers/events.ts";

// The reported iPhone bug paints an opaque green emoji in brand artwork.
// Check rendered pixels rather than relying on the browser's computed text color.
async function expectBrandColors(page: Page, region: Locator) {
  const png = await region.screenshot();
  const greenPixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4)
      if (data[index] < 100 && data[index + 1] > 150 && data[index + 2] < 100)
        count++;
    return count;
  }, png.toString("base64"));
  expect(
    greenPixels,
    "Brand artwork must not turn into an opaque green emoji",
  ).toBe(0);
}

for (const width of [320, 390, 440]) {
  test(`brand artwork keeps its colors and account/event controls work at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await authMock(page, async (route) => {
      if (
        new URL(route.request().url()).pathname !== "/rest/v1/meetup_directory"
      )
        return false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([eventState().event]),
      });
      return true;
    });
    await page.goto(origin);
    await expect(page.locator(".event-card")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await expectBrandColors(page, page.locator(".topbar .mobile-brand"));
    await expectBrandColors(page, page.locator(".hero"));
    await expectBrandColors(page, page.locator(".event-art"));
    await page.screenshot({
      path: testInfo.outputPath(`homepage-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await page
      .getByRole("button", { name: "View details for Richmond coffee" })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Richmond public cafe",
    );
    await page
      .getByRole("button", { name: "Log in to RSVP", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expectBrandColors(page, page.locator(".auth-intro"));
    await page.screenshot({
      path: testInfo.outputPath(`login-${width}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Back to experiences" }).click();
    await page.getByRole("button", { name: "Wellness", exact: true }).click();
    await expect(
      page.getByText("Nothing here just yet", { exact: true }),
    ).toBeVisible();
    await expectBrandColors(page, page.locator(".empty .big"));
    await page.goto(`${origin}/privacy`);
    await expect(
      page.getByRole("heading", { name: "Privacy Policy", exact: true }),
    ).toBeVisible();
    await expectBrandColors(page, page.locator(".information-header .brand"));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
