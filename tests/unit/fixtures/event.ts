import type { CommunityEvent } from "../../../src/features/events/types.ts";
export const eventFixture = (): CommunityEvent => ({
  id: "test-event",
  title: "Richmond gathering",
  category: "Coffee",
  date: "2030-07-17",
  time: "10:30",
  place: "Public cafe",
  capacity: 8,
  description: "Meet for coffee and conversation.",
  host: "Local organiser",
  emoji: "☕",
  colors: ["#dcc4bb", "#f5e5da"],
  approved_total: 2,
  is_host: false,
  status: "published",
  starts_at: "2030-07-17T14:30:00Z",
  registration_deadline: "2030-07-17T14:30:00Z",
});
