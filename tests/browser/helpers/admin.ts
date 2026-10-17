import type { Page } from "@playwright/test";
import { authMock, origin, storedSession, userId } from "./auth.ts";
import { memberId, meetupId, eventState } from "./events.ts";
export async function adminMock(
  page: Page,
  options: { admin?: boolean; host?: boolean } = {},
) {
  const store = {
    admin: options.admin ?? true,
    failRead: false,
    failWrite: false,
    event: {
      ...eventState().event,
      host_id: options.host ? userId : memberId,
      approved_count: 1,
      status: "published",
    },
    reports: [
      {
        id: "00000000-0000-4000-8000-000000000030",
        meetup_id: meetupId,
        reporter_id: memberId,
        reporter_name: "Joining friend",
        event_title: "Richmond coffee",
        event_status: "published",
        category: "Safety",
        details: "Please review this specific safety concern.",
        status: "open",
        resolution_note: "",
        reviewer_name: null as string | null,
        reviewed_at: null as string | null,
        created_at: "2026-10-17T12:00:00Z",
      },
    ],
    members: Array.from({ length: 23 }, (_, n) => ({
      id:
        n === 0
          ? userId
          : n === 1
            ? memberId
            : `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`,
      display_name:
        n === 0
          ? "Community admin"
          : n === 1
            ? "Joining friend"
            : `Member ${n}`,
      city: "Richmond",
      created_at: "2026-10-17T12:00:00Z",
      status: "active",
      reason: "",
      is_admin: n === 0,
    })),
    history: [] as {
      id: number;
      actor_name: string;
      action: string;
      target_id: string;
      details: Record<string, unknown>;
      created_at: string;
    }[],
    calls: [] as { action: string; body: Record<string, unknown> }[],
  };
  const log = (
    action: string,
    target: string,
    details: Record<string, unknown>,
  ) =>
    store.history.unshift({
      id: store.history.length + 1,
      actor_name: "Community admin",
      action,
      target_id: target,
      details,
      created_at: new Date().toISOString(),
    });
  const attendees = [
    {
      user_id: memberId,
      display_name: '=HYPERLINK("https://example.test")',
      status: "approved",
      created_at: "2026-10-17T12:00:00Z",
    },
    {
      user_id: "withdrawn-member",
      display_name: "Withdrawn friend",
      status: "cancelled",
      created_at: "2026-10-17T12:00:00Z",
    },
  ];
  await storedSession(page);
  await authMock(page, async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const body =
      request.method() === "POST" ? (request.postDataJSON() ?? {}) : {};
    const json = async (value: unknown, status = 200) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
      return true;
    };
    if (path === "/rest/v1/rpc/get_my_access")
      return json({ status: "active", is_admin: store.admin });
    if (path === "/rest/v1/meetup_directory") return json([store.event]);
    if (path === "/rest/v1/meetup_requests") return json([]);
    if (!path.startsWith("/rest/v1/rpc/")) return false;
    const action = path.split("/").at(-1)!;
    if (
      !action.startsWith("admin_") &&
      ![
        "review_report",
        "set_member_access",
        "moderate_meetup",
        "get_meetup_attendees",
        "export_meetup_attendees",
      ].includes(action)
    )
      return false;
    store.calls.push({ action, body });
    if (
      (action.startsWith("admin_") ||
        ["review_report", "set_member_access", "moderate_meetup"].includes(
          action,
        )) &&
      !store.admin
    )
      return json({ message: "Administrator access is required" }, 403);
    if (store.failRead && action.startsWith("admin_"))
      return json(
        { message: "Administrator tools temporarily unavailable" },
        503,
      );
    if (
      store.failWrite &&
      ["review_report", "set_member_access", "moderate_meetup"].includes(action)
    )
      return json(
        { message: "The change could not be saved. Please retry." },
        503,
      );
    if (action === "admin_statistics")
      return json({
        members: store.members.length,
        active_members: store.members.filter((row) => row.status === "active")
          .length,
        suspended_members: store.members.filter(
          (row) => row.status === "suspended",
        ).length,
        draft_events: 0,
        upcoming_events: store.event.status === "published" ? 1 : 0,
        confirmed_rsvps: store.event.approved_count,
        open_reports: store.reports.filter((row) =>
          ["open", "reviewing"].includes(row.status),
        ).length,
      });
    if (
      action === "admin_list_members" ||
      action === "admin_list_reports" ||
      action === "admin_list_events"
    ) {
      const rows: Record<string, unknown>[] =
        action === "admin_list_members"
          ? store.members
          : action === "admin_list_reports"
            ? store.reports
            : [{ ...store.event, host_status: store.members[1].status }];
      const matching = rows.filter(
        (row) =>
          (body.p_status === "all" || body.p_status === row.status) &&
          (!body.p_search ||
            String(row.id) === body.p_search ||
            String(row.display_name ?? row.event_title ?? row.title)
              .toLowerCase()
              .includes(String(body.p_search).toLowerCase())),
      );
      return json({
        total: matching.length,
        items: matching.slice(
          Number(body.p_offset),
          Number(body.p_offset) + Number(body.p_limit),
        ),
      });
    }
    if (action === "admin_list_audit")
      return json({
        total: store.history.length,
        items: store.history.slice(
          Number(body.p_offset),
          Number(body.p_offset) + 20,
        ),
      });
    if (action === "review_report") {
      Object.assign(store.reports[0], {
        status: body.p_status,
        resolution_note: body.p_note,
        reviewer_name: "Community admin",
        reviewed_at: new Date().toISOString(),
      });
      log("review_report", store.reports[0].id, {
        status: body.p_status,
        note: body.p_note,
      });
      return json(store.reports[0]);
    }
    if (action === "set_member_access") {
      Object.assign(
        store.members.find((row) => row.id === body.p_user_id)!,
        { status: body.p_status, reason: body.p_reason },
      );
      log("member_access", String(body.p_user_id), {
        status: body.p_status,
        reason: body.p_reason,
      });
      return json(null);
    }
    if (action === "moderate_meetup") {
      store.event.status = "removed";
      store.event.approved_count = 0;
      store.reports[0].event_status = "removed";
      attendees[0].status = "cancelled";
      log("event_removed", meetupId, { reason: body.p_reason });
      return json(null);
    }
    if (action === "export_meetup_attendees")
      log("attendee_export", meetupId, { scope: "registration_history" });
    if (
      action === "export_meetup_attendees" ||
      action === "get_meetup_attendees"
    )
      return json(attendees);
    return false;
  });
  await page.goto(origin);
  return store;
}
