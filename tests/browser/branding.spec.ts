import { test, expect, type Locator, type Page } from "@playwright/test";
import { authMock, origin } from "./helpers/auth.ts";
import { eventState } from "./helpers/events.ts";
import AxeBuilder from "@axe-core/playwright";

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

for (const width of [320, 390, 440, 800, 1024, 1440]) {
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
      const event = eventState().event;
      event.host_name = "Her Hour host";
      event.host_label = "Her Hour host";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([event]),
      });
      return true;
    });
    await page.goto(origin);
    await expect(page.locator(".event-card")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveTitle(/Her Hobby Hour — Oh Sakhi!/);
    const brand = page.locator(
      width > 750 ? ".sidebar .brand" : ".topbar .mobile-brand",
    );
    await expect(brand).toHaveText("Her Hobby HourOh Sakhi!");
    await expect(brand.locator("img")).toHaveJSProperty("naturalWidth", 465);
    await expect(page.locator(".hero-logo")).toHaveJSProperty(
      "naturalWidth",
      1254,
    );
    await expect(page.locator(".event-card")).toContainText(
      "Her Hobby Hour host",
    );
    await expectBrandColors(page, brand);
    await expectBrandColors(page, page.locator(".hero"));
    await expectBrandColors(page, page.locator(".event-art"));
    await page.evaluate(() => scrollTo(0, 0));
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
    await expect(page.locator(".auth-intro h1")).toHaveText(
      "It’s your time to belong.",
    );
    await expect(page.locator(".auth-logo")).toHaveJSProperty(
      "naturalWidth",
      1254,
    );
    await expect(page.locator(".auth-logo")).toHaveAttribute(
      "src",
      "/brand/hh-artwork.webp",
    );
    await expect(page.locator(".auth-artwork-name")).toHaveText(
      "HER HOBBY HOUR",
    );
    await expect(page.locator(".auth-artwork-tag")).toHaveText("Oh Sakhi!");
    await expect(page.locator(".auth-benefits > li")).toHaveText([
      "Hobbiesthat heal",
      "A communitythat gets you",
      "A happier,you",
    ]);
    await expect(page.locator(".auth-icon")).toHaveAttribute(
      "src",
      "/brand/hh-icon.webp",
    );
    await expect(page.locator(".auth-icon")).toHaveJSProperty(
      "naturalWidth",
      465,
    );
    await expect(page.locator(".auth-card")).toHaveCSS("text-align", "center");
    await expect(page.locator(".auth-subtitle")).toHaveText(
      "Sign in to discover your next favorite experience.",
    );
    // Keep the editorial content in reading order without overlapping the artwork or form.
    const regions = await page.evaluate(() =>
      Object.fromEntries(
        [
          ".auth-story h1",
          ".auth-story-copy",
          ".auth-logo",
          ".auth-artwork-name",
          ".auth-artwork-tag",
          ".auth-benefits",
          ".auth-intro",
          ".auth-panel",
        ].map((selector) => {
          const { x, y, width, height } = document
            .querySelector(selector)!
            .getBoundingClientRect();
          return [selector, { x, y, width, height }];
        }),
      ),
    );
    for (const [before, after] of [
      [".auth-story h1", ".auth-story-copy"],
      [".auth-story-copy", ".auth-logo"],
      [".auth-logo", ".auth-artwork-name"],
      [".auth-artwork-name", ".auth-artwork-tag"],
      [".auth-artwork-tag", ".auth-benefits"],
    ]) {
      expect(regions[after].y).toBeGreaterThanOrEqual(
        regions[before].y + regions[before].height,
      );
    }
    if (width > 790)
      expect(regions[".auth-panel"].x).toBeGreaterThanOrEqual(
        regions[".auth-intro"].x + regions[".auth-intro"].width - 1,
      );
    else
      expect(regions[".auth-panel"].y).toBeGreaterThanOrEqual(
        regions[".auth-intro"].y + regions[".auth-intro"].height - 1,
      );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expectBrandColors(page, page.locator(".auth-intro"));
    await page.evaluate(() => scrollTo(0, 0));
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
    await expect(page).toHaveTitle(
      "Privacy Policy | Her Hobby Hour — Oh Sakhi!",
    );
    await expect(page.locator(".information-header .brand")).toHaveText(
      "Her Hobby HourOh Sakhi!",
    );
    await expectBrandColors(page, page.locator(".information-header .brand"));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [1024, 768],
  [1280, 640],
]) {
  test(`desktop auth content fits without scrolling at ${width}x${height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await authMock(page);
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Host your first experience" })
      .click();
    await page.evaluate(() => document.fonts.ready);
    for (const mode of ["login", "signup", "reset"] as const) {
      if (mode === "signup")
        await page
          .getByRole("button", { name: "Create account", exact: true })
          .click();
      if (mode === "reset") {
        await page.getByRole("button", { name: "Back to login" }).click();
        await page.getByRole("button", { name: "Forgot password?" }).click();
      }
      await page.evaluate(() => scrollTo(0, 0));
      const bounds = await page.evaluate(() => ({
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        pageHeight: document.documentElement.scrollHeight,
        pageWidth: document.documentElement.scrollWidth,
      }));
      expect(
        bounds.pageHeight,
        `${mode} must fit the window height`,
      ).toBeLessThanOrEqual(bounds.viewportHeight);
      expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewportWidth);
      for (const selector of [".auth-story", ".auth-benefits", ".auth-card"]) {
        const region = await page.locator(selector).boundingBox();
        expect(region).not.toBeNull();
        expect(region!.y).toBeGreaterThanOrEqual(0);
        expect(region!.y + region!.height).toBeLessThanOrEqual(height);
      }
      const spacing = await page.evaluate(() => {
        const panel = document
          .querySelector(".auth-intro")!
          .getBoundingClientRect();
        const story = document
          .querySelector(".auth-story")!
          .getBoundingClientRect();
        const benefits = document
          .querySelector(".auth-benefits")!
          .getBoundingClientRect();
        return {
          above: story.top - panel.top,
          below: panel.bottom - benefits.bottom,
        };
      });
      expect(
        Math.abs(spacing.above - spacing.below),
        "Story and benefits should have equal outer spacing",
      ).toBeLessThanOrEqual(2);
      await expect(
        page.getByRole("link", { name: "Privacy Policy" }),
      ).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath(`compact-${mode}-${width}x${height}.png`),
        fullPage: true,
      });
    }
  });
}

test("hero hosting actions keep the login gate and auth modes remain accessible", async ({
  page,
}, testInfo) => {
  await authMock(page);
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Host your first experience" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  for (const mode of ["login", "signup", "reset"] as const) {
    if (mode === "signup")
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    if (mode === "reset") {
      await page.getByRole("button", { name: "Back to login" }).click();
      await page.getByRole("button", { name: "Forgot password?" }).click();
    }
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`auth-${mode}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Back to experiences" }).click();
  await page
    .getByRole("button", { name: "+ Create a plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});
