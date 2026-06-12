import { expect, test } from "@playwright/test";

test("core mobile screens render and match entry validates locally", async ({ page }) => {
  await page.goto("/groups/demo");
  await expect(page.getByRole("heading", { name: "Alice Tan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current Games" })).toBeVisible();
  const bottomNav = page.getByRole("navigation");
  await expect(bottomNav.getByRole("link", { name: /home/i })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /record/i })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /profile/i })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /rank/i })).toHaveCount(0);
  await expect(bottomNav.getByRole("link", { name: /history/i })).toHaveCount(0);

  await page.getByRole("link", { name: /record/i }).click();
  await expect(page.getByRole("heading", { name: "Match Recording" })).toBeVisible();
  await page.getByRole("button", { name: /Set 1 Team B 18 Loss/i }).click();
  await expect(page.getByRole("button", { name: /Set 1 Team B 21 Win/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Set 1 Team A 18 Loss/i })).toBeVisible();
  await page.getByRole("button", { name: /add set/i }).click();
  await expect(page.getByText("Set 3")).toBeVisible();
  await page.getByRole("button", { name: /^submit$/i }).click();
  await expect(page.getByText(/Submitted\. Team/)).toBeVisible();

  await page.goto("/groups/demo/members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toHaveCount(0);
  await page.getByRole("link", { name: /invite members/i }).click();
  await expect(page.getByRole("heading", { name: "Join Group" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toBeVisible();
});

test("members page links to a separate invite page", async ({ page }) => {
  await page.goto("/groups/demo/members");

  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toHaveCount(0);

  await page.getByRole("link", { name: /invite members/i }).click();

  await expect(page.getByRole("heading", { name: "Join Group" })).toBeVisible();
  await expect(page.getByLabel("Invite URL")).toBeVisible();
});
