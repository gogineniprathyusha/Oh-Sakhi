import test from "node:test";
import assert from "node:assert/strict";
import {
  readAuthCallback,
  withoutAuthCallback,
} from "../../src/lib/auth-callback.ts";

test("recovery intent survives the SDK removing the token hash", () => {
  const callback = new URL(
    "http://localhost:5173/?recovery=1#type=recovery&access_token=fake-test-token",
  );
  assert.equal(readAuthCallback(callback).recovery, true);
  callback.hash = "";
  assert.equal(readAuthCallback(callback).recovery, true);
  assert.equal(
    readAuthCallback(new URL("http://localhost:5173/")).recovery,
    false,
  );
});
test("callback errors produce a safe useful message instead of exposing supplied descriptions", () => {
  const state = readAuthCallback(
    new URL(
      "http://localhost:5173/?recovery=1#error=access_denied&error_description=untrusted-description",
    ),
  );
  assert.match(state.error, /expired/);
  assert.ok(!state.error.includes("untrusted-description"));
});
test("finishing authentication removes callback data and preserves unrelated page state", () => {
  assert.equal(
    withoutAuthCallback(
      new URL(
        "http://localhost:5173/?campaign=community&recovery=1#access_token=fake&refresh_token=fake&type=recovery",
      ),
    ),
    "/?campaign=community",
  );
  assert.equal(
    withoutAuthCallback(
      new URL(
        "http://localhost:5173/?campaign=community&code=fake&error=access_denied#plans",
      ),
    ),
    "/?campaign=community#plans",
  );
  assert.equal(
    withoutAuthCallback(
      new URL("http://localhost:5173/?campaign=community#plans"),
    ),
    "/?campaign=community#plans",
  );
});
