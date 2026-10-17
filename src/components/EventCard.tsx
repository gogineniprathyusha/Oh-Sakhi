import type { CSSProperties } from "react";
import type { CommunityEvent } from "../features/events/types.ts";
import { status, seats } from "../lib/demo-store.ts";
import { dateLabel, timeLabel } from "../features/events/utils.ts";
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
            ? "⏳ Request pending"
            : event.declined?.includes("demo")
              ? "Request declined"
              : `${seats(event)} spots left`;
  return (
    <article className="event-card">
      <div
        className="event-art"
        style={
          { "--c1": event.colors[0], "--c2": event.colors[1] } as CSSProperties
        }
      >
        <span className="pill">{event.category}</span>
        <span className="art-emoji" aria-hidden="true">
          {event.emoji}
        </span>
      </div>
      <div className="event-body">
        <div className="event-meta">
          {dateLabel(event.date)} · {timeLabel(event.time)}
        </div>
        <h3>{event.title}</h3>
        <p>
          📍 {event.place}
          <br />
          Hosted by {event.host}
        </p>
        {event.details_updated_at && (
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
