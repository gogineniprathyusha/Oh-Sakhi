import { supabase } from "./supabase.ts";
import { themes } from "./demo-store.ts";
import type {
  CommunityEvent,
  EventInput,
  MeetupRow,
  Profile,
  ProfileRow,
  RequestRow,
  Registration,
  EventStatus,
} from "../features/events/types.ts";

function client() {
  if (!supabase)
    throw Error("Connect your Supabase project to use real accounts.");
  return supabase;
}
function check(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
export async function loadCommunity(userId: string) {
  const db = client();
  const [profile, events, requests, access] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).single(),
    db.from("meetup_directory").select("*").order("starts_at"),
    db.from("meetup_requests").select("*"),
    db.rpc("get_my_access"),
  ]);
  check(access.error);
  if (access.data?.status !== "active")
    throw Error("Your member access is suspended. Contact the community team.");
  for (const result of [profile, events, requests]) check(result.error);
  const member = profile.data as ProfileRow;
  const registrations = (requests.data ?? []) as RequestRow[];
  const mapped: CommunityEvent[] = ((events.data ?? []) as MeetupRow[]).map(
    (row) => {
      const [emoji, ...colors] = themes[row.category] ?? themes.Social;
      const own = registrations.filter(
        (request) => request.meetup_id === row.id,
      );
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        date: row.event_date,
        time: row.event_time.slice(0, 5),
        place: row.place,
        capacity: row.capacity,
        description: row.description,
        host_id: row.host_id,
        host: row.host_id === userId ? "You" : row.host_name,
        emoji,
        colors,
        attendees: row.approved_count,
        approved: own
          .filter((r) => r.user_id === userId && r.status === "approved")
          .map(() => "demo"),
        pending: own
          .filter((r) => r.user_id === userId && r.status === "pending")
          .map(() => "demo"),
        declined: own
          .filter((r) => r.user_id === userId && r.status === "declined")
          .map(() => "demo"),
        status: row.status,
        starts_at: row.starts_at,
        registration_deadline: row.registration_deadline,
        approved_total: row.approved_count,
        details_updated_at: row.details_updated_at,
        cover_path: row.cover_path,
        timezone: row.timezone ?? "America/New_York",
        ends_at: row.ends_at,
        host_label: row.host_label,
        request_status: own.find((r) => r.user_id === userId)?.status,
      };
    },
  );
  return {
    profile: {
      name: member.display_name,
      bio: member.bio,
      interests: member.interests,
      city: member.city,
      neighborhood: member.neighborhood,
      avatar_path: member.avatar_path ?? null,
    } satisfies Profile,
    events: mapped,
    isAdmin: Boolean(access.data?.is_admin),
  };
}
export async function saveProfile(id: string, profile: Profile) {
  const { error } = await client()
    .from("profiles")
    .update({
      display_name: profile.name,
      bio: profile.bio,
      interests: profile.interests,
      city: profile.city ?? "Richmond",
      neighborhood: profile.neighborhood ?? "",
    })
    .eq("id", id)
    .select("id")
    .single();
  if (error)
    throw Error(
      "Your profile could not be saved. Please check your connection and try again.",
    );
}
export async function saveEvent(
  id: string | undefined,
  userId: string,
  input: EventInput,
) {
  const values = {
    title: input.title,
    category: input.category,
    event_date: input.date,
    event_time: input.time,
    place: input.place,
    capacity: input.capacity,
    description: input.description,
    ...(input.registration_deadline
      ? { registration_deadline: input.registration_deadline }
      : {}),
    ...(input.ends_at !== undefined ? { ends_at: input.ends_at } : {}),
    ...(input.host_label ? { host_label: input.host_label } : {}),
  };
  const result = id
    ? await client()
        .from("meetups")
        .update(values)
        .eq("id", id)
        .eq("host_id", userId)
        .select("id")
        .single()
    : await client()
        .from("meetups")
        .insert({
          ...values,
          host_id: userId,
          status: input.status ?? "published",
        })
        .select("id")
        .single();
  check(result.error);
  return result.data!.id as string;
}
export async function requestEvent(id: string) {
  check((await client().rpc("request_meetup", { p_meetup_id: id })).error);
}
export async function withdrawEvent(id: string) {
  check(
    (await client().rpc("withdraw_meetup_request", { p_meetup_id: id })).error,
  );
}
export async function decideRequest(
  id: string,
  userId: string,
  decision: "approved" | "declined",
) {
  check(
    (
      await client().rpc("decide_meetup_request", {
        p_meetup_id: id,
        p_user_id: userId,
        p_decision: decision,
      })
    ).error,
  );
}
export async function setEventStatus(id: string, status: EventStatus) {
  check(
    (
      await client().rpc("set_meetup_status", {
        p_meetup_id: id,
        p_status: status,
      })
    ).error,
  );
}
export async function removeEvent(id: string, reason: string) {
  check(
    (
      await client().rpc("moderate_meetup", {
        p_meetup_id: id,
        p_reason: reason,
      })
    ).error,
  );
}
export async function attendees(id: string): Promise<Registration[]> {
  const { data, error } = await client().rpc("get_meetup_attendees", {
    p_meetup_id: id,
  });
  check(error);
  return data ?? [];
}
export async function reportEvent(
  id: string,
  userId: string,
  category: string,
  details: string,
) {
  check(
    (
      await client()
        .from("reports")
        .insert({ meetup_id: id, reporter_id: userId, category, details })
    ).error,
  );
}
