import test from "node:test";
import assert from "node:assert/strict";
import { hasSupabaseConfig } from "../../src/lib/supabase-config.ts";

test("missing, placeholder, invalid and server-only configuration disables the Supabase client", () => {
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
