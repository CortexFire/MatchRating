import { expect, test, type Page } from "@playwright/test";

const groupId = "11111111-1111-4111-8111-111111111111";

test("records, corrects, confirms, and reads one stored match across two users", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const beaContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bea = await beaContext.newPage();

  await signInDemo(alice, "alice@demo.matchrating.app");
  await alice.goto(`/groups/${groupId}/matches/new`);
  await alice.getByRole("button", { name: "singles" }).click();
  await alice.getByLabel("Team A empty player slot 1").click();
  await alice.getByRole("button", { name: "Select Alice Tan" }).click();
  await alice.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await alice.getByRole("button", { name: "Select Bea Rivera" }).click();
  await alice.getByRole("button", { name: "Add players" }).click();
  await expect(alice.getByText("Draft saved.")).toBeVisible();
  await alice.getByRole("button", { name: "Submit" }).click();
  await expect(alice.getByText("Match saved. Ratings updating…")).toBeVisible();

  await signInDemo(bea, "bea@demo.matchrating.app");
  await bea.goto("/matches/review");
  await bea.getByRole("link", { name: /Alice def\. Bea/i }).first().click();
  const detailUrl = bea.url();
  const matchPath = new URL(detailUrl).pathname;
  await bea.getByRole("link", { name: "Dispute" }).click();
  await bea.getByRole("button", { name: "Mark Set 1 Team B as winner" }).click();
  await bea.getByRole("button", { name: "Submit" }).click();
  await expect(bea).toHaveURL(matchPath);

  await alice.goto("/matches/review");
  await alice.locator(`a[href="${matchPath}"]`).click();
  await alice.getByRole("button", { name: "Confirm" }).click();
  await expect(alice.getByText("Confirmed")).toBeVisible();

  await alice.goto(`/groups/${groupId}/history`);
  const historyMatch = alice.locator(`a[href="${matchPath}"]`);
  await expect(historyMatch).toBeVisible();
  await expect(historyMatch.getByText("Confirmed")).toBeVisible();

  await aliceContext.close();
  await beaContext.close();
});

async function signInDemo(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send one-time code" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
}
