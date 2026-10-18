import type { CommunityEvent, Registration } from "./types.ts";
import { seats } from "./utils.ts";
import { AttendeeExport } from "./AttendeeExport.tsx";
import { MemberAvatar } from "../../components/MemberAvatar.tsx";
interface Props {
  event: CommunityEvent;
  rows: Registration[];
  attendeeError: string;
  edit: () => void;
  back: () => void;
}
export function RequestManager({
  event: current,
  rows,
  attendeeError,
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
      <AttendeeExport eventId={current.id} />
      {!rows.length && <p>No RSVPs yet.</p>}
      {rows.map((row) => (
        <div className="request-row" key={row.user_id}>
          <div className="request-member">
            <MemberAvatar
              name={row.display_name ?? "Member"}
              userId={row.user_id}
              path={row.avatar_path}
            />
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
        </div>
      ))}
      {current.is_host &&
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
