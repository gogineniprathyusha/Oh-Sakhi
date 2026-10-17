import type {
  CommunityEvent,
  DemoState,
  StorageLike,
} from "../features/events/types.ts";
import { sampleEvents } from "../data/demo-events.ts";

// The six sample meetups and visual themes come from the supplied HTML preview.
// This store is deliberately separate from Supabase and never syncs to an account.
export const STORE = "her-hour-demo-v1";
export const categories = [
  "Coffee",
  "Wellness",
  "Food",
  "Creative",
  "Social",
] as const;
export const themes: Record<string, [string, string, string]> = {
  Coffee: ["☕", "#dcc4bb", "#f5e5da"],
  Wellness: ["🌿", "#c5d5c4", "#e9ede1"],
  Food: ["🍝", "#d6a7a7", "#f7d4c8"],
  Creative: ["🎨", "#e0c3b0", "#f2e1cc"],
  Social: ["✨", "#c8b4cb", "#eee0ef"],
};

export function initialState(): DemoState {
  return {
    profile: {
      name: "Sakhi Member",
      bio: "Here to make real connections in Richmond ✨",
      interests: ["Coffee", "Wellness", "Creative"],
    },
    events: structuredClone(sampleEvents),
  };
}

export const status = (event: CommunityEvent) =>
  event.host === "You"
    ? "hosting"
    : event.approved.includes("demo")
      ? "going"
      : event.pending.includes("demo")
        ? "pending"
        : event.declined?.includes("demo")
          ? "declined"
          : "none";

// Pending requests don't reserve seats. Only approval changes capacity.
export const seats = (event: CommunityEvent) =>
  Math.max(
    0,
    event.capacity -
      (event.approved_total ?? event.attendees + event.approved.length),
  );

export function requestToJoin(event: CommunityEvent) {
  if (
    (event.status && event.status !== "published") ||
    event.declined?.includes("demo") ||
    status(event) !== "none" ||
    seats(event) === 0
  )
    return false;
  event.pending.push("demo");
  return true;
}

export function withdraw(event: CommunityEvent) {
  event.approved = event.approved.filter((id) => id !== "demo");
  event.pending = event.pending.filter((id) => id !== "demo");
}

export function approve(event: CommunityEvent, member: string) {
  if (event.host !== "You" || (event.status && event.status !== "published"))
    return false;
  if (event.approved.includes(member)) return true;
  if (
    (!event.pending.includes(member) && !event.declined?.includes(member)) ||
    seats(event) === 0
  )
    return false;
  event.pending = event.pending.filter((id) => id !== member);
  event.declined = event.declined?.filter((id) => id !== member);
  if (!event.approved.includes(member)) event.approved.push(member);
  return true;
}

export function decline(event: CommunityEvent, member: string) {
  if (
    event.host !== "You" ||
    (event.status && event.status !== "published") ||
    (!event.pending.includes(member) && !event.approved.includes(member))
  )
    return false;
  event.pending = event.pending.filter((id) => id !== member);
  event.approved = event.approved.filter((id) => id !== member);
  event.declined = [...new Set([...(event.declined ?? []), member])];
  return true;
}

export function today() {
  // Meetups belong to Richmond even when the visitor is in another time zone.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const text = (value: unknown, limit: number) =>
  typeof value === "string" && value.length <= limit;
const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => text(item, 250));

// A stale or edited storage entry must not prevent the homepage from loading.
function validState(value: unknown): value is DemoState {
  const data = value as DemoState | null;
  return Boolean(
    data &&
    text(data.profile?.name, 60) &&
    data.profile.name.trim() &&
    text(data.profile.bio, 350) &&
    stringList(data.profile.interests) &&
    Array.isArray(data.events) &&
    data.events.every(
      (event) =>
        text(event.id, 100) &&
        text(event.title, 70) &&
        text(event.description, 700) &&
        text(event.place, 100) &&
        text(event.host, 60) &&
        text(event.emoji, 10) &&
        categories.some((category) => category === event.category) &&
        /^\d{4}-\d{2}-\d{2}$/.test(event.date) &&
        /^\d{2}:\d{2}$/.test(event.time) &&
        Number.isInteger(event.capacity) &&
        event.capacity >= 2 &&
        event.capacity <= 30 &&
        Number.isInteger(event.attendees) &&
        event.attendees >= 0 &&
        stringList(event.approved) &&
        stringList(event.pending) &&
        (event.declined === undefined || stringList(event.declined)) &&
        (event.status === undefined ||
          ["draft", "published", "cancelled", "completed", "removed"].includes(
            event.status,
          )) &&
        Array.isArray(event.colors) &&
        event.colors.length === 2 &&
        event.colors.every((color) => /^#[\da-f]{6}$/i.test(color)),
    ),
  );
}

export function loadState(storage?: StorageLike) {
  try {
    const data = JSON.parse(storage?.getItem?.(STORE) ?? "null");
    return validState(data) ? data : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(storage: StorageLike | undefined, state: DemoState) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(STORE, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
