import { supabase } from "../../lib/supabase.ts";
import type {
  AdminEvent,
  AdminMember,
  AdminPage,
  AdminReport,
  AdminStats,
  AuditEntry,
  ReportStatus,
} from "./types.ts";
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw Error("Sign in with an administrator account.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw Error(error.message);
  if (data === null)
    throw Error("The administrator response was empty. Please refresh.");
  return data as T;
}
export const statistics = () => rpc<AdminStats>("admin_statistics");
const pageArgs = (status: string, search: string, offset: number) => ({
  p_status: status,
  p_search: search,
  p_offset: offset,
  p_limit: 20,
});
export const members = (status: string, search: string, offset: number) =>
  rpc<AdminPage<AdminMember>>(
    "admin_list_members",
    pageArgs(status, search, offset),
  );
export const reports = (status: string, search: string, offset: number) =>
  rpc<AdminPage<AdminReport>>(
    "admin_list_reports",
    pageArgs(status, search, offset),
  );
export const events = (status: string, search: string, offset: number) =>
  rpc<AdminPage<AdminEvent>>(
    "admin_list_events",
    pageArgs(status, search, offset),
  );
export const audit = (offset: number) =>
  rpc<AdminPage<AuditEntry>>("admin_list_audit", {
    p_offset: offset,
    p_limit: 20,
  });
// Void RPCs legitimately return null.
export async function changeAccess(
  id: string,
  status: "active" | "suspended",
  reason: string,
) {
  if (!supabase) throw Error("Sign in with an administrator account.");
  const { error } = await supabase.rpc("set_member_access", {
    p_user_id: id,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw Error(error.message);
}
export const review = (id: string, status: ReportStatus, note: string) =>
  rpc<AdminReport>("review_report", {
    p_report_id: id,
    p_status: status,
    p_note: note,
  });
