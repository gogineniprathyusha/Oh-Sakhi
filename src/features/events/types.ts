export type EventStatus =
  "draft" | "published" | "cancelled" | "completed" | "removed";
export type RequestStatus = "pending" | "approved" | "declined" | "cancelled";
export type Page = "discover" | "myplans" | "host" | "circle" | "profile";
export type AuthMode = "login" | "signup" | "reset" | "update";
export interface Profile {
  name: string;
  bio: string;
  interests: string[];
  city?: string;
  neighborhood?: string;
}
export interface CommunityEvent {
  id: string;
  title: string;
  category: string;
  date: string;
  time: string;
  place: string;
  capacity: number;
  description: string;
  host: string;
  emoji: string;
  colors: [string, string];
  attendees: number;
  approved: string[];
  pending: string[];
  declined?: string[];
  host_id?: string;
  status?: EventStatus;
  starts_at?: string;
  registration_deadline?: string;
  approved_total?: number;
  details_updated_at?: string;
}
export interface DemoState {
  profile: Profile;
  events: CommunityEvent[];
}
export interface StorageLike {
  getItem?(key: string): string | null | undefined;
  setItem?(key: string, value: string): unknown;
}
export interface Registration {
  user_id: string;
  display_name?: string;
  status: RequestStatus;
  created_at?: string;
}
export type EventInput = Pick<
  CommunityEvent,
  "title" | "category" | "date" | "time" | "place" | "capacity" | "description"
>;
export interface MeetupRow {
  id: string;
  host_id: string;
  title: string;
  category: string;
  event_date: string;
  event_time: string;
  place: string;
  capacity: number;
  description: string;
  host_name: string;
  host_label: string;
  approved_count: number;
  status: EventStatus;
  starts_at: string;
  registration_deadline: string;
  details_updated_at?: string;
}
export interface RequestRow {
  meetup_id: string;
  user_id: string;
  status: RequestStatus;
}
export interface ProfileRow {
  id: string;
  display_name: string;
  bio: string;
  interests: string[];
  city: string;
  neighborhood: string;
}
