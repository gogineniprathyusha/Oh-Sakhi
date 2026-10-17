import type {
  AdminTab,
  AdminRecord,
  AdminReport,
  AdminMember,
  AdminEvent,
  AuditEntry,
  AdminSelection,
} from "./types.ts";
import { when } from "./format.ts";
interface Props {
  tab: AdminTab;
  items: AdminRecord[];
  saving: boolean;
  userId: string;
  setSelection: (selection: AdminSelection) => void;
  openEvent: (id: string) => void;
}
export function AdminRecords({
  tab,
  items,
  saving,
  userId,
  setSelection,
  openEvent,
}: Props) {
  return (
    <div className="admin-records">
      {tab === "reports" &&
        (items as AdminReport[]).map((row) => (
          <article className="box" key={row.id}>
            <div className="heading-row">
              <h2>{row.event_title}</h2>
              <span className="badge">{row.status}</span>
            </div>
            <p className="detail-description">{row.details}</p>
            <p>
              {row.category} · {row.reporter_name} · {when(row.created_at)}
            </p>
            <p className="small muted">
              Report ID: {row.id} · Event: {row.event_status}
            </p>
            {row.resolution_note && <p>Review note: {row.resolution_note}</p>}
            <div className="detail-actions">
              <button
                className="btn btn-small"
                disabled={saving}
                onClick={() => setSelection({ kind: "review", report: row })}
              >
                Review report
              </button>
              <button
                className="btn btn-light btn-small"
                disabled={saving}
                onClick={() => openEvent(row.meetup_id)}
              >
                View event
              </button>
              {row.event_status !== "removed" && (
                <button
                  className="btn btn-outline btn-small"
                  disabled={saving}
                  onClick={() =>
                    setSelection({
                      kind: "remove",
                      event: {
                        id: row.meetup_id,
                        title: row.event_title,
                      },
                    })
                  }
                >
                  Remove reported event
                </button>
              )}
            </div>
          </article>
        ))}
      {tab === "members" &&
        (items as AdminMember[]).map((row) => (
          <article className="box" key={row.id}>
            <div className="heading-row">
              <h2>{row.display_name}</h2>
              <span className="badge">
                {row.status}
                {row.is_admin ? " · Administrator" : ""}
              </span>
            </div>
            <p>
              {row.city} · Joined {when(row.created_at)}
            </p>
            <p className="small muted">Member ID: {row.id}</p>
            {row.reason && <p>Latest access reason: {row.reason}</p>}
            {row.is_admin || row.id === userId ? (
              <p className="small muted">
                Administrator access changes are handled by the community owner.
              </p>
            ) : (
              <button
                className="btn btn-outline btn-small"
                disabled={saving}
                onClick={() => setSelection({ kind: "access", member: row })}
              >
                {row.status === "active" ? "Suspend member" : "Restore member"}
              </button>
            )}
          </article>
        ))}
      {tab === "events" &&
        (items as AdminEvent[]).map((row) => (
          <article className="box" key={row.id}>
            <div className="heading-row">
              <h2>{row.title}</h2>
              <span className="badge">{row.status}</span>
            </div>
            <p>
              {when(row.starts_at, row.timezone)} · {row.timezone}
            </p>
            <p>
              Organiser: {row.host_label} · {row.approved_count} /{" "}
              {row.capacity} confirmed seats
            </p>
            {row.host_status === "suspended" && (
              <p className="detail-note">
                Organiser suspended. This event is hidden from public discovery.
              </p>
            )}
            <div className="detail-actions">
              <button
                className="btn btn-small"
                disabled={saving}
                onClick={() => openEvent(row.id)}
              >
                View event
              </button>
              <button
                className="btn btn-light btn-small"
                disabled={saving}
                onClick={() => setSelection({ kind: "attendees", event: row })}
              >
                View attendees
              </button>
              {row.status !== "removed" && (
                <button
                  className="btn btn-outline btn-small"
                  disabled={saving}
                  onClick={() => setSelection({ kind: "remove", event: row })}
                >
                  Remove for a violation
                </button>
              )}
            </div>
          </article>
        ))}
      {tab === "history" &&
        (items as AuditEntry[]).map((row) => (
          <article className="box" key={row.id}>
            <h2>{row.action.replaceAll("_", " ")}</h2>
            <p>
              {row.actor_name ?? "Former member / system"} ·{" "}
              {when(row.created_at)}
            </p>
            <p className="small muted">Target: {row.target_id}</p>
            <dl className="admin-audit-details">
              {Object.entries(row.details).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replaceAll("_", " ")}</dt>
                  <dd>
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
    </div>
  );
}
