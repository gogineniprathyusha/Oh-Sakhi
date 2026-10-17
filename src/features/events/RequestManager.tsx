import type { CommunityEvent, Registration } from "./types.ts";
import { isClosed } from "./utils.ts";
import { seats } from "../../lib/demo-store.ts";
import { AttendeeExport } from "./AttendeeExport.tsx";
interface Props {
  event: CommunityEvent;
  demo: boolean;
  busy: boolean;
  rows: Registration[];
  attendeeError: string;
  addSample: () => void;
  edit: () => void;
  back: () => void;
}
export function RequestManager({
  event: current,
  demo,
  busy,
  rows,
  attendeeError,
  addSample,
  edit,
  back,
}: Props) {
  return (
    <>
      <p className="section-intro">
        {current.capacity - seats(current)} / {current.capacity} confirmed seats
      </p>
      <p className="small muted">
        RSVPs are confirmed immediately while seats are available. Members can
        cancel their own RSVP to release a seat.
      </p>
      {attendeeError && <p role="alert">{attendeeError}</p>}
      {!demo && <AttendeeExport eventId={current.id} />}
      {!rows.length && <p>No RSVPs yet.</p>}
      {rows.map((row) => (
        <div className="request-row" key={row.user_id}>
          <div>
            <strong>{row.display_name ?? row.user_id}</strong>
            <small>
              {row.status === "approved"
                ? "Confirmed"
                : row.status === "pending"
                  ? "Not confirmed"
                  : "Not attending"}
            </small>
          </div>
        </div>
      ))}
      {demo && !isClosed(current, true) && (
        <button
          className="btn btn-outline"
          disabled={busy || seats(current) === 0}
          onClick={addSample}
        >
          Add sample attendee
        </button>
      )}
      {current.host === "You" &&
        ["draft", "published"].includes(current.status ?? "published") && (
          <div className="detail-actions">
            <button className="link-btn" onClick={edit}>
              Edit plan
            </button>
          </div>
        )}
      <button className="btn btn-light" onClick={back}>
        Back to event
      </button>
    </>
  );
}
