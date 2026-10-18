import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eventEmailsHandler } from "../../supabase/functions/event-emails/handler.ts";
import {
  emailPayload,
  eventWhen,
  type EmailJob,
} from "../../supabase/functions/event-emails/templates.ts";
import {
  emailWebhookHandler,
  verifyWebhook,
} from "../../supabase/functions/email-webhook/handler.ts";

const settings = {
  apiKey: "server-secret",
  from: "Her Hobby Hour <events@alerts.example.test>",
  replyTo: "contact@example.test",
  appUrl: "https://example.test",
};
const event = {
  id: "00000000-0000-4000-8000-000000000001",
  title: 'Coffee <script>alert("x")</script>',
  starts_at: "2030-07-17T14:30:00Z",
  timezone: "America/New_York",
  place: "Cafe & garden",
  host: "Host",
  status: "published",
};
const job: EmailJob = {
  id: "job-1",
  lease_token: "lease-1",
  kind: "confirmation",
  event,
  previous_event: null,
  email: "owned@example.test",
  payload: null,
};
const token = "t".repeat(64);
const request = () =>
  new Request("https://test/functions/event-emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
function fixture(
  options: {
    status?: number;
    crash?: boolean;
    stale?: boolean;
    auth?: boolean;
    finishError?: boolean;
  } = {},
) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let claims = 0;
  const payloads: string[] = [];
  const db = createClient("https://test.supabase.co", "test-server-only", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const name = new URL(String(input)).pathname.split("/").pop()!;
        const body = JSON.parse(String(init?.body ?? "{}"));
        calls.push({ name, body });
        let value: unknown = null;
        if (name === "authorize_email_worker") value = options.auth !== false;
        if (name === "claim_event_email") value = claims++ === 0 ? job : null;
        if (name === "prepare_event_email")
          value = options.stale ? null : body.p_payload;
        if (name === "finish_event_email" && options.finishError)
          return Response.json(
            { message: "database unavailable" },
            { status: 503 },
          );
        return Response.json(value);
      },
    },
  });
  const send: typeof fetch = async (_input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Idempotency-Key"),
      "event-email/job-1",
    );
    payloads.push(String(init?.body));
    if (options.crash) throw Error("network secret must not be logged");
    return Response.json(
      options.status && options.status !== 200
        ? { name: "provider_error", message: "private address" }
        : { id: "email-1" },
      { status: options.status ?? 200 },
    );
  };
  return {
    calls,
    payloads,
    handler: eventEmailsHandler(
      () => db,
      () => settings,
      send,
      async () => {},
    ),
  };
}
test("branded templates escape member content, link to the event and use actual EDT/EST", () => {
  for (const kind of [
    "confirmation",
    "update",
    "cancellation",
    "reminder",
    "organiser_published",
    "organiser_rsvp",
    "organiser_cancelled",
    "rsvp_cancelled",
  ] as const) {
    const payload = emailPayload(
      { ...job, kind, previous_event: { ...event, place: "Old venue" } },
      settings,
    );
    assert.deepEqual(payload.to, [job.email]);
    assert.ok(!payload.html.includes("<script>"));
    assert.match(payload.html, /&lt;script&gt;/);
    assert.match(payload.text, /10:30 AM EDT/);
    assert.match(payload.text, /https:\/\/example.test\/\?event=/);
    if (kind === "update") assert.match(payload.text, /Old venue/);
    assert.equal(payload.reply_to, settings.replyTo);
  }
  assert.match(
    eventWhen({ ...event, starts_at: "2030-12-17T15:30:00Z" }),
    /10:30 AM EST/,
  );
  assert.throws(() =>
    emailPayload(job, { ...settings, appUrl: "javascript:bad()" }),
  );
});
test("seat cancellation confirms only the member reservation and allows conditional rejoining", () => {
  const payload = emailPayload({ ...job, kind: "rsvp_cancelled" }, settings);
  assert.match(payload.subject, /^Your spot cancellation is confirmed:/);
  assert.match(payload.text, /your seat has been released/);
  assert.match(payload.text, /event itself has not been cancelled/);
  assert.match(payload.text, /if registration is open and a seat is available/);
  assert.match(payload.text, /reservation history in My plans/);
  assert.match(
    payload.text,
    /View your event: https:\/\/example.test\/\?event=/,
  );
  assert.ok(!payload.text.includes("cancel your RSVP"));
  assert.ok(!payload.text.includes("organiser account"));
  assert.deepEqual(payload.to, [job.email]);
  assert.ok(!("cc" in payload) && !("bcc" in payload));
});
test("organiser cancellation confirms closure without claiming attendee delivery", () => {
  const payload = emailPayload(
    {
      ...job,
      kind: "organiser_cancelled",
      event: { ...event, status: "cancelled" },
    },
    settings,
  );
  assert.match(payload.subject, /^Your event cancellation is confirmed:/);
  assert.match(payload.text, /no longer open for RSVPs/);
  assert.match(payload.text, /seats have been released/);
  assert.match(
    payload.text,
    /View cancelled event: https:\/\/example.test\/\?event=/,
  );
  assert.match(payload.text, /Sign in with your organiser account/);
  assert.ok(!payload.text.includes("cancel your RSVP"));
  assert.ok(!payload.text.includes("attendees have been notified"));
  assert.deepEqual(payload.to, [job.email]);
});
test("organiser emails show safe attendee names and organiser-specific actions", () => {
  const joined = emailPayload(
    {
      ...job,
      kind: "organiser_rsvp",
      event: { ...event, attendee_name: '<img src=x onerror="bad()">' },
    },
    settings,
  );
  assert.match(joined.subject, /^Someone joined your event:/);
  assert.match(joined.text, /has a confirmed seat/);
  assert.match(joined.html, /&lt;img/);
  assert.ok(!joined.html.includes("<img"));
  for (const kind of ["organiser_published", "organiser_rsvp"] as const) {
    const payload = emailPayload({ ...job, kind }, settings);
    assert.match(payload.text, /Manage your event/);
    assert.match(payload.text, /Sign in with your organiser account/);
    assert.ok(!payload.text.includes("cancel your RSVP"));
    assert.deepEqual(payload.to, [job.email]);
    assert.ok(!("cc" in payload) && !("bcc" in payload));
  }
  assert.match(
    emailPayload({ ...job, kind: "organiser_published" }, settings).subject,
    /^Your event is published:/,
  );
});
test("worker rejects browser/guest invocations before touching the queue or provider", async () => {
  const f = fixture();
  assert.equal(
    (await f.handler(new Request("https://test", { method: "POST" }))).status,
    401,
  );
  assert.deepEqual(f.calls, []);
  const bad = fixture({ auth: false });
  assert.equal((await bad.handler(request())).status, 401);
  assert.deepEqual(
    bad.calls.map((x) => x.name),
    ["authorize_email_worker"],
  );
  assert.deepEqual(bad.payloads, []);
});
test("worker sends one recipient, records acceptance and revalidates before provider send", async () => {
  const f = fixture();
  assert.deepEqual(await (await f.handler(request())).json(), {
    sent: 1,
    failed: 0,
    skipped: 0,
  });
  assert.equal(
    f.calls.find((x) => x.name === "finish_event_email")?.body.p_provider_id,
    "email-1",
  );
  assert.deepEqual(JSON.parse(f.payloads[0]).to, [job.email]);
  const stale = fixture({ stale: true });
  assert.deepEqual(await (await stale.handler(request())).json(), {
    sent: 0,
    failed: 0,
    skipped: 1,
  });
  assert.equal(stale.payloads.length, 0);
});
test("provider timeouts/rate limits retry; rejected keys fail without exposing secrets", async () => {
  for (const options of [
    { crash: true },
    { status: 429 },
    { status: 500 },
    { status: 403 },
  ]) {
    const f = fixture(options);
    const response = await f.handler(request());
    assert.equal(response.status, 200);
    const finish = f.calls.find((x) => x.name === "finish_event_email")!.body;
    assert.equal(finish.p_retry_seconds, options.status === 403 ? null : 120);
    assert.ok(!JSON.stringify(finish).includes("private address"));
    assert.ok(!JSON.stringify(finish).includes("server-secret"));
  }
  const f = fixture({ finishError: true });
  assert.equal((await f.handler(request())).status, 503);
  assert.equal(f.payloads.length, 1);
});
test("Svix verification accepts independently signed events and rejects body tampering, expiry and bad signatures", async () => {
  // Ephemeral test data only: no account credentials or copied example keys.
  // Node's HMAC signer is independent of the handler's Web Crypto verifier.
  const bytes = randomBytes(32);
  const key = "whsec_" + bytes.toString("base64");
  const raw = '{"event_type":"ping","data":{"success":true}}';
  const signature = createHmac("sha256", bytes)
    .update(`msg_loFOjxBNrRLzqYUf.1731705121.${raw}`)
    .digest("base64");
  const headers = new Headers({
    "svix-id": "msg_loFOjxBNrRLzqYUf",
    "svix-timestamp": "1731705121",
    "svix-signature": `v1,${signature}`,
  });
  assert.equal(await verifyWebhook(raw, headers, key, 1731705121000), true);
  assert.equal(
    await verifyWebhook(raw + " ", headers, key, 1731705121000),
    false,
  );
  assert.equal(await verifyWebhook(raw, headers, key), false);
  headers.set("svix-signature", "v1,invalid v2,wrong");
  assert.equal(await verifyWebhook(raw, headers, key, 1731705121000), false);
});
test("signed delivery webhooks are bounded, authenticated and record no recipient supplied by the caller", async () => {
  const f = fixture();
  // Reuse a real Supabase client with a minimal intercepted RPC.
  const records: unknown[] = [];
  const db = createClient("https://test.supabase.co", "test-key", {
    global: {
      fetch: async (_url, init) => {
        records.push(JSON.parse(String(init?.body)));
        return Response.json(null);
      },
    },
  });
  const secret = "whsec_" + randomBytes(32).toString("base64");
  const handler = emailWebhookHandler(
    () => db,
    () => secret,
  );
  assert.equal(
    (await handler(new Request("https://test", { method: "POST", body: "{}" })))
      .status,
    401,
  );
  assert.deepEqual(records, []);
  const raw = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "email-1",
      to: ["spoofed@example.test"],
      tags: { category: "event-email", notification_id: event.id },
    },
  });
  const time = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`msg-1.${time}.${raw}`)
    .digest("base64");
  const response = await handler(
    new Request("https://test", {
      method: "POST",
      body: raw,
      headers: {
        "svix-id": "msg-1",
        "svix-timestamp": time,
        "svix-signature": `v1,${signature}`,
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(records.length, 1);
  assert.ok(!JSON.stringify(records).includes("spoofed"));
  assert.equal(
    (
      await handler(
        new Request("https://test", {
          method: "POST",
          body: "x".repeat(70000),
        }),
      )
    ).status,
    413,
  );
  assert.equal(f.payloads.length, 0);
});
