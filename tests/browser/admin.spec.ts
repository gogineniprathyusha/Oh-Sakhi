import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { adminMock } from "./helpers/admin.ts";
import { memberId, meetupId } from "./helpers/events.ts";
const navigate = async (page: import("@playwright/test").Page) =>
  page.locator('.sidebar [data-page="admin"]').click();
test("demo and ordinary members never see administrator navigation or load admin data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-page="admin"]')).toHaveCount(0);
  const store = await adminMock(page, { admin: false });
  await expect(page.locator('.sidebar [data-page="host"]')).toBeVisible();
  await expect(page.locator('[data-page="admin"]')).toHaveCount(0);
  expect(
    store.calls.filter((call) => call.action.startsWith("admin_")),
  ).toHaveLength(0);
});
test("admin reviews, resolves and reopens a report without implicitly removing its event", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const store = await adminMock(page);
  await navigate(page);
  await expect(
    page.getByRole("heading", { name: "Admin dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".stat").filter({ hasText: "Total members" }),
  ).toContainText("23");
  await page.screenshot({
    path: test.info().outputPath("admin-overview-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Review open reports" }).click();
  await page
    .getByRole("button", { name: "Review report", exact: true })
    .click();
  await page.getByLabel("Review status").selectOption("resolved");
  await page
    .getByLabel("Review note", { exact: false })
    .fill("Confirmed the concern and recorded the resolution.");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByText("Report review saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No matching records.", { exact: true }),
  ).toBeVisible();
  expect(store.event.status).toBe("published");
  expect(store.reports[0].status).toBe("resolved");
  await page.getByLabel("Report status").selectOption("resolved");
  await page
    .getByRole("button", { name: "Review report", exact: true })
    .click();
  await expect(page.getByLabel("Review note", { exact: false })).toHaveValue(
    "Confirmed the concern and recorded the resolution.",
  );
  await page.getByLabel("Review status").selectOption("open");
  await page.getByRole("button", { name: "Save review" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".admin-records")).toContainText("review report");
  expect(
    store.calls.find((call) => call.action === "review_report")?.body
      .p_report_id,
  ).toBe(store.reports[0].id);
  expect(errors).toEqual([]);
});
test("member search, pagination, suspension and restoration require recorded reasons and preserve retryable errors", async ({
  page,
}) => {
  const store = await adminMock(page);
  await navigate(page);
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await expect(
    page.getByText("1–20 of 23 records", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByText("21–23 of 23 records", { exact: true }),
  ).toBeVisible();
  expect(
    store.calls.filter((call) => call.action === "admin_list_members").at(-1)
      ?.body.p_offset,
  ).toBe(20);
  await page.getByLabel("Search display name or member ID").fill(memberId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("1–1 of 1 records", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Suspend member", exact: true })
    .click();
  await page.getByLabel("Reason (10–500 characters)").fill("short");
  await page.getByRole("button", { name: "Confirm access change" }).click();
  expect(store.calls.some((call) => call.action === "set_member_access")).toBe(
    false,
  );
  await page
    .getByLabel("Reason (10–500 characters)")
    .fill("Reviewed the community access concern.");
  store.failWrite = true;
  await page.getByRole("button", { name: "Confirm access change" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  expect(store.members[1].status).toBe("active");
  store.failWrite = false;
  await page.getByRole("button", { name: "Confirm access change" }).click();
  await expect(
    page.getByRole("button", { name: "Restore member", exact: true }),
  ).toBeVisible();
  expect(store.members[1].status).toBe("suspended");
  await page
    .getByRole("button", { name: "Restore member", exact: true })
    .click();
  await page
    .getByLabel("Reason (10–500 characters)")
    .fill("Reviewed and restored member access.");
  await page.getByRole("button", { name: "Confirm access change" }).click();
  await expect(
    page.getByRole("button", { name: "Suspend member", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search display name or member ID")
    .fill("Community admin");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText(
      "Administrator access changes are handled by the community owner.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Suspend member", exact: true }),
  ).toHaveCount(0);
});
test("admin attendee CSV is confirmed-only by default, formula safe and audited; all-status export is explicit", async ({
  page,
}) => {
  const store = await adminMock(page);
  await navigate(page);
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await page
    .getByRole("button", { name: "View attendees", exact: true })
    .click();
  await expect(page.locator(".admin-action")).toContainText("Withdrawn friend");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download attendee CSV" }).click(),
  ]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toContain("Withdrawn friend");
  expect(csv).not.toContain("email");
  expect(download.suggestedFilename()).toContain(meetupId);
  await page.getByLabel("Confirmed attendees only").uncheck();
  const [all] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download attendee CSV" }).click(),
  ]);
  expect(await readFile((await all.path())!, "utf8")).toContain(
    "Withdrawn friend",
  );
  expect(
    store.history.filter((row) => row.action === "attendee_export"),
  ).toHaveLength(2);
});
test("event removal requires confirmation and a reason, then preserves report review as a separate step", async ({
  page,
}) => {
  const store = await adminMock(page);
  await navigate(page);
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Remove reported event" }).click();
  await page
    .getByLabel("Reason (10–1000 characters)")
    .fill("Confirmed a community guideline violation.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Confirm event removal" }).click();
  expect(store.event.status).toBe("published");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm event removal" }).click();
  await expect(
    page.getByText(
      "Event removed. Active RSVPs were cancelled and history retained.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(store.event.approved_count).toBe(0);
  expect(store.reports[0].status).toBe("open");
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.locator(".admin-records")).toContainText("removed");
  await expect(
    page.getByRole("button", { name: "Remove for a violation" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View event", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "removed for a community violation",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".admin-records")).toContainText(
    "Confirmed a community guideline violation.",
  );
});
test("failed reads clear sensitive lists, recover on retry, and role revocation removes dashboard access", async ({
  page,
}) => {
  const store = await adminMock(page);
  await navigate(page);
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await expect(page.locator(".admin-records")).toContainText("Joining friend");
  store.failRead = true;
  await page.getByRole("button", { name: "Refresh dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator(".admin-records")).toHaveCount(0);
  store.failRead = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".admin-records")).toContainText("Joining friend");
  store.admin = false;
  await page.getByRole("button", { name: "Refresh dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Administrator access is required",
  );
  await expect(page.locator(".admin-records")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Refresh plans", exact: true })
    .click();
  await expect(page.locator('[data-page="admin"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
});
test("organisers can export their own attendees without acquiring admin navigation", async ({
  page,
}) => {
  const store = await adminMock(page, { admin: false, host: true });
  await page
    .getByRole("button", { name: "View details for Richmond coffee" })
    .click();
  await page
    .getByRole("button", { name: "View attendees", exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download attendee CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain("confirmed");
  await expect(page.locator('[data-page="admin"]')).toHaveCount(0);
  expect(store.calls.some((call) => call.action.startsWith("admin_"))).toBe(
    false,
  );
});
test("mobile administrators can navigate and review reports without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminMock(page);
  await page.locator('.mobile-nav [data-page="admin"]').click();
  await expect(
    page.getByRole("heading", { name: "Admin dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page
    .getByRole("button", { name: "Review report", exact: true })
    .click();
  await expect(page.getByLabel("Review status")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("admin-report-mobile.png"),
    fullPage: true,
  });
});
