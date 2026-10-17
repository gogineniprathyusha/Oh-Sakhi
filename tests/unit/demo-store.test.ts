import test from "node:test";
import assert from "node:assert/strict";
import {
  STORE,
  initialState,
  loadState,
  saveState,
  requestToJoin,
  withdraw,
  seats,
  status,
} from "../../src/lib/demo-store.ts";
import { hasSupabaseConfig } from "../../src/lib/supabase-config.ts";

test("reset creates fresh sample data without retaining profile or RSVP edits", () => {
  const edited = initialState();
  edited.events[0].approved.length = 0;
  edited.profile.name = "Someone else";
  const fresh = initialState();
  assert.equal(fresh.events.length, 6);
  assert.equal(status(fresh.events[0]), "going");
  assert.equal(fresh.profile.name, "Sakhi Member");
});

test("RSVPs confirm immediately and duplicate joins do not consume another seat", () => {
  const event = initialState().events[1];
  const before = seats(event);
  assert.equal(requestToJoin(event), true);
  assert.equal(status(event), "going");
  assert.equal(requestToJoin(event), false);
  assert.equal(event.pending.length, 0);
  assert.equal(seats(event), before - 1);
  withdraw(event);
  assert.equal(status(event), "none");
});

test("full, closed and own demo events cannot be joined", () => {
  const event = initialState().events[1];
  assert.equal(requestToJoin({ ...event, host: "You" }), false);
  assert.equal(requestToJoin({ ...event, status: "cancelled" }), false);
  assert.equal(requestToJoin({ ...event, capacity: event.attendees }), false);
});

test("legacy demo pending requests become confirmed only within capacity", () => {
  const state = initialState(),
    event = state.events[1];
  event.capacity = 7;
  event.pending = ["demo", "Another member"];
  const restored = loadState({ getItem: () => JSON.stringify(state) })
    .events[1];
  assert.equal(restored.pending.length, 0);
  assert.deepEqual(restored.approved, ["demo"]);
  assert.equal(seats(restored), 0);
});

test("withdrawing a confirmed demo RSVP releases exactly one seat", () => {
  const event = initialState().events[0];
  const before = seats(event);
  withdraw(event);
  assert.equal(status(event), "none");
  assert.equal(seats(event), before + 1);
  withdraw(event);
  assert.equal(seats(event), before + 1);
});

test("local profile and request edits survive a save and reload", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key),
    setItem: (key: string, value: string) => data.set(key, value),
  };
  const state = initialState();
  state.profile.name = "Richmond friend";
  requestToJoin(state.events[1]);
  assert.equal(saveState(storage, state), true);
  assert.equal(data.has(STORE), true);
  assert.deepEqual(loadState(storage), state);
});

test("invalid, blocked or unsafe storage falls back to the six original samples", () => {
  for (const serialized of ["broken json", "{}", "null", '{"profile":{}}']) {
    assert.deepEqual(loadState({ getItem: () => serialized }), initialState());
  }
  const invalid = initialState();
  invalid.events[0].colors[0] = "#fff;position:fixed";
  assert.deepEqual(
    loadState({ getItem: () => JSON.stringify(invalid) }),
    initialState(),
  );
  assert.deepEqual(
    loadState({
      getItem() {
        throw Error("Storage blocked");
      },
    }),
    initialState(),
  );
  assert.equal(
    saveState(
      {
        setItem() {
          throw Error("Storage full");
        },
      },
      initialState(),
    ),
    false,
  );
});

test("missing, placeholder, invalid and server-only configuration keeps the app in demo mode", () => {
  for (const [url, key] of [
    [undefined, undefined],
    ["https://YOUR_PROJECT.supabase.co", "YOUR_KEY"],
    ["not a URL", "sb_publishable_test"],
    ["file:///tmp/project", "sb_publishable_test"],
    ["https://project.supabase.co", "sb_secret_server_only"],
    ["https://project.supabase.co", "eyJ.invalid.invalid"],
  ])
    assert.equal(hasSupabaseConfig(url, key), false);
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.signature`;
  assert.equal(
    hasSupabaseConfig("https://project.supabase.co", jwt("service_role")),
    false,
  );
  assert.equal(
    hasSupabaseConfig("https://project.supabase.co", jwt("anon")),
    true,
  );
  assert.equal(
    hasSupabaseConfig("https://project.supabase.co", "sb_publishable_test"),
    true,
  );
});
