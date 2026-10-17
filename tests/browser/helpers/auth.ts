import type { Page, Route } from "@playwright/test";
export const origin = "http://127.0.0.1:5184";
export const userId = "00000000-0000-4000-8000-000000000001";
export const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-10-13T12:00:00Z",
};
export function session() {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, role: "authenticated", exp: expires_at }),
  ).toString("base64url");
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.testsignature`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at,
    refresh_token: "test-refresh",
    user,
  };
}
export async function storedSession(page: Page) {
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-her-hour-test-auth-token",
        JSON.stringify(value),
      ),
    session(),
  );
}
export async function authMock(
  page: Page,
  handler?: (route: Route) => Promise<boolean>,
) {
  await page.route("https://her-hour-test.supabase.co/**", async (route) => {
    if (await handler?.(route)) return;
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/auth/v1/token") return json(session());
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname === "/auth/v1/signup")
      return json({
        ...user,
        identities: [{ id: userId }],
        confirmation_sent_at: new Date().toISOString(),
      });
    if (url.pathname === "/auth/v1/recover") return json({});
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204 });
    if (url.pathname === "/rest/v1/profiles")
      return json({
        id: userId,
        display_name: "Test member",
        bio: "",
        interests: [],
        city: "Richmond",
      });
    if (url.pathname === "/rest/v1/rpc/get_my_access")
      return json({ status: "active", is_admin: false });
    if (
      ["/rest/v1/meetup_directory", "/rest/v1/meetup_requests"].includes(
        url.pathname,
      )
    )
      return json([]);
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Unexpected auth fixture request ${url.pathname}`,
      }),
    });
  });
}
