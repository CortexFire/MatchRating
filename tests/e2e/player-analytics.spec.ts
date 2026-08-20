import { expect, test } from "@playwright/test";
import { DEMO_GROUP_ID, signInAsDemoPlayer } from "./demo-auth";

for (const width of [390, 430]) {
  test(`player analytics stays within the ${width}px mobile shell`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
    await page.goto("/home");

    const analyticsLink = page.getByRole("link", { name: "View analytics for Wednesday Club Ladder" });
    await expect(analyticsLink).toBeVisible();
    await analyticsLink.click();

    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    await expect(page.locator("header").getByText("Alice Tan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "30 days" }).click();
    await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");

    const shellBox = await page.locator("main:visible > div").boundingBox();
    expect(shellBox?.width).toBeLessThanOrEqual(430);
    expect(shellBox?.width).toBeLessThanOrEqual(width);
    await expect(page.locator("nav:visible")).toBeVisible();
  });
}

test("group member links open personal and teammate analytics without a separate shortcut", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");

  await page.getByText("Members (8)", { exact: true }).click();
  await page.getByRole("link", { name: "View analytics for Bea Rivera" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.locator("header").getByText("Bea Rivera", { exact: true })).toBeVisible();

  await page.goto(`/groups/${DEMO_GROUP_ID}`);
  await page.getByText("Members (8)", { exact: true }).click();
  await page.getByRole("link", { name: "View analytics for Alice Tan" }).click();
  await expect(page.locator("header").getByText("Alice Tan", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /analytics shortcut/i })).toHaveCount(0);
});

test("rankings rows use the same player analytics destinations", async ({ page }) => {
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await page.goto(`/groups/${DEMO_GROUP_ID}/rankings`);

  await page.getByRole("link", { name: "View analytics for Cory Shah" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.locator("header").getByText("Cory Shah", { exact: true })).toBeVisible();
});
