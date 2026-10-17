import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:5184";
const userId = "00000000-0000-4000-8000-000000000001";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-10-13T12:00:00Z",
};

test("configured guests can explore demo, sign in, use member data and sign out without mixing stores", async ({
  page,
}) => {
  const errors: string[] = [],
    writes: Record<string, unknown>[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let member = {
    id: userId,
    display_name: "Real account",
    bio: "Stored in the test backend",
    interests: ["Books"],
    city: "Richmond",
  };
  await page.route("https://her-hour-test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/auth/v1/token") {
      const payload = Buffer.from(
        JSON.stringify({
          sub: userId,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
      return json({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.testsignature`,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh",
        user,
      });
    }
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204 });
    if (url.pathname === "/rest/v1/profiles") {
      if (request.method() === "PATCH") {
        writes.push(request.postDataJSON());
        member = { ...member, ...request.postDataJSON() };
        return json({ id: userId });
      }
      return json(
        url.searchParams.get("select") === "*"
          ? member
          : [{ id: userId, display_name: member.display_name }],
      );
    }
    if (url.pathname === "/rest/v1/interests")
      return json([{ id: "books", name: "Books" }]);
    if (url.pathname === "/rest/v1/rpc/get_my_access")
      return json({ status: "active", is_admin: false });
    if (url.pathname === "/rest/v1/meetup_directory") return json([]);
    if (url.pathname === "/rest/v1/meetup_requests") return json([]);
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Unexpected test request ${url.pathname}`,
      }),
    });
  });
  await page.goto(origin);
  await expect(page.locator(".event-card")).toHaveCount(6);
  await page.locator('.sidebar [data-page="profile"]').click();
  await page
    .getByLabel("Your first name or display name")
    .fill("Browser-only friend");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page.locator(".event-card")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await page.locator('.sidebar [data-page="profile"]').click();
  await expect(page.locator("#profile-name")).toHaveValue("Real account");
  await expect(page.locator("#profile-bio")).toHaveValue(
    "Stored in the test backend",
  );
  await page.locator("#profile-name").fill("Updated account");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("Profile saved");
  expect(writes).toHaveLength(1);
  expect(writes[0].display_name).toBe("Updated account");
  await page.reload();
  await page.locator('.sidebar [data-page="profile"]').click();
  await expect(page.locator("#profile-name")).toHaveValue("Updated account");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.locator(".demo-banner")).toBeVisible();
  await page.locator('.sidebar [data-page="profile"]').click();
  await expect(page.getByLabel("Your first name or display name")).toHaveValue(
    "Browser-only friend",
  );
  expect(errors).toEqual([]);
});

test("configured registration and reset forms remain reachable from the preview", async ({
  page,
}) => {
  await page.route("https://her-hour-test.supabase.co/**", (route) =>
    route.abort(),
  );
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create my account" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to login" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page.locator(".event-card")).toHaveCount(6);
});

test("real organiser screens publish and edit through the event API and use seat decision RPCs", async ({
  page,
}) => {
  const eventId = "00000000-0000-4000-8000-000000000010";
  const attendeeId = "00000000-0000-4000-8000-000000000020";
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  let event: Record<string, unknown> | null = null;
  let decision = "pending";
  await page.route("https://her-hour-test.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (request.method() !== "GET")
      calls.push({
        path: url.pathname,
        method: request.method(),
        body: request.postDataJSON() ?? {},
      });
    if (url.pathname === "/auth/v1/token") {
      const payload = Buffer.from(
        JSON.stringify({
          sub: userId,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
      return json({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.testsignature`,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh",
        user,
      });
    }
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname === "/rest/v1/profiles")
      return json({
        id: userId,
        display_name: "Test organiser",
        bio: "Coffee and connection",
        interests: ["Coffee"],
        city: "Richmond",
      });
    if (url.pathname === "/rest/v1/interests")
      return json([{ id: "books", name: "Books" }]);
    if (url.pathname === "/rest/v1/rpc/get_my_access")
      return json({ status: "active", is_admin: false });
    if (url.pathname === "/rest/v1/meetup_directory")
      return json(event ? [event] : []);
    if (url.pathname === "/rest/v1/meetup_requests") return json([]);
    if (url.pathname === "/rest/v1/meetups") {
      const input = request.postDataJSON() as Record<string, unknown>;
      if (request.method() === "POST")
        event = {
          ...input,
          id: eventId,
          host_id: userId,
          host_name: "Her Hour host",
          approved_count: 0,
          status: "published",
          starts_at: "2099-10-17T14:30:00Z",
          registration_deadline: "2099-10-17T14:30:00Z",
        };
      if (request.method() === "PATCH")
        event = {
          ...event,
          ...input,
          details_updated_at: "2026-10-17T16:00:00Z",
        };
      return json({ id: eventId });
    }
    if (url.pathname === "/rest/v1/rpc/get_meetup_attendees")
      return json([
        {
          user_id: attendeeId,
          display_name: "Joining friend",
          status: decision,
          created_at: "2026-10-17T16:00:00Z",
        },
      ]);
    if (url.pathname === "/rest/v1/rpc/decide_meetup_request") {
      decision = request.postDataJSON().p_decision;
      event = { ...event, approved_count: decision === "approved" ? 1 : 0 };
      return json({ status: decision });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Unexpected test request ${url.pathname}`,
      }),
    });
  });
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in / Join", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator('.sidebar [data-page="host"]')).toBeVisible();
  await page
    .getByRole("button", { name: "+ Host a plan", exact: true })
    .click();
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Real organiser coffee");
  await page.getByLabel("Date", { exact: true }).fill("2099-10-17");
  await page.getByLabel("Time (Richmond)").fill("10:30");
  await page.getByLabel("Area / meeting place").fill("Richmond public cafe");
  await page
    .getByLabel("Tell us about your plan")
    .fill("Meet new friends over coffee at a public cafe.");
  await page
    .getByRole("button", { name: "Publish event", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View details for Real organiser coffee" })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove for a violation" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Manage requests", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Joining friend");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 / 8 approved seats");
  await page
    .getByRole("button", { name: "Revoke approval", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("0 / 8 approved seats");
  await page
    .getByRole("button", { name: "Approve again", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("1 / 8 approved seats");
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Area / meeting place").fill("Another public cafe");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "View details for Real organiser coffee" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Another public cafe");
  await expect(page.getByRole("dialog")).toContainText("7 of 8 spots left");
  const create = calls.find(
    (call) => call.path === "/rest/v1/meetups" && call.method === "POST",
  );
  expect(create?.body.host_id).toBe(userId);
  expect(create?.body.status).toBe("published"); // The organiser publishes without an admin step.
  const edit = calls.find(
    (call) => call.path === "/rest/v1/meetups" && call.method === "PATCH",
  );
  expect(edit?.body.status).toBeUndefined(); // Editing content must not change publication.
  expect(
    calls.filter((call) => call.path === "/rest/v1/meetup_requests"),
  ).toHaveLength(0);
  expect(
    calls
      .filter((call) => call.path === "/rest/v1/rpc/decide_meetup_request")
      .map((call) => call.body),
  ).toEqual([
    { p_meetup_id: eventId, p_user_id: attendeeId, p_decision: "approved" },
    { p_meetup_id: eventId, p_user_id: attendeeId, p_decision: "declined" },
    { p_meetup_id: eventId, p_user_id: attendeeId, p_decision: "approved" },
  ]);
});
