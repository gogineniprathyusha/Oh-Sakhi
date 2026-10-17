import { useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "../features/admin/admin-api.ts";
import * as community from "../lib/community-api.ts";
import type {
  AdminPage,
  AdminStats,
  AdminTab,
  ReportStatus,
  AdminRecord,
  AdminSelection as Selection,
} from "../features/admin/types.ts";
import type { Registration } from "../features/events/types.ts";
import { AdminRecords } from "../features/admin/AdminRecords.tsx";
import { AdminAction } from "../features/admin/AdminAction.tsx";

const tabs: [AdminTab, string][] = [
  ["overview", "Overview"],
  ["reports", "Reports"],
  ["members", "Members"],
  ["events", "Events"],
  ["history", "History"],
];
const filters: Record<AdminTab, string[]> = {
  overview: [],
  reports: ["all", "open", "reviewing", "resolved", "dismissed"],
  members: ["all", "active", "suspended"],
  events: ["all", "published", "draft", "cancelled", "completed", "removed"],
  history: [],
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to load administrator tools.";
export function Admin({
  userId,
  openEvent,
  communityChanged,
}: {
  userId: string;
  openEvent: (id: string) => void;
  communityChanged: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<AdminTab>("overview"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null),
    [data, setData] = useState<AdminPage<AdminRecord>>({ total: 0, items: [] });
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [selection, setSelection] = useState<Selection | null>(null),
    [attendees, setAttendees] = useState<Registration[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [saving, setSaving] = useState(false),
    [actionError, setActionError] = useState(""),
    [notice, setNotice] = useState("");
  const locked = useRef(false),
    mounted = useRef(true),
    panel = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setStats(null);
    setData({ total: 0, items: [] });
    const list =
      tab === "reports"
        ? api.reports(filter, query, offset)
        : tab === "members"
          ? api.members(filter, query, offset)
          : tab === "events"
            ? api.events(filter, query, offset)
            : tab === "history"
              ? api.audit(offset)
              : Promise.resolve({ total: 0, items: [] });
    void Promise.all([api.statistics(), list])
      .then(([summary, result]) => {
        if (active) {
          setStats(summary);
          setData(result);
        }
      })
      .catch((error) => {
        if (active) setLoadError(errorText(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, filter, query, offset, reload]);
  useEffect(() => {
    setActionError("");
    setAttendees([]);
    setAttendeesLoading(selection?.kind === "attendees");
    panel.current?.focus();
    if (selection?.kind !== "attendees") return;
    let active = true;
    void community
      .attendees(selection.event.id)
      .then((rows) => {
        if (active) setAttendees(rows);
      })
      .catch((error) => {
        if (active) setActionError(errorText(error));
      })
      .finally(() => {
        if (active) setAttendeesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selection]);
  function switchTab(next: AdminTab) {
    setData({ total: 0, items: [] });
    setTab(next);
    setFilter(next === "reports" ? "open" : "all");
    setOffset(0);
    setQuery("");
    setSearch("");
    setSelection(null);
    setNotice("");
  }
  async function change(action: () => Promise<unknown>, success: string) {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      await action();
      if (!mounted.current) return;
      setSelection(null);
      setNotice(success);
      setReload((value) => value + 1);
      await communityChanged();
    } catch (error) {
      if (mounted.current) setActionError(errorText(error));
    } finally {
      locked.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    const form = new FormData(event.currentTarget),
      note = String(form.get("note") ?? "").trim();
    if (selection.kind === "review")
      void change(
        () =>
          api.review(
            selection.report.id,
            String(form.get("status")) as ReportStatus,
            note,
          ),
        "Report review saved.",
      );
    if (selection.kind === "access")
      void change(
        () =>
          api.changeAccess(
            selection.member.id,
            selection.member.status === "active" ? "suspended" : "active",
            note,
          ),
        "Member access updated. Existing registrations and history are preserved.",
      );
    if (
      selection.kind === "remove" &&
      window.confirm(
        "Remove this event for a violation? All active RSVPs will be cancelled and history retained. The organiser cannot republish it.",
      )
    )
      void change(
        () => community.removeEvent(selection.event.id, note),
        "Event removed. Active RSVPs were cancelled and history retained.",
      );
  }
  return (
    <section className="content admin-content">
      <span className="eyebrow">COMMUNITY CARE</span>
      <h1 className="page-title">Admin dashboard</h1>
      <p className="section-intro">
        Review concerns, manage member access and keep gatherings welcoming.
        Members publish directly and RSVPs confirm automatically.
      </p>
      <div
        className="admin-tabs"
        role="group"
        aria-label="Administrator sections"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`chip ${key === tab ? "active" : ""}`}
            aria-pressed={key === tab}
            disabled={saving}
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p className="detail-note" role="status">
          {notice}
        </p>
      )}
      <div className="admin-toolbar">
        {filters[tab].length > 0 && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
              setOffset(0);
              setReload((value) => value + 1);
              setSelection(null);
            }}
          >
            <div className="field">
              <label htmlFor="admin-filter">
                {tab === "reports"
                  ? "Report"
                  : tab === "members"
                    ? "Member"
                    : "Event"}{" "}
                status
              </label>
              <select
                id="admin-filter"
                value={filter}
                disabled={saving}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setOffset(0);
                  setSelection(null);
                }}
              >
                {filters[tab].map((value) => (
                  <option key={value} value={value}>
                    {value === "all" ? "All statuses" : value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="admin-search">
                {tab === "members"
                  ? "Search display name or member ID"
                  : tab === "reports"
                    ? "Search event title or report ID"
                    : "Search event title or event ID"}
              </label>
              <input
                id="admin-search"
                value={search}
                maxLength={100}
                disabled={saving}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <button className="btn btn-small" disabled={saving}>
              Search
            </button>
          </form>
        )}
        <button
          className="btn btn-outline btn-small"
          disabled={loading || saving}
          onClick={() => {
            setSelection(null);
            setReload((value) => value + 1);
          }}
        >
          Refresh dashboard
        </button>
      </div>
      {loading ? (
        <p role="status">Loading administrator tools…</p>
      ) : loadError ? (
        <div className="box" role="alert">
          <h2>Administrator tools unavailable</h2>
          <p>{loadError}</p>
          <p>
            You need an active administrator account. If access should be
            available, contact the community owner.
          </p>
          <button
            className="btn"
            onClick={() => setReload((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {tab === "overview" && stats && (
            <>
              <div className="statrow">
                {(
                  [
                    [stats.members, "Total members"],
                    [stats.active_members, "Active members"],
                    [stats.suspended_members, "Suspended members"],
                    [stats.upcoming_events, "Upcoming public events"],
                    [stats.draft_events, "Draft events"],
                    [stats.confirmed_rsvps, "Confirmed RSVPs · all events"],
                    [stats.open_reports, "Reports to review"],
                  ] as const
                ).map(([value, label]) => (
                  <div className="stat" key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="box">
                <h2>Start with community concerns</h2>
                <p className="section-intro">
                  Review open reports, then record a decision. Removing an event
                  and closing its report are separate actions so each decision
                  has a clear history.
                </p>
                <button className="btn" onClick={() => switchTab("reports")}>
                  Review open reports
                </button>
              </div>
              <p className="small muted">
                Administrator access changes are handled by the community owner.
              </p>
            </>
          )}
          {selection && (
            <AdminAction
              selection={selection}
              panel={panel}
              saving={saving}
              attendees={attendees}
              attendeesLoading={attendeesLoading}
              actionError={actionError}
              submit={submit}
              setSelection={setSelection}
            />
          )}
          {tab !== "overview" && (
            <>
              <p className="small muted" role="status">
                {data.total === 0
                  ? "No matching records."
                  : `${offset + 1}–${Math.min(offset + 20, data.total)} of ${data.total} records`}
              </p>
              <AdminRecords
                tab={tab}
                items={data.items}
                saving={saving}
                userId={userId}
                setSelection={setSelection}
                openEvent={openEvent}
              />
              <div className="detail-actions">
                <button
                  className="btn btn-outline btn-small"
                  disabled={offset === 0 || saving}
                  onClick={() => {
                    setOffset((value) => Math.max(0, value - 20));
                    setSelection(null);
                  }}
                >
                  Previous page
                </button>
                <button
                  className="btn btn-outline btn-small"
                  disabled={offset + 20 >= data.total || saving}
                  onClick={() => {
                    setOffset((value) => value + 20);
                    setSelection(null);
                  }}
                >
                  Next page
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
