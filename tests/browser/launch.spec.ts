import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authMock, origin, storedSession } from "./helpers/auth.ts";
import { adminMock } from "./helpers/admin.ts";
import { eventMock } from "./helpers/events.ts";
const policies = [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Use"],
  ["guidelines", "Community guidelines"],
  ["contact", "Contact"],
] as const;
for (const [path, title] of policies)
  test(`public ${path} page reloads, works without authentication and fits mobile`, async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(".supabase.co")) requests.push(request.url());
    });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${origin}/${path}`);
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "whiteperall@gmail.com" }).first(),
    ).toHaveAttribute("href", "mailto:whiteperall@gmail.com");
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(requests).toEqual([]);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((node) => ({
          target: node.target,
          issue: node.failureSummary,
        })),
      })),
    ).toEqual([]);
  });
test("footer and auth information links work, and keyboard users can skip navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#view")).toBeFocused();
  await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page
    .getByRole("link", { name: "Back to community", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  await authMock(page);
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Terms", exact: true }),
  ).toHaveAttribute("href", "/terms");
});
async function accountMock(page: import("@playwright/test").Page) {
  const state = {
    admin: false,
    upcoming: 0,
    deleting: false,
    failed: false,
    calls: [] as Record<string, unknown>[],
  };
  await storedSession(page);
  await authMock(page, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = async (value: unknown, status = 200) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
      return true;
    };
    if (path === "/rest/v1/rpc/get_account_deletion_summary")
      return json({
        hosted_events: 1,
        upcoming_events: state.upcoming,
        rsvps: 2,
        is_admin: state.admin,
        deleting: state.deleting,
      });
    if (path === "/rest/v1/rpc/get_my_access")
      return json({
        status: state.deleting ? "suspended" : "active",
        is_admin: false,
      });
    if (path === "/functions/v1/delete-account") {
      state.calls.push(route.request().postDataJSON());
      if (state.failed) {
        state.deleting = true;
        return json(
          {
            error:
              "File cleanup could not finish. Your account is locked; retry deletion or contact support.",
          },
          503,
        );
      }
      return json({ deleted: true });
    }
    return false;
  });
  await page.goto(origin);
  return state;
}
test("account deletion requires deliberate confirmation, clears password on failure and retries from locked access", async ({
  page,
}) => {
  const state = await accountMock(page);
  await page.locator('.sidebar [data-page="profile"]').click();
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText(/including those events’ attendee records/),
  ).toBeVisible();
  await page
    .getByLabel("Current password", { exact: true })
    .fill("temporary-password");
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await page
    .getByRole("checkbox", { name: /I understand this is permanent/ })
    .check();
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  expect(state.calls).toHaveLength(0);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  state.failed = true;
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "cleanup could not finish",
  );
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");
  await page.reload();
  await expect(page.getByText(/member access is suspended/)).toBeVisible();
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText("Deletion has started and account access is locked.", {
      exact: false,
    }),
  ).toBeVisible();
  state.failed = false;
  await page
    .getByLabel("Current password", { exact: true })
    .fill("temporary-password");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("checkbox", { name: /I understand this is permanent/ })
    .check();
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(
    page.getByRole("button", { name: "Log in / Join", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#toast")).toContainText("have been deleted");
  expect(state.calls.at(-1)).toEqual({
    password: "temporary-password",
    confirmation: "DELETE",
  });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "temporary-password",
  );
});
test("administrator and upcoming-host preconditions prevent deletion submissions", async ({
  page,
}) => {
  const state = await accountMock(page);
  state.admin = true;
  await page.locator('.sidebar [data-page="profile"]').click();
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText(/Administrator accounts need the community owner/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Permanently delete my account" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Keep my account", exact: true })
    .click();
  state.admin = false;
  state.upcoming = 1;
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText(/upcoming published event\(s\) from My hosted events/),
  ).toBeVisible();
  expect(state.calls).toHaveLength(0);
});
test("member homepage, event dialog and admin dashboard meet automated accessibility checks", async ({
  page,
}) => {
  await eventMock(page);
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  let scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => ({
        target: node.target,
        issue: node.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: /View details for/ })
    .first()
    .click();
  scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => ({
        target: node.target,
        issue: node.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await adminMock(page);
  await page.locator('.sidebar [data-page="admin"]').click();
  await expect(
    page.getByRole("heading", { name: "Admin dashboard", exact: true }),
  ).toBeVisible();
  scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => ({
        target: node.target,
        issue: node.failureSummary,
      })),
    })),
  ).toEqual([]);
});
