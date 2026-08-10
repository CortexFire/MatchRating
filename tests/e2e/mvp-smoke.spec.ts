import { expect, test } from "@playwright/test";
import { DEMO_GROUP_ID, signInAsDemoPlayer } from "./demo-auth";

test("authenticated demo player can view the current group and save a complete draft", async ({ page }) => {
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await expect(page).toHaveURL(new RegExp(`/groups/${DEMO_GROUP_ID}$`));
  await expect(page.getByRole("heading", { name: "Wednesday Club Ladder" })).toBeVisible();

  const bottomNav = page.getByRole("navigation");
  await expect(bottomNav.getByRole("link", { name: /home/i })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /record/i })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /groups/i })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /profile/i })).toHaveCount(0);
  await expect(bottomNav.getByRole("link", { name: /rank/i })).toHaveCount(0);
  await expect(bottomNav.getByRole("link", { name: /history/i })).toHaveCount(0);

  await page.goto(`/groups/${DEMO_GROUP_ID}/matches/new`);
  await page.getByRole("link", { name: /record/i }).click();
  await expect(page.getByRole("heading", { name: "Match Recording" })).toBeVisible();
  await page.getByRole("button", { name: "singles" }).click();
  await page.getByLabel("Team A empty player slot 1").click();
  await page.getByRole("button", { name: "Select Alice Tan" }).click();
  await page.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await page.getByRole("button", { name: "Select Bea Rivera" }).click();
  await page.getByRole("button", { name: "Add players" }).click();
  await page.getByLabel("Set 1 Team A score").fill("21");
  await page.getByLabel("Set 1 Team B score").fill("18");
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await page.goto(`/groups/${DEMO_GROUP_ID}/members`);
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toHaveCount(0);
  await page.getByRole("link", { name: /invite members/i }).click();
  await expect(page.getByRole("heading", { name: "Join Group" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toBeVisible();
});

test("members page links to a separate invite page", async ({ page }) => {
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await page.goto(`/groups/${DEMO_GROUP_ID}/members`);

  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toHaveCount(0);

  await page.getByRole("link", { name: /invite members/i }).click();

  await expect(page.getByRole("heading", { name: "Join Group" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toBeVisible();
});
