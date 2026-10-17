import type { EventStatus } from "../events/types.ts";
export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
export interface AdminReport {
  id: string;
  meetup_id: string;
  reporter_id: string;
  reporter_name: string;
  event_title: string;
  event_status: EventStatus;
  category: string;
  details: string;
  status: ReportStatus;
  resolution_note: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}
export interface AdminMember {
  id: string;
  display_name: string;
  city: string;
  created_at: string;
  status: "active" | "suspended";
  reason: string;
  is_admin: boolean;
}
export interface AdminEvent {
  id: string;
  title: string;
  host_id: string;
  host_label: string;
  host_status: string;
  status: EventStatus;
  starts_at: string;
  timezone: string;
  capacity: number;
  approved_count: number;
}
export interface AuditEntry {
  id: number;
  actor_name: string | null;
  action: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
}
export interface AdminStats {
  members: number;
  active_members: number;
  suspended_members: number;
  draft_events: number;
  upcoming_events: number;
  confirmed_rsvps: number;
  open_reports: number;
}
export interface AdminPage<T> {
  total: number;
  items: T[];
}
export type AdminTab =
  "overview" | "reports" | "members" | "events" | "history";

export type AdminSelection =
  | { kind: "review"; report: AdminReport }
  | { kind: "access"; member: AdminMember }
  | { kind: "remove" | "attendees"; event: { id: string; title: string } };

export type AdminRecord = AdminReport | AdminMember | AdminEvent | AuditEntry;
