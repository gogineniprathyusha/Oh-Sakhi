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

for (const width of [320, 390, 440, 1440]) {
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
      "Her Hobby Hour — Oh Sakhi!",
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
