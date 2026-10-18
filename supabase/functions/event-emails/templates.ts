export type EmailEvent = {
  id: string;
  title: string;
  starts_at: string;
  timezone: string;
  place: string;
  host: string;
  status: string;
};
export type EmailJob = {
  id: string;
  lease_token: string;
  kind: "confirmation" | "update" | "cancellation" | "reminder";
  event: EmailEvent;
  previous_event: EmailEvent | null;
  email: string;
  payload: Record<string, unknown> | null;
  attempts?: number;
};
export type EmailSettings = {
  apiKey: string;
  from: string;
  replyTo: string;
  appUrl: string;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function eventWhen(event: EmailEvent) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: event.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(event.starts_at));
}
export function emailPayload(job: EmailJob, settings: EmailSettings) {
  const e = job.event;
  const headings = {
    confirmation: "Your spot is confirmed",
    update: "Your event has changed",
    cancellation: "Your event has been cancelled",
    reminder: "Your event is coming up",
  };
  const introductions = {
    confirmation: "You have a confirmed seat. We look forward to seeing you!",
    update:
      "The organiser changed the date, time or venue. Please review the latest details before attending.",
    cancellation:
      "This event will no longer take place. Your RSVP has been cancelled and no action is needed.",
    reminder:
      "A reminder about your upcoming plan. Please check the details below before you head out.",
  };
  const url = new URL(settings.appUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Invalid app URL");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("event", e.id);
  const when = eventWhen(e);
  const previous =
    job.kind === "update" && job.previous_event
      ? `Previously: ${eventWhen(job.previous_event)} · ${job.previous_event.place}`
      : "";
  const title = headings[job.kind];
  const intro = introductions[job.kind];
  const linkLabel =
    job.kind === "cancellation" ? "View your plans" : "View your event";
  return {
    from: settings.from,
    to: [job.email],
    reply_to: settings.replyTo,
    tags: [
      { name: "category", value: "event-email" },
      { name: "notification_id", value: job.id },
    ],
    subject: `${title}: ${e.title.replace(/[\r\n]/g, " ")}`,
    text: `${title}\n\n${intro}\n\n${e.title}\n${when}\n${e.place}\nHosted by ${e.host}\n${previous ? `\n${previous}\n` : ""}\n${linkLabel}: ${url.href}\n\nSign in with the account used for your RSVP. To stop updates for an active event, cancel your RSVP in My plans.\n\nHer Hobby Hour — Oh Sakhi!`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#faf7f5;color:#4a2d43;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:560px;margin:auto;background:#fff;border:1px solid #eadfe4;border-radius:18px"><tr><td style="padding:28px"><p style="color:#94637e;font-size:12px;letter-spacing:2px">HER HOBBY HOUR — OH SAKHI!</p><h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.2">${escape(title)}</h1><p style="font-size:16px;line-height:1.6">${escape(intro)}</p><h2 style="font-family:Georgia,serif;font-size:23px">${escape(e.title)}</h2><p style="font-size:16px;line-height:1.7">${escape(when)}<br>${escape(e.place)}<br>Hosted by ${escape(e.host)}</p>${previous ? `<p style="font-size:14px;line-height:1.6;color:#786a74">${escape(previous)}</p>` : ""}<p style="margin:28px 0"><a href="${escape(url.href)}" style="display:inline-block;background:#794d69;color:white;text-decoration:none;border-radius:24px;padding:13px 22px">${linkLabel}</a></p><p style="font-size:13px;line-height:1.6;color:#786a74">Sign in with the account used for your RSVP. To stop updates for an active event, cancel your RSVP in My plans. You can reply to this email to contact us.</p></td></tr></table></body></html>`,
  };
}
