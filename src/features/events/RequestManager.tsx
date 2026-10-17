import type { CommunityEvent, Registration } from "./types.ts";
import { isClosed } from "./utils.ts";
import { seats } from "../../lib/demo-store.ts";
interface Props {
  event: CommunityEvent;
  demo: boolean;
  busy: boolean;
  rows: Registration[];
  attendeeError: string;
  decide: (
    event: CommunityEvent,
    member: string,
    decision: "approved" | "declined",
  ) => void;
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
  decide,
  addSample,
  edit,
  back,
}: Props) {
  return (
    <>
      <p className="section-intro">
        {current.capacity - seats(current)} / {current.capacity} approved seats
      </p>
      <p className="small muted">
        Only the event organiser decides who attends. Pending requests do not
        reserve seats.
      </p>
      {attendeeError && <p role="alert">{attendeeError}</p>}
      {!rows.length && <p>No requests yet.</p>}
      {rows.map((row) => (
        <div className="request-row" key={row.user_id}>
          <div>
            <strong>{row.display_name ?? row.user_id}</strong>
            <small>{row.status}</small>
          </div>
          <div className="detail-actions">
            {!isClosed(current, demo) &&
              current.host === "You" &&
              row.status !== "cancelled" && (
                <>
                  {row.status !== "approved" && (
                    <button
                      className="btn btn-small"
                      disabled={busy || seats(current) === 0}
                      onClick={() => decide(current, row.user_id, "approved")}
                    >
                      {row.status === "declined" ? "Approve again" : "Approve"}
                    </button>
                  )}
                  {row.status !== "declined" && (
                    <button
                      className="btn btn-outline btn-small"
                      disabled={busy}
                      onClick={() => decide(current, row.user_id, "declined")}
                    >
                      {row.status === "approved"
                        ? "Revoke approval"
                        : "Decline"}
                    </button>
                  )}
                </>
              )}
          </div>
        </div>
      ))}
      {demo && !isClosed(current, true) && (
        <button
          className="btn btn-outline"
          disabled={busy || seats(current) === 0}
          onClick={addSample}
        >
          Add sample request
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
