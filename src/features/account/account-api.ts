import { supabase } from "../../lib/supabase.ts";
export interface DeletionSummary {
  hosted_events: number;
  upcoming_events: number;
  rsvps: number;
  is_admin: boolean;
  deleting: boolean;
}
export async function deletionSummary(): Promise<DeletionSummary> {
  if (!supabase) throw Error("Sign in to manage your account.");
  const { data, error } = await supabase.rpc("get_account_deletion_summary");
  if (error || !data)
    throw Error("Your account details could not be loaded. Please retry.");
  return data as DeletionSummary;
}
export async function deleteAccount(password: string, confirmation: string) {
  if (!supabase) throw Error("Sign in to manage your account.");
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { password, confirmation },
  });
  if (error) {
    let message =
      "Account deletion could not finish. Retry or contact support.";
    try {
      const response = error.context as Response | undefined;
      const value = await response?.json();
      if (typeof value?.error === "string") message = value.error;
    } catch {
      /* Keep the safe fallback. */
    }
    throw Error(message);
  }
  if (data?.deleted !== true)
    throw Error(
      "Account deletion was not confirmed. Please retry or contact support.",
    );
}
