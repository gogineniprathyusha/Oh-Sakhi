import { test, expect } from "@playwright/test";
import { openProfile, photoFile, profileMock } from "./helpers/profile.ts";
import { userId } from "./helpers/auth.ts";

test("member neighborhood and catalogue interests save and survive reload", async ({
  page,
}) => {
  const state = await profileMock(page);
  await openProfile(page);
  await expect(
    page.getByRole("checkbox", { name: "Books", exact: true }),
  ).toBeChecked();
  await page.getByLabel("Neighborhood (optional)").fill("Short Pump");
  await page.getByRole("checkbox", { name: "Coffee", exact: true }).check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("Profile saved");
  expect(state.member.neighborhood).toBe("Short Pump");
  expect(state.member.interests).toEqual(["Books", "Coffee"]);
  await page.reload();
  await page.locator('.sidebar [data-page="profile"]').click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel("Neighborhood (optional)")).toHaveValue(
    "Short Pump",
  );
  await expect(
    page.getByRole("checkbox", { name: "Coffee", exact: true }),
  ).toBeChecked();
});

test("a catalogue failure preserves saved interests while other fields remain editable", async ({
  page,
}) => {
  const state = await profileMock(page);
  state.flags.catalogFailure = true;
  await openProfile(page);
  await expect(page.getByRole("alert")).toContainText(
    "Your saved interests will be preserved",
  );
  await page.getByLabel("Neighborhood (optional)").fill("Museum District");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("Profile saved");
  expect(state.member.interests).toEqual(["Books"]);
});

