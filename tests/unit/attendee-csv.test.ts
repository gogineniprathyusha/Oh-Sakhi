import test from "node:test";
import assert from "node:assert/strict";
import { attendeeCsv } from "../../src/features/events/attendee-csv.ts";
import type { Registration } from "../../src/features/events/types.ts";
test("attendee exports preserve Unicode, embedded quotes, commas and newlines", () => {
  const rows: Registration[] = [
    {
      user_id: "member-id",
      display_name: 'Sakhi, "ప్రత్యూష"\nFriend',
      status: "approved",
      created_at: "2030-01-01T12:00:00Z",
    },
  ];
  assert.equal(
    attendeeCsv(rows, true),
    '\uFEFF"Member ID","Display name","RSVP status","Registered at (UTC)"\r\n"member-id","Sakhi, ""ప్రత్యూష""\nFriend","Confirmed","2030-01-01T12:00:00Z"\r\n',
  );
});
test("spreadsheet formulas and control-prefixed values are neutralised, even behind whitespace", () => {
  for (const name of [
    '=HYPERLINK("https://example.test")',
    "+1+1",
    "-1+1",
    "@SUM(1)",
    "  =1+1",
    "\t=1+1",
    "\r=1+1",
    "\n=1+1",
    "\uFEFF=1+1",
  ]) {
    const result = attendeeCsv(
      [{ user_id: "member", display_name: name, status: "approved" }],
      true,
    );
    assert.ok(result.includes(`"'${name.replaceAll('"', '""')}"`));
  }
});
test("confirmed-only exports exclude withdrawn members; all-status exports use clear labels", () => {
  const rows: Registration[] = [
    { user_id: "confirmed", status: "approved" },
    { user_id: "withdrawn", status: "cancelled" },
    { user_id: "legacy", status: "pending" },
  ];
  assert.ok(!attendeeCsv(rows, true).includes("withdrawn"));
  assert.ok(!attendeeCsv(rows, true).includes("legacy"));
  assert.ok(attendeeCsv(rows, false).includes("Cancelled"));
  assert.ok(attendeeCsv(rows, false).includes("Not confirmed"));
  assert.equal(attendeeCsv([], true).split("\r\n").length, 2);
});
