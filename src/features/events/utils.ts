import type { CommunityEvent } from "./types.ts";
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
export const timeLabel = (time: string) =>
  new Date(`2026-01-01T${time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
export const isClosed = (event: CommunityEvent, demo: boolean) =>
  Boolean(event.status && event.status !== "published") ||
  (!demo && Date.parse(event.starts_at ?? "") <= Date.now());
export const canRequest = (event: CommunityEvent, demo: boolean) =>
  !isClosed(event, demo) &&
  (demo || Date.parse(event.registration_deadline ?? "") > Date.now());
export function availability(event: CommunityEvent, now = Date.now()) {
  if (event.status && event.status !== "published")
    return event.status.charAt(0).toUpperCase() + event.status.slice(1);
  if (Date.parse(event.starts_at ?? "") <= now)
    return event.ends_at && Date.parse(event.ends_at) > now
      ? "In progress"
      : "Past event";
  if (Date.parse(event.registration_deadline ?? "") <= now)
    return "Requests closed";
  if (
    (event.approved_total ?? event.attendees + event.approved.length) >=
    event.capacity
  )
    return "Full";
  return "Upcoming";
}
