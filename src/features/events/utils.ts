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
