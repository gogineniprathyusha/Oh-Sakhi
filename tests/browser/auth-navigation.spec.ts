import { test, expect } from "@playwright/test";
import { authMock, origin } from "./helpers/auth.ts";

for (const action of ["Host your first experience", "+ Create a plan"]) {
  test(`browser Back from ${action} login returns home before Contact`, async ({
    page,
  }) => {
    await authMock(page);
    await page.goto(`${origin}/contact`);
    await page.getByRole("link", { name: "Back to community" }).click();
    await page
      .getByRole("button", { name: action, exact: action.startsWith("+") })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/`);
    await expect(
      page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
    ).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to experiences" }).click();
    await expect(
      page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
    ).toBeVisible();
    // Both ways of dismissing login consume its entry rather than leaving duplicate home entries.
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/contact`);
    await expect(
      page.getByRole("heading", { name: "Contact", exact: true }),
    ).toBeVisible();
  });
}

test("browser Back dismisses signup/reset after reloading login without losing the home URL", async ({
  page,
}) => {
  await authMock(page);
  const home = `${origin}/?campaign=autumn#experiences`;
  await page.goto(home);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  await expect(page).toHaveURL(home);
  await page.goForward();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await page.getByRole("button", { name: "Back to login" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to experiences" }).click();
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
  await expect(page).toHaveURL(home);
});

test("dismissing a directly opened recovery screen stays home instead of returning to Contact", async ({
  page,
}) => {
  await authMock(page);
  await page.goto(`${origin}/contact`);
  await page.goto(`${origin}/?recovery=1&campaign=autumn`);
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to experiences" }).click();
  await expect(page).toHaveURL(`${origin}/?campaign=autumn`);
  await expect(
    page.getByRole("heading", { name: "Create, Connect, Celebrate" }),
  ).toBeVisible();
});
