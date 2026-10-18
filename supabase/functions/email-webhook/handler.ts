import type { SupabaseClient } from "@supabase/supabase-js";

// Svix v1 protocol: HMAC-SHA256(id.timestamp.rawBody), base64 key after whsec_.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
export async function verifyWebhook(
  raw: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id"),
    timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (
    !secret.startsWith("whsec_") ||
    !id ||
    id.length > 200 ||
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    !signatures ||
    signatures.length > 2048
  )
    return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const content = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
    for (const part of signatures.split(" ")) {
      if (!part.startsWith("v1,")) continue;
      try {
        if (
          await crypto.subtle.verify(
            "HMAC",
            key,
            Uint8Array.from(atob(part.slice(3)), (c) => c.charCodeAt(0)),
            content,
          )
        )
          return true;
      } catch {
        /* Ignore malformed/unsupported signatures during key rotation. */
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function emailWebhookHandler(
  makeClient: () => SupabaseClient,
  signingSecret: () => string,
) {
  return async (request: Request) => {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    const secret = signingSecret();
    if (!secret) return new Response("Webhook not configured", { status: 503 });
    // Bound streamed bodies too; Content-Length alone can be absent or forged.
    const reader = request.body?.getReader();
    if (!reader) return new Response("Missing body", { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return new Response("Payload too large", { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const raw = new TextDecoder().decode(bytes);
    if (!(await verifyWebhook(raw, request.headers, secret)))
      return new Response("Invalid signature", { status: 401 });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (
      !["email.delivered", "email.bounced", "email.complained"].includes(
        body?.type,
      )
    )
      return Response.json({ ignored: true });
    if (body.data?.tags?.category !== "event-email")
      return Response.json({ ignored: true });
    const notificationId = body.data.tags.notification_id;
    if (
      typeof notificationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        notificationId,
      )
    )
      return new Response("Invalid notification ID", { status: 400 });
    if (
      typeof body.data?.email_id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.data.email_id) ||
      !Number.isFinite(Date.parse(body.created_at))
    )
      return new Response("Invalid event", { status: 400 });
    // Ignore provider-supplied to/from fields; resolve our recorded recipient in PostgreSQL.
    const result = await makeClient().rpc("record_event_email_delivery", {
      p_webhook_id: request.headers.get("svix-id"),
      p_provider_id: body.data.email_id,
      p_type: body.type,
      p_at: body.created_at,
      p_notification_id: notificationId,
    });
    if (result.error)
      return new Response("Delivery acknowledgement pending", { status: 503 });
    return Response.json({ received: true });
  };
}
