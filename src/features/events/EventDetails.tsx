import type { CommunityEvent } from "./types.ts";
import { canRequest, dateLabel, isClosed, timeLabel } from "./utils.ts";
import { seats, status } from "../../lib/demo-store.ts";
import { EventArtwork } from "./EventArtwork.tsx";
import { deadlineLabel } from "./time.ts";
import { availability } from "./utils.ts";
interface Props {
  event: CommunityEvent;
  demo: boolean;
  busy: boolean;
  isAdmin: boolean;
  manage: () => void;
  edit: () => void;
  report: () => void;
  moderate: () => void;
  publish: () => void;
  close: () => void;
  request: (event: CommunityEvent) => void;
  withdrawRequest: (event: CommunityEvent) => void;
}
export function EventDetails({
  event: current,
  demo,
  busy,
  isAdmin,
  manage,
  edit,
  report,
  moderate,
  publish,
  close,
  request,
  withdrawRequest,
}: Props) {
  return (
    <>
      <EventArtwork event={current} detail />
      <div className="detail-info">
        <span>
          🗓 {dateLabel(current.date)} · {timeLabel(current.time)}
        </span>
        <span>📍 {current.place}</span>
        <span>
          👥 {seats(current)} of {current.capacity} spots left
        </span>
      </div>
      {!demo && (
        <p className="small muted">
          {availability(current)} · {current.timezone ?? "America/New_York"}{" "}
          (Richmond)
          {current.ends_at && (
            <> · Ends {deadlineLabel(current.ends_at, current.timezone)}</>
          )}
          {current.registration_deadline && (
            <>
              <br />
              Request by{" "}
              {deadlineLabel(current.registration_deadline, current.timezone)}.
              Requests need organiser approval.
            </>
          )}
        </p>
      )}
      <p className="detail-description">{current.description}</p>
      <div className="detail-note">
        <strong>
          Hosted by {current.host}
          {demo ? " · Sample meetup" : ""}
        </strong>
        {demo && (
          <>
            <br />
            Demo only. Changes stay in this browser. No real event or booking is
            created.
          </>
        )}
      </div>
      {current.details_updated_at && (
        <p className="small muted">
          Details updated by the organiser. Please review the date, time and
          venue before attending.
        </p>
      )}
      {current.status === "removed" ? (
        <p role="status">
          This event was removed for a community violation. It cannot be
          republished.
        </p>
      ) : isClosed(current, demo) ? (
        <p role="status">
          This plan is{" "}
          {current.status === "cancelled"
            ? "cancelled"
            : current.status === "draft"
              ? "saved as a draft"
              : "closed"}
          .
        </p>
      ) : null}
      <div className="detail-actions">
        {current.host === "You" ? (
          <>
            <button className="btn" onClick={manage}>
              Manage requests
            </button>
            {["draft", "published"].includes(current.status ?? "published") && (
              <button className="btn btn-outline" onClick={edit}>
                Edit plan
              </button>
            )}
            {current.status === "draft" && (
              <button className="btn" disabled={busy} onClick={publish}>
                {demo ? "Publish demo plan" : "Publish event"}
              </button>
            )}
          </>
        ) : status(current) === "going" || status(current) === "pending" ? (
          <>
            <p role="status">
              {status(current) === "pending"
                ? demo
                  ? "Your demo request is pending. No host has been contacted."
                  : "Your request is waiting for the organiser’s decision."
                : "You have an approved spot."}
            </p>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => withdrawRequest(current)}
            >
              {status(current) === "going"
                ? "Cancel my spot"
                : "Withdraw request"}
            </button>
          </>
        ) : current.declined?.includes("demo") ? (
          <p>Your request was declined. The organiser can reconsider it.</p>
        ) : (
          <button
            className="btn"
            disabled={
              busy || !canRequest(current, demo) || seats(current) === 0
            }
            onClick={() => request(current)}
          >
            {!canRequest(current, demo)
              ? "Requests closed"
              : seats(current) === 0
                ? "This plan is full"
                : "Request to join →"}
          </button>
        )}
        {current.request_status === "cancelled" && !isClosed(current, demo) && (
          <p className="small muted">
            You withdrew your previous request. You can request again while
            registration is open.
          </p>
        )}
        <button className="btn btn-light" onClick={close}>
          Back to plans
        </button>
        {!demo && current.status !== "removed" && (
          <button className="link-btn" onClick={report}>
            Report this event
          </button>
        )}
        {!demo && isAdmin && current.status !== "removed" && (
          <button className="link-btn" onClick={moderate}>
            Remove for a violation
          </button>
        )}
      </div>
    </>
  );
}
