import type { CommunityEvent } from "../features/events/types.ts";
import { status, seats } from "../features/events/utils.ts";
import { dateLabel, timeLabel } from "../features/events/utils.ts";
import { EventArtwork } from "../features/events/EventArtwork.tsx";
export function EventCard({
  event,
  open,
}: {
  event: CommunityEvent;
  open: (id: string) => void;
}) {
  const state = status(event);
  const label =
    event.status &&
    ["cancelled", "removed", "draft", "completed"].includes(event.status)
      ? event.status.charAt(0).toUpperCase() + event.status.slice(1)
      : state === "hosting"
        ? "You are hosting"
        : state === "going"
          ? "✓ You’re going"
          : state === "pending"
            ? "RSVP not confirmed"
            : state === "declined"
              ? "Not attending"
              : event.request_status === "cancelled"
                ? "RSVP cancelled"
                : `${seats(event)} spots left`;
  return (
    <article className="event-card">
      <EventArtwork event={event} />
      <div className="event-body">
        <div className="event-meta">
          {dateLabel(event.date)} · {timeLabel(event)}
        </div>
        <h3>{event.title}</h3>
        <p className="event-venue">📍 {event.place}</p>
        <p className="event-description">{event.description}</p>
        <p>Hosted by {event.is_host ? "You" : event.host}</p>
        {event.details_updated_at && !event.is_host && (
          <span className="small muted">
            Details updated — please review your plan.
          </span>
        )}
        <div className="event-footer">
          <span>{label}</span>
          <button
            className="link-btn"
            aria-label={`View details for ${event.title}`}
            onClick={() => open(event.id)}
          >
            View details ↗
          </button>
        </div>
      </div>
    </article>
  );
}