test("interest choices can be retried and enforce twelve selections", async ({
  page,
}) => {
  const state = await profileMock(page);
  state.flags.catalogFailure = true;
  await openProfile(page);
  await expect(page.getByRole("alert")).toContainText(
    "Your saved interests will be preserved",
  );
  state.flags.catalogFailure = false;
  await page
    .getByRole("button", { name: "Retry interests", exact: true })
    .click();
  const choices = page.getByRole("checkbox");
  await expect(choices).toHaveCount(14);
  for (let index = 0; index < 14; index++)
    if (await choices.nth(index).isEnabled()) await choices.nth(index).check();
  await expect(page.locator(".interest-picker")).toContainText("12 selected");
  await expect(page.locator(".interest-picker input:disabled")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Books", exact: true }).uncheck();
  await expect(page.locator(".interest-picker input:disabled")).toHaveCount(0);
});

test("a rejected profile save retains unsaved form values and the saved profile", async ({
  page,
}) => {
  const state = await profileMock(page);
  await openProfile(page);
  state.flags.saveFailure = true;
  await page.getByLabel("Neighborhood (optional)").fill("Unsaved area");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("could not be saved");
  await expect(page.getByLabel("Neighborhood (optional)")).toHaveValue(
    "Unsaved area",
  );
  expect(state.member.neighborhood).toBe("West End");
});

test("photo upload, replacement, reload and removal use private owned objects", async ({
  page,
}) => {
  const state = await profileMock(page);
  await openProfile(page);
  await page.getByLabel("A little about you").fill("Keep this unsaved draft.");
  await page.getByRole("checkbox", { name: "Coffee", exact: true }).check();
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(page.locator("#top-avatar img")).toBeVisible();
  await expect(page.getByLabel("A little about you")).toHaveValue(
    "Keep this unsaved draft.",
  );
  await expect(
    page.getByRole("checkbox", { name: "Coffee", exact: true }),
  ).toBeChecked();
  const first = state.member.avatar_path!;
  expect(first).toMatch(new RegExp(`^${userId}/[a-z0-9-]+\\.webp$`));
  expect(state.files.get(first)?.bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(state.files.get(first)?.bytes.subarray(8, 12).toString()).toBe("WEBP");
  expect(await page.locator("#top-avatar img").getAttribute("src")).toMatch(
    /^blob:/,
  );
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(
    page.getByRole("button", { name: "Replace photo", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => state.member.avatar_path).not.toBe(first);
  const second = state.member.avatar_path!;
  await expect.poll(() => state.files.has(first)).toBe(false);
  expect(
    state.calls
      .filter((call) => call.action === "upload")
      .every((call) => call.upsert === "false"),
  ).toBe(true);
  expect(
    state.calls.findIndex(
      (call) => call.action === "delete" && call.path === first,
    ),
  ).toBeGreaterThan(
    state.calls.findIndex(
      (call) =>
        call.action === "profile" && call.values?.avatar_path === second,
    ),
  );
  await page.reload();
  await page.locator('.sidebar [data-page="profile"]').click();
  await expect(page.locator(".profile-heading img")).toBeVisible();
  expect(
    state.calls
      .filter((call) => call.action === "download")
      .every((call) => call.authorized),
  ).toBe(true);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.locator("#top-avatar img")).toHaveCount(0);
  expect(state.member.avatar_path).toBeNull();
  await expect.poll(() => state.files.size).toBe(0);
});

test("failed photo linking cleans the unused upload and preserves the current photo", async ({
  page,
}) => {
  const state = await profileMock(page, true);
  await openProfile(page);
  await expect(page.locator("#top-avatar img")).toBeVisible();
  const original = state.member.avatar_path;
  state.flags.linkFailure = true;
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(page.getByRole("alert")).toContainText(
    "Your photo could not be saved",
  );
  expect(state.member.avatar_path).toBe(original);
  expect([...state.files.keys()]).toEqual([original]);
  await expect(page.locator("#top-avatar img")).toBeVisible();
});

test("a photo changed in another tab is preserved when a stale replacement is rejected", async ({
  page,
}) => {
  const state = await profileMock(page, true);
  await openProfile(page);
  await expect(page.locator("#top-avatar img")).toBeVisible();
  const original = state.member.avatar_path!;
  const concurrent = `${userId}/another-tab.png`;
  state.files.set(concurrent, state.files.get(original)!);
  state.member.avatar_path = concurrent;
  state.files.delete(original);
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(page.getByRole("alert")).toContainText("reload and try again");
  expect(state.member.avatar_path).toBe(concurrent);
  expect([...state.files.keys()]).toEqual([concurrent]);
});

test("an interrupted response after the profile saved never deletes its active photo", async ({
  page,
}) => {
  const state = await profileMock(page, true);
  await openProfile(page);
  await expect(page.locator("#top-avatar img")).toBeVisible();
  const original = state.member.avatar_path!;
  state.flags.linkResponseFailure = true;
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(page.locator("#toast")).toHaveText("Profile photo saved");
  expect(state.member.avatar_path).not.toBe(original);
  expect([...state.files.keys()]).toEqual([state.member.avatar_path]);
  await expect(page.locator("#top-avatar img")).toBeVisible();
});

test("failed upload or invalid image never deletes an existing photo", async ({
  page,
}) => {
  const state = await profileMock(page, true);
  await openProfile(page);
  for (const file of [
    {
      name: "vector.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    },
    {
      name: "pretend.png",
      mimeType: "image/png",
      buffer: Buffer.from("<svg/>"),
    },
    {
      name: "corrupt.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
    },
  ]) {
    await page.getByLabel("Profile photo file").setInputFiles(file);
    await expect(page.getByRole("alert")).toBeVisible();
  }
  expect(state.calls.filter((call) => call.action === "upload")).toHaveLength(
    0,
  );
  state.flags.uploadFailure = true;
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(page.getByRole("alert")).toContainText("could not be uploaded");
  expect(state.files.size).toBe(1);
  expect(state.calls.filter((call) => call.action === "delete")).toHaveLength(
    0,
  );
});

test("failed old-photo cleanup can be retried without repeating an upload", async ({
  page,
}) => {
  const state = await profileMock(page, true);
  await openProfile(page);
  state.flags.deleteFailure = true;
  await page.getByLabel("Profile photo file").setInputFiles(photoFile);
  await expect(
    page.getByRole("button", { name: "Retry removal", exact: true }),
  ).toBeVisible();
  expect(state.files.size).toBe(2);
  state.flags.deleteFailure = false;
  await page
    .getByRole("button", { name: "Retry removal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry removal", exact: true }),
  ).toHaveCount(0);
  expect(state.files.size).toBe(1);
  expect(state.calls.filter((call) => call.action === "upload")).toHaveLength(
    1,
  );
});

test("logout revokes the local photo URL and clears the member identity", async ({
  page,
}) => {
  await profileMock(page, true);
  await openProfile(page);
  await expect(page.locator("#top-avatar img")).toBeVisible();
  const url = await page.locator("#top-avatar img").getAttribute("src");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in / Join", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#top-avatar img")).toHaveCount(0);
  expect(
    await page.evaluate(async (value) => {
      try {
        await fetch(value!);
        return true;
      } catch {
        return false;
      }
    }, url),
  ).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "blob:",
  );
});

for (const width of [320, 390])
  test(`profile choices and photo controls fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await profileMock(page, true);
    await page.goto("http://127.0.0.1:5184");
    await page.locator('.mobile-nav [data-page="profile"]').click();
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Books", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "test-results/profile-mobile.png",
        fullPage: true,
      });
  });
