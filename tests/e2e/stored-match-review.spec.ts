import { expect, test } from "@playwright/test";
import { DEMO_GROUP_ID, signInAsDemoPlayer } from "./demo-auth";

test.setTimeout(60_000);

test("records, corrects, confirms, and reads one stored match across two users", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const beaContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bea = await beaContext.newPage();

  await signInAsDemoPlayer(alice, "alice@demo.matchrating.app");
  await alice.goto(`/groups/${DEMO_GROUP_ID}/matches/new`);
  await alice.getByRole("button", { name: "singles" }).click();
  await alice.getByLabel("Team A empty player slot 1").click();
  await alice.getByRole("button", { name: "Select Alice Tan" }).click();
  await alice.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await alice.getByRole("button", { name: "Select Bea Rivera" }).click();
  await alice.getByRole("button", { name: "Add players" }).click();
  await alice.getByLabel("Set 1 Team A score").fill("21");
  await alice.getByLabel("Set 1 Team B score").fill("18");
  await expect(alice.getByText("Draft saved.")).toBeVisible();
  await alice.getByRole("button", { name: "Submit" }).click();
  await expect(alice.getByText("Match saved. Ratings updating…")).toBeVisible();

  await signInAsDemoPlayer(bea, "bea@demo.matchrating.app");
  await bea.goto("/matches/review");
  await bea.getByRole("link", { name: /Alice def\. Bea/i }).first().click();
  await expect(bea).toHaveURL(new RegExp(`/groups/${DEMO_GROUP_ID}/matches/[^/]+$`));
  const detailUrl = bea.url();
  const matchPath = new URL(detailUrl).pathname;
  await bea.getByRole("link", { name: "Dispute" }).click();
  await bea.getByLabel("Set 1 Team A score").fill("18");
  await bea.getByLabel("Set 1 Team B score").fill("21");
  await bea.getByRole("button", { name: "Submit" }).click();
  await expect(bea).toHaveURL(matchPath);

  await alice.goto("/matches/review");
  await alice.locator(`a[href="${matchPath}"]`).click();
  await alice.getByRole("button", { name: "Confirm" }).click();
  await expect(alice.getByText("Confirmed")).toBeVisible();

  await alice.goto(`/groups/${DEMO_GROUP_ID}/history`);
  const historyMatch = alice.locator(`a[href="${matchPath}"]`);
  await expect(historyMatch).toBeVisible();
  await expect(historyMatch.getByText("Confirmed")).toBeVisible();

  await aliceContext.close();
  await beaContext.close();
});
