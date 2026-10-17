import { test, expect, type Page } from "@playwright/test";

const nav = (page: Page, destination: string) =>
  page.locator(`.sidebar [data-page="${destination}"]`);

test("localhost renders the reference layout and six samples without Supabase requests", async ({
  page,
}) => {
  const errors: string[] = [],
    backendRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("supabase.co"))
      backendRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".demo-banner")).toContainText("DEMO MODE");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Good things happenwhen women connect.",
  );
  await expect(page.locator(".event-card")).toHaveCount(6);
  await expect(page.locator(".sidebar .brand")).toContainText("oh sakhi!");
  await expect(page.locator(".hero")).toHaveCSS("border-radius", "17px");
  await expect(page.locator(".sidebar")).toHaveCSS("width", "235px");
  await page.screenshot({
    path: "test-results/discover-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(backendRequests).toEqual([]);
});

test("category filters show matching sample events", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Wellness", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(2);
  await expect(page.locator(".chip.active")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Creative", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await expect(page.locator(".event-card")).toContainText(
    "A Little Pottery Date",
  );
  await page.getByRole("button", { name: "All experiences" }).click();
  await expect(page.locator(".event-card")).toHaveCount(6);
});

test("demo RSVP persists across reload and can be withdrawn", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "View details for A Little Pottery Date" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Sample meetup");
  await page
    .getByRole("button", { name: "Request to join →", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No host has been contacted",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav(page, "myplans").click();
  await expect(page.locator(".event-card")).toHaveCount(2);
  await page.reload();
  await nav(page, "myplans").click();
  await expect(
    page.locator(".event-card").filter({ hasText: "A Little Pottery Date" }),
  ).toContainText("Request pending");
  await page
    .getByRole("button", { name: "View details for A Little Pottery Date" })
    .click();
  await page.getByRole("button", { name: "Withdraw request" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".event-card")).toHaveCount(2);
  await expect(
    page.locator(".event-card").filter({ hasText: "A Little Pottery Date" }),
  ).toContainText("Request withdrawn");
});

test("profile edits persist, remain escaped, and reset restores original RSVP data", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "profile").click();
  await page
    .getByLabel("Your first name or display name")
    .fill("<img src=x onerror=alert(1)>");
  await page
    .getByLabel("A little about you")
    .fill("Coffee, books and new friends.");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator(".demo-profile-heading strong")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".demo-profile-heading img")).toHaveCount(0);
  await page.reload();
  await nav(page, "profile").click();
  await expect(page.getByLabel("Your first name or display name")).toHaveValue(
    "<img src=x onerror=alert(1)>",
  );
  await nav(page, "myplans").click();
  await page
    .getByRole("button", { name: "View details for Coffee & Conversations" })
    .click();
  await page.getByRole("button", { name: "Cancel my spot" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await expect(page.locator(".event-card")).toContainText("Request withdrawn");
  await nav(page, "profile").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByLabel("Your first name or display name")).toHaveValue(
    "Sakhi Member",
  );
  await nav(page, "myplans").click();
  await expect(page.locator(".event-card")).toHaveCount(1);
});

test("local hosting supports drafts, sample requests, approvals, capacity, edits and cancellation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "+ Host a plan", exact: true })
    .click();
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Sunday chai & chats");
  await page.getByLabel("Group size").selectOption("4");
  await page.getByLabel("Date", { exact: true }).fill("2099-10-17");
  await page.getByLabel("Time (Richmond)").fill("10:30");
  await page.getByLabel("Area / meeting place").fill("Short Pump, Richmond");
  await page
    .getByLabel("Tell us about your plan")
    .fill("Come along for chai and relaxed conversations in a public café.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("heading", { name: "My plans", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View details for Sunday chai & chats" })
    .click();
  await page
    .getByRole("button", { name: "Publish demo plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage requests", exact: true })
    .click();
  for (let index = 0; index < 4; index++) {
    await page.getByRole("button", { name: "Add sample request" }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
  }
  await expect(page.getByRole("dialog")).toContainText("4 / 4 approved seats");
  await expect(
    page.getByRole("button", { name: "Add sample request" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Revoke approval", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("3 / 4 approved seats");
  await page
    .getByRole("button", { name: "Approve again", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("4 / 4 approved seats");
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page
    .getByLabel("Area / meeting place")
    .fill("A different public cafe, Richmond");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "View details for Sunday chai & chats" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "A different public cafe, Richmond",
  );
  await page
    .getByRole("button", { name: "Manage requests", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("4 / 4 approved seats");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel this demo plan" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.locator(".event-card").filter({ hasText: "Sunday chai & chats" }),
  ).toContainText("Cancelled");
});

test("account actions explain required setup and dialogs support keyboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  const login = page.getByRole("button", {
    name: "Log in / Join",
    exact: true,
  });
  await login.click();
  await expect(page.getByRole("dialog")).toContainText(
    "Real accounts need Supabase",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Keep exploring" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(login).toBeFocused();
  await nav(page, "circle").click();
  await expect(page.locator("#view")).toContainText(
    "private messaging are not implemented yet",
  );
  await page.locator(".brand").click();
  await expect(page.locator(".hero")).toBeVisible();
});

test("corrupt or unavailable browser storage does not block the website", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("her-hour-demo-v1", "{bad data"),
  );
  await page.goto("/");
  await expect(page.locator(".event-card")).toHaveCount(6);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw Error("Blocked");
    };
    Storage.prototype.setItem = () => {
      throw Error("Blocked");
    };
  });
  await page.reload();
  await expect(page.locator(".event-card")).toHaveCount(6);
  await nav(page, "profile").click();
  await page.getByLabel("Your first name or display name").fill("Demo Friend");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("storage is unavailable");
  await expect(page.locator("#top-avatar")).toHaveText("D");
});

for (const width of [320, 390, 768]) {
  test(`responsive navigation and cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".event-card")).toHaveCount(6);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const menu = page.locator(width <= 750 ? ".mobile-nav" : ".sidebar");
    await menu.locator('[data-page="profile"]').click();
    await expect(
      page.getByLabel("Your first name or display name"),
    ).toBeVisible();
    await menu.locator('[data-page="discover"]').click();
    await page
      .getByRole("button", { name: "+ Host a plan", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
    await page.keyboard.press("Escape");
    if (width === 390)
      await page.screenshot({
        path: "test-results/discover-mobile.png",
        fullPage: true,
      });
  });
}
