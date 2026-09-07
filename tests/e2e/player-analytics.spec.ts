import { expect, test, type Page } from "@playwright/test";
import { DEMO_GROUP_ID, signInAsDemoPlayer } from "./demo-auth";

for (const width of [390, 430]) {
  test(`player analytics stays within the ${width}px mobile shell`, async ({ page }) => {
    const matchHistoryRequests: string[] = [];
    const exactHistoryRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/matches/history")) matchHistoryRequests.push(url);
      if (url.includes("/analytics/history")) exactHistoryRequests.push(url);
    });
    await page.setViewportSize({ width, height: 844 });
    await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
    await page.goto("/home");

    const analyticsLink = page.getByRole("link", { name: "View analytics for Wednesday Club Ladder" });
    await expect(analyticsLink).toBeVisible();
    await analyticsLink.click();

    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    await expect(page.locator("header").getByText("Alice Tan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(matchHistoryRequests).toHaveLength(0);
    expect(exactHistoryRequests).toHaveLength(0);

    const exactHistorySummary = page.getByText("Inspect exact matches", { exact: true });
    await expect(exactHistorySummary).toBeVisible();
    await exactHistorySummary.click();
    await expect.poll(() => exactHistoryRequests.length).toBe(1);
    const exactSelector = page.getByLabel("Inspect rating point");
    await expect(exactSelector).toBeVisible();
    expect(await exactSelector.locator("option").count()).toBeLessThanOrEqual(50);

    await page.getByRole("button", { name: "30 days" }).click();
    await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");

    const historySummary = page.getByText("Match history", { exact: true });
    const historyDetails = historySummary.locator("xpath=ancestor::details");
    await expect(historyDetails).not.toHaveAttribute("open", "");
    await historySummary.click();
    await expect(historyDetails).toHaveAttribute("open", "");
    await expect.poll(() => matchHistoryRequests.length).toBe(1);
    const historyRegion = page.getByRole("region", { name: "Alice Tan match history" });
    await expect(historyRegion).toBeVisible();
    await expect(historyRegion).toHaveCSS("overflow-y", "auto");

    const shellBox = await page.locator("main:visible > div").boundingBox();
    expect(shellBox?.width).toBeLessThanOrEqual(430);
    expect(shellBox?.width).toBeLessThanOrEqual(width);
    await expect(page.locator("nav:visible")).toBeVisible();
  });
}

test("embedded history contains only the viewed player's selected-group matches", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await submitSinglesMatch(page, "Alice Tan", "Bea Rivera", 21, 18);
  await submitSinglesMatch(page, "Alice Tan", "Cory Shah", 21, 16);

  await page.goto(`/groups/${DEMO_GROUP_ID}`);
  await page.getByText("Members (8)", { exact: true }).click();
  await page.getByRole("link", { name: "View analytics for Bea Rivera" }).click();
  await page.getByText("Match history", { exact: true }).click();

  const historyRegion = page.getByRole("region", { name: "Bea Rivera match history" });
  await expect(historyRegion.getByText("Alice Tan vs Bea Rivera").first()).toBeVisible();
  await expect(historyRegion.getByText("Alice Tan vs Cory Shah")).toHaveCount(0);
});

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

test("provisional rating marker uses secondary color without inheriting bold weight", async ({ page }) => {
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await page.goto(`/groups/${DEMO_GROUP_ID}`);
  await page.getByText("Members (8)", { exact: true }).click();

  const provisionalDescription = page.getByText(/, provisional rating$/).first();
  await expect(provisionalDescription).toBeAttached();
  const provisionalMarker = provisionalDescription
    .locator("..")
    .locator('span[aria-hidden="true"] > span');

  await expect(provisionalMarker).toHaveCSS("color", "rgb(111, 135, 126)");
  await expect(provisionalMarker).toHaveCSS("font-weight", "400");
});

async function submitSinglesMatch(
  page: Page,
  teamA: string,
  teamB: string,
  teamAScore: number,
  teamBScore: number,
) {
  await page.goto(`/groups/${DEMO_GROUP_ID}/matches/new`);
  await page.getByRole("button", { name: "singles" }).click();
  await page.getByLabel("Team A empty player slot 1").click();
  await page.getByRole("button", { name: `Select ${teamA}` }).click();
  await page.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await page.getByRole("button", { name: `Select ${teamB}` }).click();
  await page.getByRole("button", { name: "Add players" }).click();
  await page.getByLabel("Set 1 Team A score").fill(String(teamAScore));
  await page.getByLabel("Set 1 Team B score").fill(String(teamBScore));
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(
    page.getByText("Match saved. Ratings updated immediately. Participants and group admins have 30 days to correct it."),
  ).toBeVisible();
}
