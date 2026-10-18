import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interestError,
  normalizeInterests,
} from "../../src/features/profile/interests.ts";

test("interest normalization trims, deduplicates and keeps catalog spelling", () => {
  assert.deepEqual(
    normalizeInterests(
      [" Books ", "Gardening", "gardening", "", "coffee"],
      ["Books", "Coffee"],
    ),
    ["Books", "Gardening", "Coffee"],
  );
});

test("combined interests are bounded without truncating or losing custom entries", () => {
  assert.equal(
    interestError(Array.from({ length: 12 }, (_, i) => `Hobby ${i}`)),
    "",
  );
  assert.match(
    interestError(Array.from({ length: 13 }, (_, i) => `Hobby ${i}`)),
    /12 interests/,
  );
  assert.equal(interestError(["🌸".repeat(60)]), "");
  assert.match(interestError(["🌸".repeat(61)]), /60 characters/);
  assert.match(interestError(["Hidden\nline"]), /plain text/);
  const legacy = "Legacy, " + "x".repeat(70);
  assert.equal(interestError([legacy], [legacy]), "");
});
