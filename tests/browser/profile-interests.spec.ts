import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { interests, openProfile, profileMock } from "./helpers/profile.ts";

test("longer legacy catalog interests remain editable alongside new custom names", async ({
  page,
}) => {
  const state = await profileMock(page);
  const legacy = "Legacy, " + "x".repeat(70);
  state.member.interests = ["Books", legacy];
  await page.route("**/rest/v1/interests?**", (route) =>
    route.fulfill({
      json: [...interests, { id: "legacy-long", name: legacy }],
    }),
  );
  await openProfile(page);
  await expect(
    page.getByRole("checkbox", { name: legacy, exact: true }),
  ).toBeChecked();
  await page.getByLabel("Other interests").fill("Gardening");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Saved interests" }).getByRole("listitem"),
  ).toHaveText(["Books", legacy, "Gardening"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("custom interests save as tags and reopen alongside checkboxes after reload", async ({
  page,
}, testInfo) => {
  const state = await profileMock(page);
  await openProfile(page);
  await page.getByRole("checkbox", { name: "Coffee", exact: true }).check();
  await page
    .getByLabel("Other interests")
    .fill(" Gardening, photography, Gardening, books ");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Saved interests" }).getByRole("listitem"),
  ).toHaveText(["Books", "Coffee", "Gardening", "photography"]);
  expect(state.member.interests).toEqual([
    "Books",
    "Coffee",
    "Gardening",
    "photography",
  ]);
  await expect(page.getByLabel("Other interests")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).include("#view").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("profile-summary.png"),
    fullPage: true,
  });
  await page.reload();
  await openProfile(page);
  await expect(page.getByLabel("Other interests")).toHaveValue(
    "Gardening, photography",
  );
  await expect(
    page.getByRole("checkbox", { name: "Coffee", exact: true }),
  ).toBeChecked();
  expect(
    (await new AxeBuilder({ page }).include("#view").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("profile-edit.png"),
    fullPage: true,
  });
  await page.getByLabel("Other interests").fill("Gardening");
  await page.getByRole("checkbox", { name: "Coffee", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Saved interests" }).getByRole("listitem"),
  ).toHaveText(["Books", "Gardening"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("custom text matches can be edited or unchecked without retaining a stale catalog choice", async ({
  page,
}) => {
  await profileMock(page);
  await openProfile(page);
  const custom = page.getByLabel("Other interests");
  const coffee = page.getByRole("checkbox", { name: "Coffee", exact: true });
  await custom.fill("Coffee");
  await expect(coffee).toBeChecked();
  await custom.fill("Coffee tasting");
  await expect(coffee).not.toBeChecked();
  await custom.fill("Coffee, Gardening");
  await coffee.uncheck();
  await expect(custom).toHaveValue(" Gardening");
  await expect(page.locator(".interest-picker")).toContainText("2 selected");
});

test("custom interests enforce the combined limit and retain drafts on rejected saves", async ({
  page,
}) => {
  const state = await profileMock(page);
  await openProfile(page);
  const custom = page.getByLabel("Other interests");
  await custom.fill(
    Array.from({ length: 12 }, (_, i) => `Custom ${i}`).join(", "),
  );
  await expect(page.locator(".interest-picker")).toContainText("13 selected");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  expect(state.calls.filter((call) => call.action === "profile")).toHaveLength(
    0,
  );
  await custom.fill("Gardening");
  state.flags.saveFailure = true;
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("could not be saved");
  await expect(custom).toHaveValue("Gardening");
  state.flags.saveFailure = false;
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  expect(state.member.interests).toEqual(["Books", "Gardening"]);
});

test("saved custom interests survive catalog failure and cancelling an edit", async ({
  page,
}) => {
  const state = await profileMock(page);
  state.member.interests = ["Books", "Gardening"];
  state.flags.catalogFailure = true;
  await openProfile(page);
  await expect(page.getByRole("alert")).toContainText(
    "Your saved interests will be preserved",
  );
  await page.getByLabel("City", { exact: true }).fill("Richmond City");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Saved interests" }),
  ).toContainText("Gardening");
  state.flags.catalogFailure = false;
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel("Other interests")).toHaveValue("Gardening");
  await page.getByLabel("Other interests").fill("Unsaved custom interest");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Saved interests" }),
  ).toContainText("Gardening");
  expect(state.member.interests).toEqual(["Books", "Gardening"]);
});
