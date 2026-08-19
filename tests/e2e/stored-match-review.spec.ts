import { expect, test } from "@playwright/test";
import { DEMO_GROUP_ID, signInAsDemoPlayer } from "./demo-auth";

test.setTimeout(60_000);

test("an owner submits off-team and an admin corrects the accepted result", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const beaContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bea = await beaContext.newPage();

  await signInAsDemoPlayer(alice, "alice@demo.matchrating.app");
  await alice.goto(`/groups/${DEMO_GROUP_ID}/matches/new`);
  await alice.getByRole("button", { name: "singles" }).click();
  await alice.getByLabel("Team A empty player slot 1").click();
  await alice.getByRole("button", { name: "Select Cory Shah" }).click();
  await alice.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await alice.getByRole("button", { name: "Select Dev Okafor" }).click();
  await alice.getByRole("button", { name: "Add players" }).click();
  await alice.getByLabel("Set 1 Team A score").fill("22");
  await alice.getByLabel("Set 1 Team B score").fill("20");
  await expect(alice.getByText("Draft saved.")).toBeVisible();

  await alice.getByRole("button", { name: "Submit" }).click();
  await expect(
    alice.getByText("Match saved. Ratings updated immediately. Participants and group admins have 30 days to correct it."),
  ).toBeVisible();

  await alice.goto(`/groups/${DEMO_GROUP_ID}/history`);
  const submittedMatch = alice
    .locator(`a[href^="/groups/${DEMO_GROUP_ID}/matches/"]`)
    .filter({ hasText: "Cory Shah vs Dev Okafor" })
    .filter({ hasText: "22-20" })
    .first();
  await expect(submittedMatch).toBeVisible();
  await expect(submittedMatch).toContainText("22-20");
  const matchPath = await submittedMatch.getAttribute("href");
  expect(matchPath).toMatch(new RegExp(`^/groups/${DEMO_GROUP_ID}/matches/[0-9a-f-]+$`));

  await signInAsDemoPlayer(bea, "bea@demo.matchrating.app");
  await bea.goto(matchPath!);
  await expect(bea.getByText("Accepted")).toBeVisible();
  await expect(bea.getByRole("button", { name: "Confirm" })).toHaveCount(0);
  await bea.getByRole("link", { name: "Correct result" }).click();
  await bea.getByLabel("Set 1 Team A score").fill("20");
  await bea.getByLabel("Set 1 Team B score").fill("22");
  await bea.getByRole("button", { name: "Submit" }).click();
  await expect(bea).toHaveURL(matchPath!);
  await expect(bea.getByText("Accepted")).toBeVisible();
  await expect(bea.getByRole("button", { name: "Confirm" })).toHaveCount(0);

  await alice.goto(`/groups/${DEMO_GROUP_ID}/history`);
  const historyMatch = alice.locator(`a:visible[href="${matchPath}"]`).first();
  await expect(historyMatch).toBeVisible();
  await expect(historyMatch.getByText("20-22")).toBeVisible();
  await expect(historyMatch).not.toContainText(/Awaiting review|Disputed/);

  await bea.goto("/matches/review");
  await expect(bea).toHaveURL(/\/matches\/history$/);

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
  await expect(
    cory.getByText("Match saved. Ratings updated immediately. Participants and group admins have 30 days to correct it."),
  ).toBeVisible();

  await cory.goto("/home");
  await expect(cory.locator(`a:visible[href="${resumeHref}"]`)).toHaveCount(0);
  await alice.goto("/home");
  await expect(alice.locator(`a:visible[href="${resumeHref}"]`)).toHaveCount(0);
  await expect(alice.getByRole("link", { name: /Alice def\. Cory/i }).first()).toBeVisible();

  await aliceContext.close();
  await coryContext.close();
});

test("synchronizes the newest partial draft before navigation and deletes it only when blank", async ({ page }) => {
  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await page.goto(`/groups/${DEMO_GROUP_ID}/matches/new`);
  await page.getByRole("button", { name: "singles" }).click();
  await page.getByLabel("Team A empty player slot 1").click();
  await page.getByRole("button", { name: "Select Alice Tan" }).click();
  await page.getByRole("button", { name: "Select Team B: Empty slot 1" }).click();
  await page.getByRole("button", { name: "Select Cory Shah" }).click();
  await page.getByRole("button", { name: "Add players" }).click();
  await page.getByLabel("Set 1 Team A score").fill("21");
  await page.getByLabel("Set 1 Team B score").fill("18");
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(
    `/groups/${DEMO_GROUP_ID}/matches/new\\?draftId=[0-9a-f-]+$`,
  ));
  const draftPath = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;

  await page.getByLabel("Set 1 Team B score").fill("19");
  await page.locator("nav:visible").getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Alice Tan vs Cory Shah")).toBeVisible();
  await expect(page.getByText("21-19")).toBeVisible();

  await page.locator(`a:visible[href="${draftPath}"]`).first().click();
  await page.getByLabel("Set 1 Team A score").fill("");
  await page.getByLabel("Set 1 Team B score").fill("");
  await page.locator("nav:visible").getByRole("link", { name: "Home" }).click();
  await expect(page.locator(`a:visible[href="${draftPath}"]`).first()).toBeVisible();
  await expect(page.getByText("Score pending")).toBeVisible();

  await page.locator(`a:visible[href="${draftPath}"]`).first().click();
  await expect(page.getByRole("heading", { name: "Match Recording" })).toBeVisible();
  await page.getByLabel("Remove Alice from Team A").click();
  await page.getByLabel("Remove Cory from Team B").click();
  await page.locator("nav:visible").getByRole("link", { name: "Home" }).click();
  await expect(page.locator(`a:visible[href="${draftPath}"]`)).toHaveCount(0);
});
