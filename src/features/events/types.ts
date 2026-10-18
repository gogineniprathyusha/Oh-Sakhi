export type EventStatus =
  "draft" | "published" | "cancelled" | "completed" | "removed";
export type RequestStatus = "pending" | "approved" | "declined" | "cancelled";
export type Page =
  "discover" | "myplans" | "host" | "circle" | "profile" | "admin";
export type AuthMode = "login" | "signup" | "reset" | "update";
export interface Profile {
  name: string;
  bio: string;
  interests: string[];
  city?: string;
  neighborhood?: string;
  avatar_path?: string | null;
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
  is_host: boolean;
  host_id?: string;
  host_avatar_path?: string | null;
  status?: EventStatus;
  starts_at?: string;
  registration_deadline?: string;
  approved_total: number;
  details_updated_at?: string;
  timezone?: string;
  ends_at?: string | null;
  cover_path?: string | null;
  host_label?: string;
  request_status?: RequestStatus;
}
export interface Registration {
  user_id: string;
  display_name?: string;
  avatar_path?: string | null;
  status: RequestStatus;
  created_at?: string;
}
export type EventInput = Pick<
  CommunityEvent,
  "title" | "category" | "date" | "time" | "place" | "capacity" | "description"
> & {
  registration_deadline?: string;
  ends_at?: string | null;
  host_label?: string;
  status?: "draft" | "published";
  timezone?: string;
};
export interface MeetupRow {
  id: string;
  host_id: string;
  host_avatar_path?: string | null;
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
  timezone?: string;
  ends_at?: string | null;
  cover_path?: string | null;
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
  avatar_path?: string | null;
}
