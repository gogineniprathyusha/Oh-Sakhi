import type { CSSProperties } from "react";
import type { CommunityEvent } from "./types.ts";
import { useEventCover } from "../../hooks/useEventCover.ts";
export function EventArtwork({
  event,
  detail = false,
}: {
  event: CommunityEvent;
  detail?: boolean;
}) {
  const url = useEventCover(event.cover_path);
  return (
    <div
      className={detail ? "detail-hero" : "event-art"}
      style={
        {
          "--c1": event.colors[0],
          "--c2": event.colors[1],
          ...(detail
            ? {
                background: `linear-gradient(135deg,${event.colors[0]},${event.colors[1]})`,
              }
            : {}),
        } as CSSProperties
      }
    >
      {url && <img className="event-cover" src={url} alt="" loading="lazy" />}
      {!detail && <span className="pill">{event.category}</span>}
      {!url && (
        <span className={detail ? undefined : "art-emoji"} aria-hidden="true">
          {event.emoji}
        </span>
      )}
    </div>
  );
}
