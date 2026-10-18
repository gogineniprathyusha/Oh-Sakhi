import { test, expect } from "@playwright/test";
import { authMock, origin, userId } from "./helpers/auth.ts";
import { eventMock, eventState, memberId } from "./helpers/events.ts";
import {
  pixel,
  profileMock,
  openProfile,
  photoFile,
} from "./helpers/profile.ts";

for (const width of [1440, 390]) {
  test(`guests see host photos on events without reading private profiles at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const event = eventState().event;
    event.host_avatar_path = `${userId}/public.png`;
    const reads: string[] = [];
    let failPhoto = false;
    await authMock(page, async (route) => {
      const path = new URL(route.request().url()).pathname;
      reads.push(path);
      if (path === "/rest/v1/meetup_directory") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([event]),
        });
        return true;
      }
      if (path.includes(`/profile-photos/${event.host_avatar_path}`)) {
        await route.fulfill(
          failPhoto
            ? {
                status: 404,
                contentType: "application/json",
                body: '{"message":"Photo unavailable"}',
              }
            : { status: 200, contentType: "image/png", body: pixel },
        );
        return true;
      }
      return false;
    });
    await page.goto(origin);
    await expect(page.locator(".event-card .event-host img")).toBeVisible();
    await page
      .locator(".event-card")
      .screenshot({ path: test.info().outputPath("public-host-photo.png") });
    await page
      .getByRole("button", { name: "View details for Richmond coffee" })
      .click();
    await expect(page.locator(".detail-note.event-host img")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Log in to RSVP", exact: true }),
    ).toBeVisible();
    expect(reads).not.toContain("/rest/v1/profiles");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    failPhoto = true;
    await page.reload();
    await expect(page.locator(".event-card")).toHaveCount(1);
    await expect(page.locator(".event-host .avatar")).toHaveText("L");
    await expect(
      page.getByRole("button", { name: "View details for Richmond coffee" }),
    ).toBeVisible();
  });
}

test("organisers see attendee photos while private attendee access remains unchanged", async ({
  page,
}) => {
  const store = eventState();
  store.requests.set(memberId, "approved");
  await eventMock(page, store);
  await page.route("https://her-hour-test.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/rest/v1/rpc/get_public_avatars") {
      expect(route.request().postDataJSON()).toEqual({
        p_user_ids: [memberId],
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { user_id: memberId, avatar_path: `${memberId}/public.png` },
        ]),
      });
    } else if (path.includes(`/profile-photos/${memberId}/public.png`)) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: pixel,
      });
    } else await route.fallback();
  });
  await page
    .getByRole("button", { name: "View details for Richmond coffee" })
    .click();
  await page
    .getByRole("button", { name: "View attendees", exact: true })
    .click();
  await expect(page.locator(".request-member img")).toBeVisible();
  await expect(page.locator(".request-member")).toContainText("Joining friend");
  await expect(page.locator(".request-member")).toContainText("Confirmed");
});

test("replacing and removing a photo updates owned event avatars without changing event data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const store = await profileMock(page, true);
  await page.route(
    "https://her-hour-test.supabase.co/rest/v1/meetup_directory?**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { ...eventState().event, host_avatar_path: store.member.avatar_path },
        ]),
      });
    },
  );
  await openProfile(page);
  await expect(
    page.getByText(/Your profile photo is publicly visible/),
  ).toBeVisible();
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(page.locator("#toast")).toHaveText("Profile photo saved");
  await page.locator('.sidebar [data-page="host"]').click();
  await expect(page.locator(".event-host img")).toBeVisible();
  expect(
    store.calls.some(
      (call) =>
        call.action === "download" && call.path === store.member.avatar_path,
    ),
  ).toBe(true);
  await page.locator('.sidebar [data-page="profile"]').click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("Profile photo removed");
  await page.locator('.sidebar [data-page="host"]').click();
  await expect(page.locator(".event-host img")).toHaveCount(0);
  await expect(page.locator(".event-host .avatar")).toHaveText("L");
  await expect(page.locator(".event-card")).toContainText("Richmond coffee");
});
