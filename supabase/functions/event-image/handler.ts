import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_IMAGE_BYTES, sanitizeCover } from "./sanitize.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function boundedBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Choose an image.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_IMAGE_BYTES + 16384) {
      await reader.cancel();
      throw Error("Choose a cover up to 5 MiB.");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return new Response(data, {
    headers: { "Content-Type": req.headers.get("Content-Type") ?? "" },
  }).formData();
}
export function eventImageHandler(makeClient: () => SupabaseClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      return reply({ error: "Log in to manage an event cover." }, 401);
    const db = makeClient();
    const { data: identity, error: authError } = await db.auth.getUser(token);
    if (authError || !identity.user)
      return reply({ error: "Your session has expired. Log in again." }, 401);
    let form: FormData;
    try {
      form = await boundedBody(req);
    } catch {
      return reply(
        { error: "Choose a JPEG, PNG or WebP cover up to 5 MiB." },
        400,
      );
    }
    const event = String(form.get("event_id") ?? ""),
      action = String(form.get("action") ?? "");
    if (!uuid.test(event) || !["upload", "remove", "cleanup"].includes(action))
      return reply({ error: "Invalid cover request." }, 400);
    const actor = identity.user.id;
    const { data: current, error: denied } = await db.rpc(
      "authorize_event_image",
      { p_actor: actor, p_event: event },
    );
    if (denied || !current)
      return reply(
        {
          error:
            "Only the active organiser can change a cover on an open event. Reload and try again.",
        },
        403,
      );
    const bucket = db.storage.from("event-covers");
    const owned = (path: string) =>
      path.startsWith(event + "/") &&
      /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(
        path.slice(event.length + 1),
      );
    async function discard(path: string) {
      if (!owned(path)) throw Error("Invalid image path");
      const { data: row, error } = await db
        .from("meetups")
        .select("cover_path,host_id")
        .eq("id", event)
        .single();
      if (error || row.host_id !== actor || row.cover_path === path)
        throw Error("This cover is still in use");
      const removed = await bucket.remove([path]);
      if (removed.error) throw Error("Cleanup failed");
    }
    if (action === "cleanup") {
      try {
        await discard(String(form.get("path") ?? ""));
        return reply({ path: current.cover_path });
      } catch {
        return reply(
          {
            error:
              "The unused cover could not be removed. Reload and try again.",
          },
          409,
        );
      }
    }
    const previous = String(form.get("previous") ?? "") || null;
    if (previous !== current.cover_path)
      return reply(
        { error: "The cover changed in another window. Reload and try again." },
        409,
      );
    let path: string | null = null;
    if (action === "upload") {
      const file = form.get("file");
      if (!(file instanceof File))
        return reply({ error: "Choose an image." }, 400);
      let bytes: Uint8Array;
      try {
        bytes = sanitizeCover(
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        );
      } catch (error) {
        return reply(
          { error: error instanceof Error ? error.message : "Invalid image." },
          400,
        );
      }
      path = `${event}/${crypto.randomUUID()}.webp`;
      const uploaded = await bucket.upload(path, bytes, {
        upsert: false,
        contentType: "image/webp",
        cacheControl: "0",
      });
      if (uploaded.error)
        return reply(
          {
            error:
              "The cover could not be uploaded. Your current cover is unchanged.",
          },
          503,
        );
    }
    const committed = await db.rpc("commit_event_image", {
      p_actor: actor,
      p_event: event,
      p_previous: previous,
      p_path: path,
    });
    if (committed.error) {
      // An interrupted response may follow a committed write. Never delete its image.
      const check = await db
        .from("meetups")
        .select("cover_path")
        .eq("id", event)
        .single();
      if (check.error || check.data.cover_path !== path) {
        let cleanupPath: string | undefined;
        if (path) {
          try {
            await discard(path);
          } catch {
            cleanupPath = path;
          }
        }
        return reply(
          {
            error: "Your cover could not be saved. Reload and try again.",
            cleanupPath,
          },
          409,
        );
      }
    }
    let cleanupPath: string | undefined;
    if (previous && previous !== path) {
      try {
        await discard(previous);
      } catch {
        cleanupPath = previous;
      }
    }
    return reply({ path, cleanupPath });
  };
}
