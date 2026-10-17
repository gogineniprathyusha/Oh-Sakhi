import { supabase } from "../../lib/supabase.ts";
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export class CoverChangeError extends Error {
  cleanupPath?: string;
  constructor(message: string, cleanupPath?: string) {
    super(message);
    this.cleanupPath = cleanupPath;
  }
}
export async function changeCover(
  eventId: string,
  previous: string | null,
  image: Blob | null,
  cleanupPath?: string,
): Promise<{ path: string | null; cleanupPath?: string }> {
  if (!supabase) throw Error("Log in to manage event covers.");
  const form = new FormData();
  form.set("event_id", eventId);
  form.set("previous", previous ?? "");
  form.set("action", cleanupPath ? "cleanup" : image ? "upload" : "remove");
  if (image) form.set("file", image, "cover.webp");
  if (cleanupPath) form.set("path", cleanupPath);
  const { data, error } = await supabase.functions.invoke("event-image", {
    body: form,
  });
  if (error) {
    let message =
      "Cover changes are temporarily unavailable. Your event is saved; please try again later.";
    let unused: string | undefined;
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body.error === "string") message = body.error;
        if (typeof body.cleanupPath === "string") unused = body.cleanupPath;
      } catch {
        /* A gateway error may not have a JSON response. */
      }
    }
    throw new CoverChangeError(message, unused);
  }
  return data;
}
