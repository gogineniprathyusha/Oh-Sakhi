import test from "node:test";
import assert from "node:assert/strict";
import { status, seats, canRequest } from "../../src/features/events/utils.ts";
import { eventFixture } from "./fixtures/event.ts";

test("personal event labels use ownership and registration state, never the public host name", () => {
  const event = eventFixture();
  assert.equal(status({ ...event, host: "You" }), "none");
  assert.equal(status({ ...event, is_host: true }), "hosting");
  assert.equal(status({ ...event, request_status: "approved" }), "going");
  assert.equal(status({ ...event, request_status: "cancelled" }), "none");
  assert.equal(seats(event), 6);
  assert.equal(seats({ ...event, approved_total: 8 }), 0);
});

test("missing event timestamps fail closed for RSVP availability", () => {
  assert.equal(canRequest({ ...eventFixture(), starts_at: undefined }), false);
  assert.equal(
    canRequest({ ...eventFixture(), registration_deadline: undefined }),
    false,
  );
});
