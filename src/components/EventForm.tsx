import { useState, type FormEvent } from "react";
import { categories, today } from "../lib/demo-store.ts";
import type { EventInput, CommunityEvent } from "../features/events/types.ts";
import {
  deadlineLabel,
  EVENT_TIMEZONE,
  eventInstant,
  localDateTime,
} from "../features/events/time.ts";
export function EventForm({
  event,
  demo,
  busy,
  save,
}: {
  event?: CommunityEvent;
  demo: boolean;
  busy: boolean;
  save: (input: EventInput) => void;
}) {
  const [error, setError] = useState("");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const requestedStatus =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "draft"
        ? "draft"
        : "published";
    const input: EventInput = {
      title: String(form.get("title")).trim(),
      category: String(form.get("category")),
      date: String(form.get("date")),
      time: String(form.get("time")),
      place: String(form.get("place")).trim(),
      capacity: Number(form.get("capacity")),
      description: String(form.get("description")).trim(),
      status: event?.status === "draft" ? "draft" : requestedStatus,
      host_label: String(form.get("host_label") ?? "").trim(),
    };
    try {
      const zone = event?.timezone ?? EVENT_TIMEZONE;
      const start = eventInstant(`${input.date}T${input.time}`, zone);
      const deadline = String(form.get("deadline") ?? "");
      input.registration_deadline = deadline
        ? eventInstant(deadline, zone)
        : start;
      const end = String(form.get("end") ?? "");
      input.ends_at = end ? eventInstant(end, zone) : null;
      if (input.registration_deadline > start)
        throw Error(
          "The registration deadline must be at or before the event starts.",
        );
      if (input.ends_at && input.ends_at <= start)
        throw Error("The end time must be after the event starts.");
      if (input.status !== "draft" && Date.parse(start) <= Date.now())
        throw Error("Choose a future event time.");
      if (
        !event &&
        input.status !== "draft" &&
        Date.parse(input.registration_deadline) <= Date.now()
      )
        throw Error("Choose a future registration deadline.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Check the event times.",
      );
      return;
    }
    const confirmed =
      event?.approved_total ??
      (event?.attendees ?? 0) + (event?.approved.length ?? 0);
    if (
      input.title.length < 3 ||
      !input.host_label ||
      input.place.length < 2 ||
      input.description.length < 15 ||
      input.date < today()
    ) {
      setError("Please complete all plan details with today or a future date.");
      return;
    }
    if (input.capacity < confirmed) {
      setError(`Capacity must allow all ${confirmed} approved attendees.`);
      return;
    }
    save(input);
  };
  return (
    <>
      <p className="section-intro">
        Bring women together around something you love.
      </p>
      {demo && (
        <p className="small muted">
          Demo only. Changes stay in this browser. Real profiles, hosting and
          RSVPs require Supabase and a signed-in account.
        </p>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ev-title">Plan name</label>
          <input
            id="ev-title"
            name="title"
            required
            minLength={3}
            maxLength={70}
            defaultValue={event?.title}
            placeholder="e.g. Sunday chai & chats"
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ev-category">Category</label>
            <select
              id="ev-category"
              name="category"
              defaultValue={event?.category ?? "Coffee"}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ev-capacity">Group size</label>
            <select
              id="ev-capacity"
              name="capacity"
              defaultValue={event?.capacity ?? 8}
            >
              {[
                2,
                4,
                6,
                8,
                10,
                12,
                15,
                20,
                30,
                ...(event ? [event.capacity] : []),
              ]
                .filter((value, index, array) => array.indexOf(value) === index)
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size}>{size}</option>
                ))}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ev-date">Date</label>
            <input
              id="ev-date"
              name="date"
              type="date"
              min={today()}
              required
              defaultValue={event?.date}
            />
          </div>
          <div className="field">
            <label htmlFor="ev-time">Time (Richmond)</label>
            <input
              id="ev-time"
              name="time"
              type="time"
              required
              defaultValue={event?.time}
            />
          </div>
        </div>
        <p className="small muted">
          All times are in {event?.timezone ?? "America/New_York"} (Richmond),
          including daylight saving time.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ev-deadline">
              Registration deadline (optional)
            </label>
            <input
              id="ev-deadline"
              name="deadline"
              type="datetime-local"
              defaultValue={
                event?.registration_deadline &&
                event.registration_deadline !== event.starts_at
                  ? localDateTime(event.registration_deadline, event.timezone)
                  : ""
              }
            />
            <small className="muted">
              Leave blank to close requests when the event starts.
            </small>
          </div>
          <div className="field">
            <label htmlFor="ev-end">End date and time (optional)</label>
            <input
              id="ev-end"
              name="end"
              type="datetime-local"
              defaultValue={
                event?.ends_at
                  ? localDateTime(event.ends_at, event.timezone)
                  : ""
              }
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ev-host-label">Public organiser name</label>
          <input
            id="ev-host-label"
            name="host_label"
            maxLength={60}
            defaultValue={event?.host_label ?? "Her Hour host"}
            required
          />
          <small className="muted">
            Shown with your event. Your email and private profile stay private.
          </small>
        </div>
        <div className="field">
          <label htmlFor="ev-place">Area / meeting place</label>
          <input
            id="ev-place"
            name="place"
            required
            minLength={2}
            maxLength={100}
            defaultValue={event?.place}
            placeholder="e.g. Short Pump, Richmond"
          />
        </div>
        <div className="field">
          <label htmlFor="ev-desc">Tell us about your plan</label>
          <textarea
            id="ev-desc"
            name="description"
            required
            minLength={15}
            maxLength={700}
            defaultValue={event?.description}
            placeholder="What will you do? Who is it for? What should guests know?"
          />
        </div>
        {error && <p role="alert">{error}</p>}
        {event?.registration_deadline && (
          <p className="small muted">
            Current deadline:{" "}
            {deadlineLabel(event.registration_deadline, event.timezone)}
          </p>
        )}
        {!demo && !event && (
          <p className="small muted">
            You can add a cover image after saving, from Edit plan.
          </p>
        )}
        <div className="detail-actions">
          <button
            className="btn"
            type="submit"
            value="published"
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : event
                ? "Save changes"
                : demo
                  ? "Save demo plan"
                  : "Publish event"}
          </button>
          {!event && (
            <button
              className="btn btn-outline"
              type="submit"
              value="draft"
              disabled={busy}
            >
              Save draft
            </button>
          )}
        </div>
      </form>
    </>
  );
}
