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

  await signInAsDemoPlayer(bea, "bea@demo.matchrating.app");
  await bea.goto(`/groups/${DEMO_GROUP_ID}/members`);
  const aliceMemberRow = bea.getByRole("article").filter({ hasText: "Alice Tan" });
  await expect(aliceMemberRow).toBeVisible();
  const aliceRatingBefore = await aliceMemberRow.textContent();

  await alice.getByRole("button", { name: "Submit" }).click();
  await expect(alice.getByText("Match saved. Ratings updating…")).toBeVisible();

  await expect.poll(
    () => aliceMemberRow.textContent(),
    { timeout: 30_000, message: "the open members list should refresh after ratings finish" },
  ).not.toBe(aliceRatingBefore);

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

test("a participant resumes, edits, and submits another player's active draft from Home", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const coryContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const cory = await coryContext.newPage();

  await signInAsDemoPlayer(alice, "alice@demo.matchrating.app");
  await alice.goto(`/groups/${DEMO_GROUP_ID}/matches/new`);
  await alice.getByRole("button", { name: "singles" }).click();
  await alice.getByLabel("Team A empty player slot 1").click();
  await alice.getByRole("button", { name: "Select Alice Tan" }).click();
  await alice.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await alice.getByRole("button", { name: "Select Cory Shah" }).click();
  await alice.getByRole("button", { name: "Add players" }).click();
  await alice.getByLabel("Set 1 Team A score").fill("21");
  await alice.getByLabel("Set 1 Team B score").fill("18");
  await expect(alice.getByText("Draft saved.")).toBeVisible();

  await signInAsDemoPlayer(cory, "cory@demo.matchrating.app");
  await cory.goto("/home");
  await expect(cory.getByText("Alice Tan vs Cory Shah")).toBeVisible();
  const resumeLink = cory.getByRole("link", { name: "Resume recording" });
  const resumeHref = await resumeLink.getAttribute("href");
  expect(resumeHref).toMatch(
    new RegExp(`^/groups/${DEMO_GROUP_ID}/matches/new\\?draftId=[0-9a-f-]+$`),
  );

  await resumeLink.click();
  await expect(cory.getByLabel("Set 1 Team A score")).toHaveValue("21");
  await expect(cory.getByLabel("Set 1 Team B score")).toHaveValue("18");
  await cory.getByLabel("Set 1 Team B score").fill("19");
  await cory.getByRole("button", { name: "Submit" }).click();
  await expect(cory.getByText("Match saved. Ratings updating…")).toBeVisible();

  await cory.goto("/home");
  await expect(cory.locator(`a[href="${resumeHref}"]`)).toHaveCount(0);
  await alice.goto("/home");
  await expect(alice.locator(`a[href="${resumeHref}"]`)).toHaveCount(0);
  await expect(alice.getByRole("link", { name: /Alice def\. Cory/i }).first()).toBeVisible();

  await aliceContext.close();
  await coryContext.close();
});
