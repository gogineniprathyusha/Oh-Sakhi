import test from "node:test";
import assert from "node:assert/strict";
import { eventInstant, localDateTime } from "../../src/features/events/time.ts";
import { availability, canRequest } from "../../src/features/events/utils.ts";
import { initialState } from "../../src/lib/demo-store.ts";
test("Richmond event times resolve winter and summer offsets without the browser timezone", () => {
  assert.equal(eventInstant("2026-12-12T10:30"), "2026-12-12T15:30:00.000Z");
  assert.equal(eventInstant("2026-07-12T10:30"), "2026-07-12T14:30:00.000Z");
  assert.equal(localDateTime("2026-07-12T14:30:00Z"), "2026-07-12T10:30");
});
test("DST gaps, repeated times and impossible dates are rejected", () => {
  assert.throws(() => eventInstant("2026-03-08T02:30"), /does not exist/);
  assert.throws(() => eventInstant("2026-11-01T01:30"), /occurs twice/);
  assert.throws(() => eventInstant("2026-02-30T10:00"));
  assert.throws(() => eventInstant("invalid"));
});
test("availability distinguishes full, deadline-closed, in-progress and past events", () => {
  const event = {
    ...initialState().events[0],
    status: "published" as const,
    starts_at: "2030-07-17T14:30:00Z",
    registration_deadline: "2030-07-16T21:00:00Z",
    ends_at: "2030-07-17T16:00:00Z",
    approved_total: 0,
  };
  assert.equal(
    availability(event, Date.parse("2030-07-15T00:00:00Z")),
    "Upcoming",
  );
  assert.equal(
    availability(
      { ...event, approved_total: event.capacity },
      Date.parse("2030-07-15T00:00:00Z"),
    ),
    "Full",
  );
  assert.equal(
    availability(event, Date.parse("2030-07-16T22:00:00Z")),
    "RSVPs closed",
  );
  assert.equal(
    availability(event, Date.parse("2030-07-17T15:00:00Z")),
    "In progress",
  );
  assert.equal(
    availability(event, Date.parse("2030-07-17T17:00:00Z")),
    "Past event",
  );
  assert.equal(canRequest({ ...event, status: "cancelled" }, false), false);
});
