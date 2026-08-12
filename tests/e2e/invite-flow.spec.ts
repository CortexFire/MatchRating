import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { signInAsDemoPlayer } from "./demo-auth";

test.setTimeout(60_000);

async function createGroupAndInvite(page: Page, testInfo: TestInfo) {
  const groupName = `Invite E2E ${testInfo.project.name} ${Date.now()}`;

  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await page.goto("/groups/new");
  await page.getByLabel("Group name").fill(groupName);
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);

  const groupPath = new URL(page.url()).pathname;
  const groupId = groupPath.match(/^\/groups\/([0-9a-f-]{36})$/i)?.[1];
  if (!groupId) throw new Error(`Expected a new group URL, received ${page.url()}`);

  await page.getByText("Members (1)", { exact: true }).click();
  await page.getByRole("link", { name: "Invite members" }).click();
  await expect(page).toHaveURL(`/groups/${groupId}/invite`);

  const displayedInviteUrl = await page.getByLabel("Invite URL").inputValue();
  const inviteOrigin = new URL(page.url()).origin;
  const inviteUrl = new URL(
    /^https?:\/\//.test(displayedInviteUrl)
      ? displayedInviteUrl
      : `${new URL(inviteOrigin).protocol}//${displayedInviteUrl}`,
  );
  expect(inviteUrl.origin).toBe(inviteOrigin);
  expect(inviteUrl.pathname).toMatch(/^\/join\/[0-9a-f-]{36}$/i);

  return { groupId, groupName, inviteUrl };
}

test("a signed-out invitee sees a newly created group's required summary", async ({ browser }, testInfo) => {
  let aliceContext: BrowserContext | undefined;
  let signedOutContext: BrowserContext | undefined;

  try {
    aliceContext = await browser.newContext();
    const alice = await aliceContext.newPage();
    const { groupName, inviteUrl } = await createGroupAndInvite(alice, testInfo);

    signedOutContext = await browser.newContext();
    const signedOut = await signedOutContext.newPage();
    await signedOut.goto(inviteUrl.toString());
    await expect(signedOut.getByRole("heading", { name: groupName })).toBeVisible();
    await expect(signedOut.getByText("No matches yet", { exact: true })).toBeVisible();
    await expect(signedOut.getByText("1 player", { exact: true })).toBeVisible();
  } finally {
    await Promise.all([
      signedOutContext?.close(),
      aliceContext?.close(),
    ]);
  }
});

test("a demo player accepts a new group invite and sees the already-member state on revisit", async ({ browser }, testInfo) => {
  let aliceContext: BrowserContext | undefined;
  let beaContext: BrowserContext | undefined;

  try {
    aliceContext = await browser.newContext();
    const alice = await aliceContext.newPage();
    const { groupId, groupName, inviteUrl } = await createGroupAndInvite(alice, testInfo);

    beaContext = await browser.newContext();
    const bea = await beaContext.newPage();
    await signInAsDemoPlayer(bea, "bea@demo.matchrating.app");
    await bea.goto(inviteUrl.toString());
    await bea.getByRole("button", { name: "Accept" }).click();
    await expect(bea).toHaveURL(`/groups/${groupId}`);
    await expect(bea.getByRole("heading", { name: groupName })).toBeVisible();

    await bea.goto(inviteUrl.toString());
    await expect(bea.getByRole("heading", { name: "You're already in" })).toBeVisible();
    await expect(bea.getByRole("link", { name: "Ok" })).toHaveAttribute("href", `/groups/${groupId}`);
    await expect(bea.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await expect(bea.getByRole("button", { name: "No thanks" })).toHaveCount(0);
  } finally {
    await Promise.all([beaContext?.close(), aliceContext?.close()]);
  }
});
