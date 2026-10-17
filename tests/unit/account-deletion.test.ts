import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { deleteAccountHandler } from "../../supabase/functions/delete-account/handler.ts";
const actor = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const state = {
    auth: true,
    password: true,
    mfa: false,
    rate: false,
    blocked: false,
    storageFailure: false,
    deleteFailure: false,
    prepared: false,
    deleted: false,
    calls: [] as string[],
    files: [
      { bucket_id: "profile-photos", name: `${actor}/avatar.png` },
      {
        bucket_id: "event-covers",
        name: "00000000-0000-4000-8000-000000000002/cover.webp",
      },
    ],
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  const make = (kind: "admin" | "verifier") =>
    createClient("https://test.supabase.co", `${kind}-key`, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname,
            body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          state.calls.push(`${kind}:${path}`);
          if (path === "/auth/v1/user")
            return state.auth
              ? json({
                  id: actor,
                  email: "owned@example.test",
                  factors: state.mfa
                    ? [
                        {
                          id: "factor",
                          status: "verified",
                          factor_type: "totp",
                        },
                      ]
                    : [],
                })
              : json({ message: "Invalid session" }, 401);
          if (path === "/auth/v1/token") {
            assert.equal(kind, "verifier");
            assert.equal(body.email, "owned@example.test");
            if (!state.password)
              return json({ message: "Invalid credentials" }, 400);
            return json({
              access_token: "verified-token",
              refresh_token: "temporary-refresh",
              token_type: "bearer",
              expires_in: 3600,
              user: { id: actor, email: "owned@example.test" },
            });
          }
          if (path === "/auth/v1/logout") return json({});
          if (path.endsWith("/consume_account_deletion_attempt"))
            return state.rate
              ? json({ message: "Too many deletion attempts" }, 400)
              : json(null);
          if (path.endsWith("/prepare_account_deletion")) {
            assert.equal(body.p_actor, actor);
            if (state.blocked)
              return json(
                { message: "Cancel upcoming published events before deleting" },
                400,
              );
            state.prepared = true;
            return json(null);
          }
          if (path.endsWith("/account_deletion_files"))
            return json([...state.files]);
          if (path.startsWith("/storage/v1/object/")) {
            assert.ok(state.prepared);
            if (state.storageFailure)
              return json(
                {
                  message: "Unavailable",
                  statusCode: "503",
                  error: "Unavailable",
                },
                503,
              );
            const bucket = path.split("/").at(-1);
            state.files = state.files.filter(
              (row) =>
                row.bucket_id !== bucket || !body.prefixes.includes(row.name),
            );
            return json([]);
          }
          if (path === `/auth/v1/admin/users/${actor}`) {
            assert.equal(kind, "admin");
            assert.equal(state.files.length, 0);
            assert.equal(body.should_soft_delete, false);
            if (state.deleteFailure)
              return json({ message: "Unavailable" }, 503);
            state.deleted = true;
            return json({ id: actor });
          }
          throw Error(`Unexpected test endpoint ${path}`);
        },
      },
    });
  const handler = deleteAccountHandler(
    () => make("admin"),
    () => make("verifier"),
  );
  const request = (
    body: unknown = { password: "test-password", confirmation: "DELETE" },
  ) =>
    handler(
      new Request("https://local.test/delete-account", {
        method: "POST",
        headers: {
          authorization: "Bearer caller-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  return { state, handler, request };
}
test("deletion requires authenticated identity, exact confirmation and freshly verified password before touching files", async () => {
  const { state, handler, request } = fixture();
  assert.equal(
    (await handler(new Request("https://local.test", { method: "POST" })))
      .status,
    401,
  );
  assert.equal(
    (
      await request({
        password: "test-password",
        confirmation: "DELETE",
        user_id: "another-person",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request({ password: "test-password", confirmation: "delete" }))
      .status,
    400,
  );
  assert.equal(
    (await request({ password: "x".repeat(5000), confirmation: "DELETE" }))
      .status,
    400,
  );
  state.auth = false;
  assert.equal((await request()).status, 401);
  state.auth = true;
  state.password = false;
  assert.equal((await request()).status, 403);
  assert.equal(state.prepared, false);
  assert.equal(state.deleted, false);
});
test("MFA accounts, rate limits and organiser preconditions fail without starting destructive cleanup", async () => {
  const { state, request } = fixture();
  state.mfa = true;
  assert.equal((await request()).status, 403);
  state.mfa = false;
  state.rate = true;
  assert.equal((await request()).status, 429);
  state.rate = false;
  state.blocked = true;
  assert.equal((await request()).status, 409);
  assert.equal(state.prepared, false);
  assert.equal(state.files.length, 2);
  assert.equal(state.deleted, false);
});
test("deletion removes files through Storage before the Auth account, using isolated verifier credentials", async () => {
  const { state, request } = fixture();
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.equal(state.deleted, true);
  assert.equal(state.files.length, 0);
  assert.ok(
    state.calls.indexOf("admin:/storage/v1/object/profile-photos") <
      state.calls.indexOf(`admin:/auth/v1/admin/users/${actor}`),
  );
  assert.ok(state.calls.includes("verifier:/auth/v1/logout"));
});
test("interrupted file cleanup leaves Auth intact, and retry safely completes remaining work", async () => {
  const { state, request } = fixture();
  state.storageFailure = true;
  assert.equal((await request()).status, 503);
  assert.equal(state.prepared, true);
  assert.equal(state.deleted, false);
  state.storageFailure = false;
  assert.equal((await request()).status, 200);
  assert.equal(state.deleted, true);
});
test("Auth deletion failure does not pretend success, and retries tolerate files already removed", async () => {
  const { state, request } = fixture();
  state.deleteFailure = true;
  assert.equal((await request()).status, 503);
  assert.equal(state.deleted, false);
  assert.equal(state.files.length, 0);
  state.deleteFailure = false;
  assert.equal((await request()).status, 200);
});
