import { test, expect } from "@playwright/test";
import { eventMock, eventState, meetupId } from "./helpers/events.ts";
import { authMock, origin } from "./helpers/auth.ts";

test("a member's email link opens the event after their session and plans load", async ({
  page,
}) => {
  await eventMock(page, eventState());
  await page.goto(`${origin}/?event=${meetupId}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Richmond coffee" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel event", exact: true }),
  ).toBeVisible();
});
test("guest email links wait for discovery and show the public event without revealing attendee data", async ({
  page,
}) => {
  const reads: string[] = [];
  await authMock(page, async (route) => {
    const path = new URL(route.request().url()).pathname;
    reads.push(path);
    if (path === "/rest/v1/meetup_directory") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([eventState().event]),
      });
      return true;
    }
    return false;
  });
  await page.goto(`${origin}/?event=${meetupId}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log in to RSVP", exact: true }),
  ).toBeVisible();
  expect(reads).not.toContain("/rest/v1/profiles");
  expect(reads).not.toContain("/rest/v1/meetup_requests");
  await page
    .getByRole("button", { name: "Log in to RSVP", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Richmond coffee" }),
  ).toBeVisible();
});
test("an unavailable email event gives an explanation and keeps the member in My plans", async ({
  page,
}) => {
  await eventMock(page, eventState());
  await page.goto(`${origin}/?event=00000000-0000-4000-8000-000000000099`);
  await expect(
    page.getByRole("heading", { name: "My plans", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This event is no longer available" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
