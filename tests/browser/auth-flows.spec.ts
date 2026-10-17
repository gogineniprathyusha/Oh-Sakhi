import { test, expect } from "@playwright/test";
import { authMock, origin, session, storedSession } from "./helpers/auth.ts";

test("password recovery survives a reload with its existing recovery session", async ({
  page,
}) => {
  await authMock(page);
  await storedSession(page);
  await page.goto(`${origin}/?recovery=1`);
  await expect(
    page.getByRole("heading", { name: "Choose a new password", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose a new password", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("new-test-password");
  await page
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
  await expect(page.locator("#toast")).toHaveText("Password updated");
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.locator('.sidebar [data-page="host"]')).toBeVisible();
});

test("a valid recovery callback opens the password form", async ({ page }) => {
  await authMock(page);
  const value = session();
  const hash = new URLSearchParams({
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_in: "3600",
    token_type: "bearer",
    type: "recovery",
  });
  await page.goto(`${origin}/?recovery=1#${hash}`);
  await expect(
    page.getByRole("heading", { name: "Choose a new password", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/access_token/);
});

test("an expired recovery callback explains the error and offers another reset", async ({
  page,
}) => {
  await authMock(page);
  await page.goto(
    `${origin}/?recovery=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
  );
  await expect(page.getByRole("alert")).toContainText(/expired/i);
  await expect(
    page.getByRole("button", { name: "Send reset link", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save new password", exact: true }),
  ).toHaveCount(0);
});

test("a recovery URL without a session cannot offer a password update", async ({
  page,
}) => {
  await authMock(page);
  await page.goto(`${origin}/?recovery=1`);
  await expect(page.getByRole("alert")).toContainText(/new.*link|expired/i);
  await expect(
    page.getByRole("button", { name: "Send reset link", exact: true }),
  ).toBeVisible();
});

test("signup rejects whitespace-only display names before making an account", async ({
  page,
}) => {
  let submissions = 0;
  await authMock(page, async (route) => {
    if (new URL(route.request().url()).pathname === "/auth/v1/signup")
      submissions++;
    return false;
  });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Display name").fill("   ");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page
    .getByRole("button", { name: "Create my account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("display name");
  expect(submissions).toBe(0);
});

test("signup requests confirmation and never submits client-controlled roles", async ({
  page,
}) => {
  let body: Record<string, unknown> | undefined;
  await authMock(page, async (route) => {
    if (new URL(route.request().url()).pathname === "/auth/v1/signup")
      body = route.request().postDataJSON();
    return false;
  });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Display name").fill(" New member ");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page
    .getByRole("button", { name: "Create my account", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Check your inbox" }),
  ).toBeVisible();
  expect(body?.data).toEqual({ display_name: "New member" });
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
});

test("password reset requests use the app recovery redirect and show a generic notice", async ({
  page,
}) => {
  let redirect: string | null = null;
  await authMock(page, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/recover")
      redirect = url.searchParams.get("redirect_to");
    return false;
  });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "If an account exists" }),
  ).toBeVisible();
  expect(redirect).toBe(`${origin}/?recovery=1`);
});

test("invalid credentials stay on login and show the server error", async ({
  page,
}) => {
  await authMock(page, async (route) => {
    if (new URL(route.request().url()).pathname !== "/auth/v1/token")
      return false;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
    });
    return true;
  });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid login credentials",
  );
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
});

test("a suspended member sees an access message and can log out", async ({
  page,
}) => {
  await authMock(page, async (route) => {
    if (
      new URL(route.request().url()).pathname !== "/rest/v1/rpc/get_my_access"
    )
      return false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "suspended", is_admin: false }),
    });
    return true;
  });
  await storedSession(page);
  await page.goto(origin);
  await expect(page.locator(".content")).toContainText(
    "Your member access is suspended",
  );
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in / Join", exact: true }),
  ).toBeVisible();
});

test("a rejected expired session is cleared and a fresh login remains available", async ({
  page,
}) => {
  const value = session();
  value.expires_at = Math.floor(Date.now() / 1000) - 120;
  const payload = Buffer.from(
    JSON.stringify({
      sub: value.user.id,
      role: "authenticated",
      exp: value.expires_at,
    }),
  ).toString("base64url");
  value.access_token = `eyJhbGciOiJIUzI1NiJ9.${payload}.expiredtestsignature`;
  await page.addInitScript(
    (data) =>
      localStorage.setItem("sb-her-hour-test-auth-token", JSON.stringify(data)),
    value,
  );
  let privateReads = 0;
  await authMock(page, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/rest/v1/profiles") privateReads++;
    if (
      url.pathname !== "/auth/v1/token" ||
      url.searchParams.get("grant_type") !== "refresh_token"
    )
      return false;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "refresh_token_not_found",
        msg: "Invalid Refresh Token: Refresh Token Not Found",
      }),
    });
    return true;
  });
  await page.goto(origin);
  await expect(
    page.getByRole("button", { name: "Log in / Join", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("sb-her-hour-test-auth-token"),
    ),
  ).toBeNull();
  expect(privateReads).toBe(0);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator('.sidebar [data-page="host"]')).toBeVisible();
});

test("session restoration waits for token refresh before exposing member pages", async ({
  page,
}) => {
  const value = session();
  value.expires_at = Math.floor(Date.now() / 1000) - 120;
  const payload = Buffer.from(
    JSON.stringify({
      sub: value.user.id,
      role: "authenticated",
      exp: value.expires_at,
    }),
  ).toString("base64url");
  value.access_token = `eyJhbGciOiJIUzI1NiJ9.${payload}.expiredtestsignature`;
  await page.addInitScript(
    (data) =>
      localStorage.setItem("sb-her-hour-test-auth-token", JSON.stringify(data)),
    value,
  );
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested = new Promise<void>((resolve) => {
      started = resolve;
    });
  await authMock(page, async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "refresh_token"
    ) {
      started();
      await gate;
    }
    return false;
  });
  await page.goto(origin);
  await requested;
  try {
    await expect(page.getByRole("status")).toContainText(
      "Checking your session",
    );
    await expect(page.locator(".sidebar")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('.sidebar [data-page="host"]')).toBeVisible();
});
