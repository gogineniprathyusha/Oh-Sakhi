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
export const status = (event: CommunityEvent) =>
  event.is_host
    ? "hosting"
    : event.request_status === "approved"
      ? "going"
      : event.request_status === "pending"
        ? "pending"
        : event.request_status === "declined"
          ? "declined"
          : "none";
export const seats = (event: CommunityEvent) =>
  Math.max(0, event.capacity - event.approved_total);
export const isClosed = (event: CommunityEvent) =>
  event.status !== "published" ||
  !(Date.parse(event.starts_at ?? "") > Date.now());
export const canRequest = (event: CommunityEvent) =>
  !isClosed(event) &&
  Date.parse(event.registration_deadline ?? "") > Date.now();
export function availability(event: CommunityEvent, now = Date.now()) {
  if (event.status && event.status !== "published")
    return event.status.charAt(0).toUpperCase() + event.status.slice(1);
  if (Date.parse(event.starts_at ?? "") <= now)
    return event.ends_at && Date.parse(event.ends_at) > now
      ? "In progress"
      : "Past event";
  if (Date.parse(event.registration_deadline ?? "") <= now)
    return "RSVPs closed";
  if (event.approved_total >= event.capacity) return "Full";
  return "Upcoming";
}
