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
  isOrganizer: boolean;
  manage: () => void;
  edit: () => void;
  report: () => void;
  moderate: () => void;
  publish: () => void;
  close: () => void;
  request: (event: CommunityEvent) => void;
  withdrawRequest: (event: CommunityEvent) => void;
  cancel: (event: CommunityEvent) => void;
}
export function EventDetails({
  event: current,
  demo,
  busy,
  isAdmin,
  isOrganizer,
  manage,
  edit,
  report,
  moderate,
  publish,
  close,
  request,
  withdrawRequest,
  cancel,
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
              RSVP by{" "}
              {deadlineLabel(current.registration_deadline, current.timezone)}.
              RSVPs are confirmed immediately while seats are available.
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
        {isOrganizer ? (
          <>
            <button className="btn" onClick={manage}>
              View attendees
            </button>
            {["draft", "published"].includes(current.status ?? "published") && (
              <>
                <button className="btn btn-outline" onClick={edit}>
                  Edit plan
                </button>
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => cancel(current)}
                >
                  {demo ? "Cancel this demo plan" : "Cancel event"}
                </button>
              </>
            )}
            {current.status === "draft" && (
              <button className="btn" disabled={busy} onClick={publish}>
                {demo ? "Publish demo plan" : "Publish event"}
              </button>
            )}
          </>
        ) : status(current) === "going" ? (
          <>
            <p role="status">
              {demo
                ? "Your demo spot is confirmed. No real booking was made."
                : "Your spot is confirmed."}
            </p>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => withdrawRequest(current)}
            >
              Cancel my spot
            </button>
          </>
        ) : (
          <button
            className="btn"
            disabled={
              busy || !canRequest(current, demo) || seats(current) === 0
            }
            onClick={() => request(current)}
          >
            {!canRequest(current, demo)
              ? "RSVPs closed"
              : seats(current) === 0
                ? "This plan is full"
                : "RSVP →"}
          </button>
        )}
        {current.request_status === "cancelled" && !isClosed(current, demo) && (
          <p className="small muted">
            Your previous RSVP is not active. You can RSVP again while
            registration is open.
          </p>
        )}
        <button className="btn btn-light" onClick={close}>
          Back to plans
        </button>
        {!demo && !isOrganizer && current.status !== "removed" && (
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
