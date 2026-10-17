import { test, expect, type Page } from "@playwright/test";
import { eventMock, eventState, memberId } from "./helpers/events.ts";
import { photoFile } from "./helpers/profile.ts";
test.use({ timezoneId: "America/Los_Angeles" });
async function edit(page: Page) {
  await page
    .getByRole("button", {
      name: "View details for Richmond coffee",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
}
async function fields(page: Page) {
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Summer chai gathering");
  await page.getByLabel("Date", { exact: true }).fill("2030-07-17");
  await page.getByLabel("Time (Richmond)", { exact: true }).fill("10:30");
  await page.getByLabel("Area / meeting place").fill("Richmond public cafe");
  await page
    .getByLabel("Tell us about your plan")
    .fill("A friendly gathering at a public cafe in Richmond.");
}
test("organisers save drafts with deadlines and end times, then publish directly", async ({
  page,
}) => {
  const state = await eventMock(page);
  await page.locator("#header-create").click();
  await fields(page);
  await page
    .getByLabel("Registration deadline (optional)", { exact: true })
    .fill("2030-07-16T17:00");
  await page
    .getByLabel("End date and time (optional)")
    .fill("2030-07-17T12:00");
  await page.getByLabel("Public organiser name").fill("Richmond Sakhi hosts");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("Draft saved");
  expect(state.event.status).toBe("draft");
  expect(state.event.registration_deadline).toBe("2030-07-16T21:00:00.000Z");
  expect(state.event.ends_at).toBe("2030-07-17T16:00:00.000Z");
  await page.locator('.sidebar [data-page="discover"]').click();
  await expect(page.locator(".event-card")).toHaveCount(0);
  await page.locator('.sidebar [data-page="host"]').click();
  await page
    .getByRole("button", {
      name: "View details for Summer chai gathering",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Publish event", exact: true })
    .click();
  await expect(page.locator("#toast")).toHaveText("Your event is published");
  expect(state.event.status).toBe("published");
});
test("invalid deadlines and end times preserve form input without writing", async ({
  page,
}) => {
  const state = await eventMock(page);
  await edit(page);
  await page
    .getByLabel("Registration deadline (optional)", { exact: true })
    .fill("2030-07-18T10:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at or before");
  await page
    .getByLabel("Registration deadline (optional)", { exact: true })
    .fill("");
  await page
    .getByLabel("End date and time (optional)")
    .fill("2030-07-17T09:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("after");
  expect(state.calls).toHaveLength(0);
  await expect(page.getByLabel("Plan name", { exact: true })).toHaveValue(
    "Richmond coffee",
  );
});
test("covers upload, replace, survive reload and remove without discarding form drafts", async ({
  page,
}) => {
  const state = await eventMock(page);
  await edit(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Unsaved title stays");
  await page.getByLabel("Event cover file").setInputFiles(photoFile);
  await expect(
    page.getByRole("button", { name: "Replace cover", exact: true }),
  ).toBeEnabled();
  const first = state.event.cover_path;
  expect(first).toBeTruthy();
  await expect(page.getByLabel("Plan name", { exact: true })).toHaveValue(
    "Unsaved title stays",
  );
  await expect(page.locator(".cover-editor img")).toBeVisible();
  await page.getByLabel("Event cover file").setInputFiles(photoFile);
  await expect.poll(() => state.event.cover_path).not.toBe(first);
  expect(state.covers.size).toBe(1);
  await page.reload();
  await expect(page.locator(".event-card img")).toBeVisible();
  await edit(page);
  await page.getByRole("button", { name: "Remove cover", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Upload cover", exact: true }),
  ).toBeEnabled();
  expect(state.event.cover_path).toBeNull();
  expect(state.covers.size).toBe(0);
});
test("failed or invalid cover uploads retain the saved event and unsaved fields", async ({
  page,
}) => {
  const state = await eventMock(page);
  await edit(page);
  await page.getByLabel("Plan name", { exact: true }).fill("Keep my draft");
  await page.getByLabel("Event cover file").setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.getByRole("alert")).toContainText("image type");
  expect(state.calls).toHaveLength(0);
  state.failCover = true;
  await page.getByLabel("Event cover file").setInputFiles(photoFile);
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.getByLabel("Plan name", { exact: true })).toHaveValue(
    "Keep my draft",
  );
  expect(state.event.cover_path).toBeNull();
});

for (const width of [320, 390])
  test(`event editor and cover controls fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await eventMock(page);
    await edit(page);
    await expect(
      page.getByLabel("Registration deadline (optional)", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const modal = page.getByRole("dialog");
    expect(
      await modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Upload cover", exact: true })
      .scrollIntoViewIfNeeded();
    if (width === 390)
      await page.screenshot({
        path: "test-results/event-editor-mobile.png",
        fullPage: true,
      });
  });
test("two isolated members request, approve, revoke, reconsider, withdraw and re-request", async ({
  page,
  browser,
}) => {
  const state = eventState();
  await eventMock(page, state);
  const context = await browser.newContext();
  const member = await context.newPage();
  try {
    await eventMock(member, state, true);
    await member
      .getByRole("button", {
        name: "View details for Richmond coffee",
        exact: true,
      })
      .click();
    await member
      .getByRole("button", { name: "Request to join →", exact: true })
      .click();
    await expect(member.getByRole("dialog")).toContainText(
      "waiting for the organiser",
    );
    await page
      .getByRole("button", {
        name: "View details for Richmond coffee",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Manage requests", exact: true })
      .click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "1 / 2 approved seats",
    );
    await page
      .getByRole("button", { name: "Revoke approval", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "0 / 2 approved seats",
    );
    await page
      .getByRole("button", { name: "Approve again", exact: true })
      .click();
    await expect.poll(() => state.requests.get(memberId)).toBe("approved");
    await member.reload();
    await member.locator('.sidebar [data-page="myplans"]').click();
    await expect(member.locator(".event-card")).toContainText("You’re going");
    await member
      .getByRole("button", {
        name: "View details for Richmond coffee",
        exact: true,
      })
      .click();
    await member
      .getByRole("button", { name: "Cancel my spot", exact: true })
      .click();
    await expect.poll(() => state.requests.get(memberId)).toBe("cancelled");
    await member
      .getByRole("button", { name: "Request to join →", exact: true })
      .click();
    await expect.poll(() => state.requests.get(memberId)).toBe("pending");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Cancel event", exact: true })
      .click();
    await expect(page.locator("#toast")).toHaveText("Plan cancelled");
    await member.reload();
    await member.locator('.sidebar [data-page="myplans"]').click();
    await expect(member.locator(".event-card")).toContainText("Cancelled");
    expect(state.event.status).toBe("cancelled");
    expect(state.requests.get(memberId)).toBe("cancelled");
  } finally {
    await context.close();
  }
});
