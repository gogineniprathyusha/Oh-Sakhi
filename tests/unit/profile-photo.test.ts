import test from "node:test";
import assert from "node:assert/strict";
import {
  isOwnedPhoto,
  MAX_AVATAR_BYTES,
  validatePhoto,
} from "../../src/features/profile/photo-file.ts";
const owner = "00000000-0000-4000-8000-000000000001";
test("profile photo uploads reject empty, oversized and unsupported files", async () => {
  for (const file of [
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large.jpg", {
      type: "image/jpeg",
    }),
    new File(["<svg/>"], "vector.svg", { type: "image/svg+xml" }),
  ])
    await assert.rejects(() => validatePhoto(file));
});
test("profile photo validation rejects forged MIME types and accepts supported raster signatures", async () => {
  await assert.rejects(
    () =>
      validatePhoto(
        new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "pretend.png", {
          type: "image/png",
        }),
      ),
    /image type/,
  );
  await validatePhoto(
    new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
      "photo.png",
      { type: "image/png" },
    ),
  );
  await validatePhoto(
    new File([new Uint8Array([255, 216, 255, 224])], "photo.jpg", {
      type: "image/jpeg",
    }),
  );
  await validatePhoto(
    new File(["RIFF0000WEBP"], "photo.webp", { type: "image/webp" }),
  );
});
test("profile photo paths are restricted to the member and one immutable filename", () => {
  assert.equal(isOwnedPhoto(owner, `${owner}/photo-123.webp`), true);
  for (const path of [
    `${owner}/../other.png`,
    `${owner}/nested/file.jpg`,
    `${owner}/photo.svg`,
    "someone-else/photo.png",
    `${owner}/photo.png?token=test`,
  ])
    assert.equal(isOwnedPhoto(owner, path), false);
});
