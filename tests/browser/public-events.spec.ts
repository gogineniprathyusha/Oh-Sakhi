import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authMock, origin } from "./helpers/auth.ts";
import { eventState } from "./helpers/events.ts";

test("missing configuration shows the branded homepage without sample events or guest editing", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "her-hour-demo-v1",
      JSON.stringify({
        profile: { name: "Old sample member" },
        events: [{ title: "Old sample plan" }],
      }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator(".event-card")).toHaveCount(0);
  await expect(page.getByText(/Old sample/)).toHaveCount(0);
  await page.locator('.sidebar [data-page="profile"]').click();
  await expect(page.getByRole("dialog")).toContainText(
    "Account services are temporarily unavailable",
  );
  await expect(page.locator("#profile-name,#ev-title")).toHaveCount(0);
});

for (const width of [1440, 390, 320]) {
  test(`guests browse real public events and must log in for account actions at ${width}px`, async ({
    page,
  }) => {
    const reads: string[] = [];
    const event = eventState().event;
    event.approved_count = 1;
    // A public host label is display text, never evidence of ownership.
    event.host_name = "You";
    await page.setViewportSize({ width, height: 1000 });
    await authMock(page, async (route) => {
      const url = new URL(route.request().url());
      reads.push(url.pathname);
      if (url.pathname !== "/rest/v1/meetup_directory") return false;
      expect(route.request().method()).toBe("GET");
      expect(url.searchParams.get("status")).toBe("eq.published");
      expect(url.searchParams.get("starts_at")).toMatch(/^gt\./);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([event]),
      });
      return true;
    });
    await page.goto(origin);
    await expect(page.locator(".event-card")).toHaveCount(1);
    await expect(page.locator(".event-card")).toContainText("1 spots left");
    await expect(page.locator(".event-meta")).toHaveText(
      "Wed, Jul 17 · 10:30 AM EDT",
    );
    await expect(page.locator(".event-card")).not.toContainText(
      "Richmond time",
    );
    await expect(
      page.getByText("You are hosting", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "View details for Richmond coffee" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("1 of 2 spots left");
    await expect(page.locator(".detail-info")).toContainText("10:30 AM EDT");
    await expect(
      page.getByRole("button", {
        name: /Edit plan|Cancel event|View attendees|Report this event/,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Log in to RSVP", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to experiences" }).click();
    await page
      .getByRole("button", { name: "+ Host a plan", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.locator("#ev-title")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to experiences" }).click();
    await page.getByRole("button", { name: "Wellness", exact: true }).click();
    await expect(
      page.getByText("Nothing here just yet", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Coffee", exact: true }).click();
    await expect(page.locator(".event-card")).toHaveCount(1);
    expect(reads.every((path) => path === "/rest/v1/meetup_directory")).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(scan.violations.map(({ id }) => id)).toEqual([]);
      await page.screenshot({
        path: "test-results/public-events-mobile.png",
        fullPage: true,
      });
    }
  });
}

test("public discovery retries backend failures without substituting samples", async ({
  page,
}) => {
  let failed = true;
  await authMock(page, async (route) => {
    if (new URL(route.request().url()).pathname !== "/rest/v1/meetup_directory")
      return false;
    await route.fulfill({
      status: failed ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(failed ? { message: "Unavailable" } : []),
    });
    return true;
  });
  await page.goto(origin);
  // The SDK retries transient 503 responses with 1s/2s/4s backoff before surfacing an error.
  await expect(page.getByRole("alert")).toContainText(
    "couldn’t load experiences",
    { timeout: 15000 },
  );
  await expect(page.locator(".event-card")).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("Nothing here just yet", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
