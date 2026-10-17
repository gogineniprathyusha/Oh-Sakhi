import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  initializeImageMagick,
  ImageMagick,
  MagickFormat,
} from "@imagemagick/magick-wasm";
import { createClient } from "@supabase/supabase-js";
import {
  sanitizeCover,
  MAX_IMAGE_BYTES,
} from "../../supabase/functions/event-image/sanitize.ts";
import { eventImageHandler } from "../../supabase/functions/event-image/handler.ts";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNw0bT+DwADBQGotRVSxwAAAABJRU5ErkJggg==",
  "base64",
);
const eventId = "00000000-0000-4000-8000-000000000002",
  actor = "00000000-0000-4000-8000-000000000001";
before(async () => {
  const require = createRequire(import.meta.url);
  await initializeImageMagick(
    await readFile(require.resolve("@imagemagick/magick-wasm/magick.wasm")),
  );
});
test("server decodes and re-encodes a raster, discarding appended content", () => {
  const result = sanitizeCover(
    Buffer.concat([
      pixel,
      Buffer.from("<script>private-source-marker</script>"),
    ]),
    "image/png",
  );
  assert.equal(new TextDecoder().decode(result.subarray(8, 12)), "WEBP");
  assert.equal(
    Buffer.from(result).includes(Buffer.from("private-source-marker")),
    false,
  );
  ImageMagick.read(result, MagickFormat.WebP, (image) => {
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
  });
});
test("server rejects unsupported, forged, truncated and oversize image payloads", () => {
  for (const [bytes, type] of [
    [Buffer.from("<svg/>"), "image/svg+xml"],
    [Buffer.from("<svg/>"), "image/png"],
    [pixel.subarray(0, 16), "image/png"],
    [Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/png"],
  ] as const)
    assert.throws(() => sanitizeCover(bytes, type));
});
function fixture() {
  const state = {
    cover_path: `${eventId}/original.webp` as string | null,
    auth: true,
    denied: false,
    commitFailure: false,
    commitLostResponse: false,
    cleanupFailure: false,
    uploads: [] as string[],
    removed: [] as string[],
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  const db = createClient("https://test.supabase.co", "server-test-only", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const body =
          typeof init?.body === "string" ? JSON.parse(init.body) : {};
        if (url.pathname === "/auth/v1/user")
          return state.auth
            ? json({ id: actor, aud: "authenticated", role: "authenticated" })
            : json({ message: "Invalid token" }, 401);
        if (url.pathname.endsWith("/authorize_event_image"))
          return state.denied
            ? json({ message: "Forbidden" }, 403)
            : json({
                id: eventId,
                host_id: actor,
                cover_path: state.cover_path,
              });
        if (url.pathname.endsWith("/commit_event_image")) {
          if (state.commitFailure) return json({ message: "Conflict" }, 409);
          state.cover_path = body.p_path;
          return state.commitLostResponse
            ? json({ message: "Response interrupted" }, 503)
            : json({ cover_path: state.cover_path });
        }
        if (url.pathname === "/rest/v1/meetups")
          return json({ host_id: actor, cover_path: state.cover_path });
        if (url.pathname.startsWith("/storage/v1/object/event-covers/")) {
          state.uploads.push(
            decodeURIComponent(
              url.pathname.slice("/storage/v1/object/event-covers/".length),
            ),
          );
          return json({ Key: "test" });
        }
        if (url.pathname === "/storage/v1/object/event-covers") {
          if (state.cleanupFailure)
            return json({ message: "Unavailable" }, 503);
          state.removed.push(...body.prefixes);
          return json([]);
        }
        throw Error("Unexpected test endpoint");
      },
    },
  });
  const handler = eventImageHandler(() => db);
  async function request(
    action = "upload",
    previous: string | null = state.cover_path,
    path?: string,
  ) {
    const form = new FormData();
    form.set("event_id", eventId);
    form.set("action", action);
    form.set("previous", previous ?? "");
    if (action === "upload")
      form.set("file", new File([pixel], "test.png", { type: "image/png" }));
    if (path) form.set("path", path);
    return handler(
      new Request("https://local.test/event-image", {
        method: "POST",
        headers: { authorization: "Bearer test-user-token" },
        body: form,
      }),
    );
  }
  return { state, handler, request };
}
test("image endpoint rejects missing/invalid sessions and non-organisers before uploading", async () => {
  const { state, handler, request } = fixture();
  assert.equal(
    (await handler(new Request("https://local.test", { method: "POST" })))
      .status,
    401,
  );
  state.auth = false;
  assert.equal((await request()).status, 401);
  state.auth = true;
  state.denied = true;
  assert.equal((await request()).status, 403);
  assert.deepEqual(state.uploads, []);
});
test("image endpoint links before removing the original and rejects stale edits", async () => {
  const { state, request } = fixture();
  const original = state.cover_path;
  const response = await request();
  assert.equal(response.status, 200);
  assert.notEqual(state.cover_path, original);
  assert.deepEqual(state.removed, [original]);
  assert.equal((await request("upload", original)).status, 409);
  assert.equal(state.uploads.length, 1);
  assert.equal((await request("remove")).status, 200);
  assert.equal(state.cover_path, null);
});
test("failed linking removes only the unused upload; a lost committed response preserves the active image", async () => {
  const a = fixture();
  a.state.commitFailure = true;
  assert.equal((await a.request()).status, 409);
  assert.deepEqual(a.state.removed, a.state.uploads);
  const b = fixture();
  const original = b.state.cover_path;
  b.state.commitLostResponse = true;
  assert.equal((await b.request()).status, 200);
  assert.deepEqual(b.state.removed, [original]);
  assert.equal(b.state.cover_path, b.state.uploads[0]);
});
test("cleanup retries cannot delete an active image or cross into another event", async () => {
  const { state, request } = fixture();
  const original = state.cover_path;
  state.cleanupFailure = true;
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cleanupPath, original);
  state.cleanupFailure = false;
  assert.equal(
    (await request("cleanup", state.cover_path, state.cover_path!)).status,
    409,
  );
  assert.equal(
    (await request("cleanup", state.cover_path, `${actor}/wrong.webp`)).status,
    409,
  );
  assert.equal(
    (await request("cleanup", state.cover_path, original!)).status,
    200,
  );
});
