import type { Page } from "@playwright/test";
import { authMock, origin, session, userId } from "./auth.ts";
import { pixel } from "./profile.ts";
export const memberId = "00000000-0000-4000-8000-000000000002";
export const meetupId = "00000000-0000-4000-8000-000000000010";
export function eventState() {
  return {
    event: {
      id: meetupId,
      host_id: userId,
      title: "Richmond coffee",
      category: "Coffee",
      event_date: "2030-07-17",
      event_time: "10:30:00",
      place: "Richmond public cafe",
      capacity: 2,
      description: "A friendly gathering at a public cafe in Richmond.",
      host_name: "Local organiser",
      host_label: "Local organiser",
      approved_count: 0,
      status: "published",
      starts_at: "2030-07-17T14:30:00.000Z",
      registration_deadline: "2030-07-17T14:30:00.000Z",
      ends_at: null as string | null,
      timezone: "America/New_York",
      cover_path: null as string | null,
    } as Record<string, unknown>,
    requests: new Map<string, string>(),
    covers: new Set<string>(),
    calls: [] as { action: string; body: Record<string, unknown> }[],
    failCover: false,
  };
}
export async function eventMock(
  page: Page,
  store = eventState(),
  member = false,
) {
  const id = member ? memberId : userId;
  const auth = session();
  auth.user = { ...auth.user, id };
  const payload = Buffer.from(
    JSON.stringify({ sub: id, role: "authenticated", exp: auth.expires_at }),
  ).toString("base64url");
  auth.access_token = `eyJhbGciOiJIUzI1NiJ9.${payload}.testsignature`;
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-her-hour-test-auth-token",
        JSON.stringify(value),
      ),
    auth,
  );
  await authMock(page, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const body =
      req.method() === "POST" || req.method() === "PATCH"
        ? !url.pathname.startsWith("/functions/")
          ? (req.postDataJSON() ?? {})
          : {}
        : {};
    if (url.pathname === "/auth/v1/user") {
      await json(auth.user);
      return true;
    }
    if (url.pathname === "/rest/v1/profiles") {
      await json({
        id,
        display_name: member ? "Joining friend" : "Local organiser",
        bio: "",
        interests: [],
        city: "Richmond",
        neighborhood: "",
      });
      return true;
    }
    if (url.pathname === "/rest/v1/meetup_directory") {
      await json(
        store.event.status === "published" ||
          !member ||
          (store.requests.has(id) && store.event.status !== "removed")
          ? [store.event]
          : [],
      );
      return true;
    }
    if (url.pathname === "/rest/v1/meetup_requests") {
      await json(
        [...store.requests]
          .filter(([key]) => !member || key === id)
          .map(([user_id, status]) => ({
            meetup_id: meetupId,
            user_id,
            status,
          })),
      );
      return true;
    }
    if (url.pathname === "/rest/v1/meetups") {
      if (req.method() === "GET") {
        await json(store.event);
        return true;
      }
      store.calls.push({ action: req.method(), body });
      Object.assign(store.event, body);
      store.event.starts_at = `${String(store.event.event_date)}T14:30:00.000Z`;
      store.event.host_name = store.event.host_label;
      await json({ id: meetupId });
      return true;
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const action = url.pathname.split("/").at(-1)!;
      if (action === "get_meetup_attendees") {
        await json(
          [...store.requests].map(([user_id, status]) => ({
            user_id,
            status,
            display_name: "Joining friend",
          })),
        );
        return true;
      }
      if (action === "set_meetup_status") {
        store.event.status = body.p_status;
        if (body.p_status === "cancelled") {
          for (const key of store.requests.keys())
            store.requests.set(key, "cancelled");
          store.event.approved_count = 0;
        }
      } else if (action === "request_meetup")
        store.requests.set(id, "approved");
      else if (action === "withdraw_meetup_request")
        store.requests.set(id, "cancelled");
      else return false;
      store.event.approved_count = [...store.requests.values()].filter(
        (value) => value === "approved",
      ).length;
      store.calls.push({ action, body });
      await json({
        status: body.p_status ?? store.requests.get(id) ?? "approved",
      });
      return true;
    }
    if (url.pathname === "/functions/v1/event-image") {
      const text = req.postDataBuffer()!.toString("latin1");
      const field = (name: string) =>
        new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(text)?.[1] ?? "";
      const action = field("action");
      store.calls.push({
        action: `cover-${action}`,
        body: { event_id: field("event_id"), previous: field("previous") },
      });
      if (store.failCover) {
        await json(
          {
            error:
              "Cover changes are temporarily unavailable. Please try again.",
          },
          503,
        );
        return true;
      }
      const previous = store.event.cover_path as string | null;
      store.event.cover_path =
        action === "upload" ? `${meetupId}/${crypto.randomUUID()}.webp` : null;
      if (previous) store.covers.delete(previous);
      if (store.event.cover_path)
        store.covers.add(store.event.cover_path as string);
      await json({ path: store.event.cover_path });
      return true;
    }
    if (url.pathname.startsWith("/storage/v1/object/event-covers/")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: pixel,
      });
      return true;
    }
    return false;
  });
  await page.goto(origin);
  return store;
}
