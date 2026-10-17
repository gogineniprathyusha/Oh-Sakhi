import type { SupabaseClient } from "@supabase/supabase-js";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw Error("Too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw Error("Invalid body");
  return value;
}
export function deleteAccountHandler(
  makeAdmin: () => SupabaseClient,
  makeVerifier: () => SupabaseClient,
) {
  const handle = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      return reply(
        { error: "Sign in again before deleting your account." },
        401,
      );
    let body: Record<string, unknown>;
    try {
      body = await readBody(req);
    } catch {
      return reply(
        { error: "Enter your password and type DELETE to confirm." },
        400,
      );
    }
    if (
      body.confirmation !== "DELETE" ||
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 1024 ||
      Object.keys(body).some(
        (key) => !["password", "confirmation"].includes(key),
      )
    )
      return reply(
        { error: "Enter your password and type DELETE to confirm." },
        400,
      );
    const db = makeAdmin();
    const identity = await db.auth.getUser(token);
    const user = identity.data.user;
    if (identity.error || !user?.email)
      return reply({ error: "Your session has expired. Sign in again." }, 401);
    // Password verification must use an isolated client: never replace service auth.
    if (user.factors?.some((factor) => factor.status === "verified"))
      return reply(
        {
          error:
            "Contact support to delete an account protected with multi-factor authentication.",
        },
        403,
      );
    const attempt = await db.rpc("consume_account_deletion_attempt", {
      p_actor: user.id,
    });
    if (attempt.error) return reply({ error: attempt.error.message }, 429);
    const verifier = makeVerifier();
    const verified = await verifier.auth.signInWithPassword({
      email: user.email,
      password: body.password,
    });
    if (verified.error || verified.data.user?.id !== user.id)
      return reply(
        { error: "Your password could not be verified. Please try again." },
        403,
      );
    try {
      const prepared = await db.rpc("prepare_account_deletion", {
        p_actor: user.id,
      });
      if (prepared.error) return reply({ error: prepared.error.message }, 409);
      // A failed pass leaves access frozen and files already removed stay removed.
      // Re-query after each batch; do not skip rows as objects disappear.
      let clear = false;
      for (let batch = 0; batch < 10; batch++) {
        const files = await db.rpc("account_deletion_files", {
          p_actor: user.id,
        });
        if (files.error)
          return reply(
            {
              error:
                "Deletion could not finish. Your account is locked; retry deletion or contact support.",
            },
            503,
          );
        const rows = (files.data ?? []) as {
          bucket_id: string;
          name: string;
        }[];
        if (!rows.length) {
          clear = true;
          break;
        }
        for (const bucket of ["profile-photos", "event-covers"]) {
          const paths = rows
            .filter((row) => row.bucket_id === bucket)
            .map((row) => row.name);
          if (paths.length) {
            const removed = await db.storage.from(bucket).remove(paths);
            if (removed.error)
              return reply(
                {
                  error:
                    "File cleanup could not finish. Your account is locked; retry deletion or contact support.",
                },
                503,
              );
          }
        }
        if (
          rows.some(
            (row) =>
              !["profile-photos", "event-covers"].includes(row.bucket_id),
          )
        )
          return reply(
            { error: "Stored files require support-assisted deletion." },
            409,
          );
      }
      if (!clear)
        return reply(
          {
            error:
              "Cleanup is still in progress. Your account is locked; retry deletion to finish.",
          },
          503,
        );
      const removed = await db.auth.admin.deleteUser(user.id, false);
      if (removed.error)
        return reply(
          {
            error:
              "Account removal could not finish. Retry deletion or contact support.",
          },
          503,
        );
      return reply({ deleted: true });
    } catch {
      return reply(
        {
          error:
            "Deletion could not finish. Retry deletion or contact support.",
        },
        503,
      );
    } finally {
      await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  };
  return async (req: Request) => {
    try {
      return await handle(req);
    } catch {
      return reply(
        {
          error:
            "Deletion is temporarily unavailable. Please retry or contact support.",
        },
        503,
      );
    }
  };
}
