import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emailPayload,
  type EmailJob,
  type EmailSettings,
} from "./templates.ts";

export function eventEmailsHandler(
  makeClient: () => SupabaseClient,
  settings: () => EmailSettings,
  send: typeof fetch = fetch,
  pause = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  return async (request: Request) => {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{40,256})$/)?.[1];
    if (!token) return new Response("Unauthorized", { status: 401 });
    const db = makeClient();
    const auth = await db.rpc("authorize_email_worker", { p_token: token });
    if (auth.error || auth.data !== true)
      return new Response("Unauthorized", { status: 401 });
    let config: EmailSettings;
    try {
      config = settings();
      if (!config.apiKey || !config.from || !config.replyTo || !config.appUrl)
        throw Error();
      if (new URL(config.appUrl).protocol !== "https:") throw Error();
    } catch {
      return Response.json(
        { error: "Missing or invalid server email configuration" },
        { status: 503 },
      );
    }
    let sent = 0,
      failed = 0,
      skipped = 0;
    const started = Date.now();
    // A bounded minute batch stays inside Edge Function limits and provider rate limits.
    for (let index = 0; index < 20 && Date.now() - started < 40000; index++) {
      const claimed = await db.rpc("claim_event_email");
      if (claimed.error)
        return Response.json(
          { error: "Email queue unavailable" },
          { status: 503 },
        );
      if (!claimed.data) break;
      const job = claimed.data as EmailJob;
      let payload: Record<string, unknown>;
      try {
        payload = job.payload ?? emailPayload(job, config);
      } catch {
        await db.rpc("finish_event_email", {
          p_id: job.id,
          p_lease: job.lease_token,
          p_error: "invalid_template_data",
        });
        failed++;
        continue;
      }
      const prepared = await db.rpc("prepare_event_email", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_payload: payload,
      });
      if (prepared.error)
        return Response.json(
          { error: "Email preparation unavailable" },
          { status: 503 },
        );
      if (!prepared.data) {
        skipped++;
        continue;
      }
      let providerId: string | null = null,
        error: string | null = null,
        retry: number | null = null;
      const backoff = Math.min(60 * 2 ** Math.min(job.attempts ?? 1, 6), 3600);
      try {
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `event-email/${job.id}`,
          },
          body: JSON.stringify(prepared.data),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && typeof data.id === "string") providerId = data.id;
        else {
          // Persist error codes only, never provider messages containing addresses or keys.
          error = `resend_${response.status}`;
          if (
            response.status === 429 ||
            response.status >= 500 ||
            (response.status === 409 &&
              data.name === "concurrent_idempotent_requests")
          ) {
            const after = Number(response.headers.get("retry-after"));
            retry = after > 0 ? Math.min(after, 3600) : backoff;
          }
          if (response.ok) {
            error = "invalid_provider_response";
            retry = backoff;
          }
        }
      } catch {
        error = "provider_timeout_or_network";
        retry = backoff;
      }
      const finished = await db.rpc("finish_event_email", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_provider_id: providerId,
        p_error: error,
        p_retry_seconds: retry,
      });
      // Do not submit a fresh job when acknowledgement is uncertain. Lease retry uses the same key/body.
      if (finished.error)
        return Response.json(
          { error: "Email acknowledgement unavailable" },
          { status: 503 },
        );
      if (providerId) sent++;
      else failed++;
      if (
        error === "resend_429" ||
        error === "resend_401" ||
        error === "resend_403"
      )
        break;
      await pause(600);
    }
    return Response.json({ sent, failed, skipped });
  };
}
