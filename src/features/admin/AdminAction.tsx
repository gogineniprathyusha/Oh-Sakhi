import type { FormEvent, RefObject } from "react";
import type { AdminSelection as Selection } from "./types.ts";
import type { Registration } from "../events/types.ts";
import { AttendeeExport } from "../events/AttendeeExport.tsx";
import { when } from "./format.ts";
const filters = { reports: ["open", "reviewing", "resolved", "dismissed"] };
interface Props {
  selection: Selection;
  panel: RefObject<HTMLHeadingElement | null>;
  saving: boolean;
  attendees: Registration[];
  attendeesLoading: boolean;
  actionError: string;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  setSelection: (selection: Selection | null) => void;
}
export function AdminAction({
  selection,
  panel,
  saving,
  attendees,
  attendeesLoading,
  actionError,
  submit,
  setSelection,
}: Props) {
  return (
    <>
      {selection && (
        <div className="box admin-action">
          <h2 ref={panel} tabIndex={-1}>
            {selection.kind === "review"
              ? "Review report"
              : selection.kind === "access"
                ? `${selection.member.status === "active" ? "Suspend" : "Restore"} member access`
                : selection.kind === "remove"
                  ? "Remove event for a violation"
                  : "Event attendees"}
          </h2>
          <p>
            {selection.kind === "review"
              ? selection.report.event_title
              : selection.kind === "access"
                ? selection.member.display_name
                : selection.event.title}
          </p>
          {selection.kind === "review" && (
            <>
              <p className="detail-description">{selection.report.details}</p>
              <p className="small muted">
                Reported by {selection.report.reporter_name} ·{" "}
                {selection.report.category}
              </p>
              {selection.report.reviewer_name && (
                <p>
                  Last reviewed by {selection.report.reviewer_name}
                  {selection.report.reviewed_at
                    ? ` · ${when(selection.report.reviewed_at)}`
                    : ""}
                </p>
              )}
            </>
          )}
          {selection.kind === "access" && (
            <p className="section-intro">
              Suspension blocks member features and hides their events from
              discovery. It does not delete or cancel registrations. Review
              their events separately if removal is needed. Restoring access
              makes eligible published events visible again.
            </p>
          )}
          {selection.kind === "remove" && (
            <p className="section-intro">
              This hides the event and cancels active RSVPs. History stays
              available. The organiser cannot republish a removed event.
            </p>
          )}
          {selection.kind === "attendees" ? (
            <>
              <p className="small muted">
                Member information is private. Share exports only with
                authorised organisers.
              </p>
              {attendeesLoading && <p role="status">Loading attendees…</p>}
              {!attendeesLoading && !actionError && attendees.length === 0 && (
                <p>No RSVPs yet.</p>
              )}
              {actionError && (
                <button
                  className="btn btn-outline btn-small"
                  onClick={() => setSelection({ ...selection })}
                >
                  Retry attendee list
                </button>
              )}
              {attendees.map((row) => (
                <div className="request-row" key={row.user_id}>
                  <strong>{row.display_name ?? row.user_id}</strong>
                  <span>
                    {row.status === "approved"
                      ? "Confirmed"
                      : row.status === "cancelled"
                        ? "Cancelled"
                        : "Not attending"}
                  </span>
                </div>
              ))}
              <AttendeeExport eventId={selection.event.id} />
            </>
          ) : (
            <form
              key={
                selection.kind === "review"
                  ? selection.report.id
                  : selection.kind === "access"
                    ? selection.member.id
                    : selection.event.id
              }
              onSubmit={submit}
            >
              {selection.kind === "review" && (
                <div className="field">
                  <label htmlFor="review-status">Review status</label>
                  <select
                    name="status"
                    id="review-status"
                    defaultValue={selection.report.status}
                    disabled={saving}
                  >
                    {filters.reports
                      .filter((value) => value !== "all")
                      .map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="admin-note">
                  {selection.kind === "review" ? "Review note" : "Reason"} (10–
                  {selection.kind === "access" ? 500 : 1000} characters)
                </label>
                <textarea
                  id="admin-note"
                  name="note"
                  required
                  minLength={10}
                  maxLength={selection.kind === "access" ? 500 : 1000}
                  defaultValue={
                    selection.kind === "review"
                      ? selection.report.resolution_note
                      : ""
                  }
                  disabled={saving}
                />
              </div>
              <button className="btn" disabled={saving}>
                {saving
                  ? "Saving…"
                  : selection.kind === "review"
                    ? "Save review"
                    : selection.kind === "access"
                      ? "Confirm access change"
                      : "Confirm event removal"}
              </button>
            </form>
          )}
          {actionError && <p role="alert">{actionError}</p>}
          <button
            className="link-btn"
            disabled={saving}
            onClick={() => setSelection(null)}
          >
            Close action
          </button>
        </div>
      )}
    </>
  );
}
