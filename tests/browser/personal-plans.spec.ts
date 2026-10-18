import { test, expect } from "@playwright/test";
import { authMock, origin, storedSession, userId } from "./helpers/auth.ts";
import { eventState, memberId } from "./helpers/events.ts";

for (const width of [1440, 390, 320]) {
  test(`joined plans and hosted events stay separate at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await storedSession(page);
    const base = eventState().event;
    base.details_updated_at = "2026-10-17T16:00:00Z";
    base.description =
      "Join us for a relaxed afternoon of coffee, conversation, and new friendships in Richmond. Meet local women, share your favorite hobbies, and enjoy a welcoming space to connect. Come solo or bring a friend; everyone is welcome. Can't wait to meet you!";
    const events = [
      { ...base, id: "hosted", title: "My coffee meetup" },
      { ...base, id: "draft", title: "My draft gathering", status: "draft" },
      { ...base, id: "joined", title: "Joined brunch", host_id: memberId },
      { ...base, id: "withdrawn", title: "Withdrawn walk", host_id: memberId },
      { ...base, id: "other", title: "Another public plan", host_id: memberId },
    ];
    await authMock(page, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        !["/rest/v1/meetup_directory", "/rest/v1/meetup_requests"].includes(
          path,
        )
      )
        return false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          path.endsWith("meetup_directory")
            ? events
            : [
                { meetup_id: "joined", user_id: userId, status: "approved" },
                {
                  meetup_id: "withdrawn",
                  user_id: userId,
                  status: "cancelled",
                },
              ],
        ),
      });
      return true;
    });
    await page.goto(origin);
    await expect(page.locator(".event-card")).toHaveCount(4);
    const refresh = page.getByRole("button", {
      name: "Refresh plans",
      exact: true,
    });
    await expect(refresh).toBeVisible();
    const nav = page.locator(width > 750 ? ".sidebar" : ".mobile-nav");
    await nav.locator('[data-page="myplans"]').click();
    await expect(
      page.getByRole("heading", { name: "My plans", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".event-card")).toHaveCount(2);
    await expect(refresh).toBeVisible();
    await expect(page.locator(".grid")).toContainText("Joined brunch");
    const joined = page
      .locator(".event-card")
      .filter({ hasText: "Joined brunch" });
    await expect(joined).toContainText(
      "Details updated — please review your plan.",
    );
    await expect(page.locator(".grid")).toContainText("Withdrawn walk");
    await expect(page.locator(".grid")).not.toContainText("My coffee meetup");
    await expect(
      page.locator(".stat").filter({ hasText: "Going" }),
    ).toContainText("1");
    await expect(
      page.locator(".stat").filter({ hasText: "Cancelled" }),
    ).toContainText("1");
    await expect(page.getByText("Hosting", { exact: true })).toHaveCount(0);

    await nav
      .getByRole("button", { name: "My hosted events", exact: false })
      .click();
    await expect(
      page.getByRole("heading", { name: "My hosted events", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/My hosted events$/);
    await expect(refresh).toBeVisible();
    await expect(page.locator(".event-card")).toHaveCount(2);
    await expect(page.locator(".grid")).toContainText("My coffee meetup");
    const hosted = page
      .locator(".event-card")
      .filter({ hasText: "My coffee meetup" });
    await expect(hosted.locator(".event-body > p")).toHaveText([
      "📍 Richmond public cafe",
      String(base.description),
      "Hosted by You",
    ]);
    await expect(hosted).not.toContainText("Details updated");
    await hosted.screenshot({
      path: test.info().outputPath(`event-description-${width}.png`),
    });
    await expect(page.locator(".grid")).toContainText("My draft gathering");
    await expect(page.locator(".grid")).not.toContainText("Joined brunch");
    await expect(
      page.getByRole("button", { name: "+ Host an experience", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".topbar")
      .getByRole("button", { name: "My profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "My profile", exact: true }),
    ).toBeVisible();
    await expect(refresh).toHaveCount(0);
    await expect(nav.locator('[data-page="profile"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
    await nav.locator('[data-page="circle"]').click();
    await expect(
      page.getByRole("heading", { name: "My circle", exact: true }),
    ).toBeVisible();
    await expect(refresh).toHaveCount(0);
  });
}
