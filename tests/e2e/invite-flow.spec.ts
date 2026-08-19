import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { signInAsDemoPlayer } from "./demo-auth";

test.setTimeout(60_000);

const UUID_PATH_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const GROUP_URL_PATTERN = new RegExp(`/groups/${UUID_PATH_SEGMENT}$`, "i");
const GROUP_ID_PATH_PATTERN = new RegExp(`^/groups/(${UUID_PATH_SEGMENT})$`, "i");
const JOIN_URL_PATTERN = new RegExp(`^/join/${UUID_PATH_SEGMENT}$`, "i");

function projectContextOptions(testInfo: TestInfo): BrowserContextOptions {
  const projectUse = testInfo.project.use as typeof testInfo.project.use & Pick<BrowserContextOptions, "screen">;
  const { baseURL, viewport, screen, userAgent, deviceScaleFactor, isMobile, hasTouch } = projectUse;

  return { baseURL, viewport, screen, userAgent, deviceScaleFactor, isMobile, hasTouch };
}

function createProjectContext(browser: Browser, testInfo: TestInfo) {
  return browser.newContext(projectContextOptions(testInfo));
}

async function createGroupAndInvite(page: Page, testInfo: TestInfo) {
  const groupName = `Invite E2E ${testInfo.project.name} ${Date.now()}`;

  await signInAsDemoPlayer(page, "alice@demo.matchrating.app");
  await page.goto("/groups/new");
  await page.getByLabel("Group name").fill(groupName);
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(GROUP_URL_PATTERN);

  const groupPath = new URL(page.url()).pathname;
  const groupId = groupPath.match(GROUP_ID_PATH_PATTERN)?.[1];
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
  expect(inviteUrl.pathname).toMatch(JOIN_URL_PATTERN);

  return { groupId, groupName, inviteUrl };
}

async function expectProjectContext(page: Page, testInfo: TestInfo) {
  expect(page.viewportSize()).toEqual(testInfo.project.use.viewport ?? null);

  const projectUse = testInfo.project.use as typeof testInfo.project.use & Pick<BrowserContextOptions, "screen">;
  if (projectUse.screen) {
    expect(await page.evaluate(() => ({ width: window.screen.width, height: window.screen.height }))).toEqual(projectUse.screen);
  }

  if (testInfo.project.use.userAgent) {
    expect(await page.evaluate(() => navigator.userAgent)).toBe(testInfo.project.use.userAgent);
  }
}

test("a signed-out invitee sees a newly created group's required summary", async ({ browser }, testInfo) => {
  let aliceContext: BrowserContext | undefined;
  let signedOutContext: BrowserContext | undefined;

  try {
    aliceContext = await createProjectContext(browser, testInfo);
    const alice = await aliceContext.newPage();
    await expectProjectContext(alice, testInfo);
    const { groupName, inviteUrl } = await createGroupAndInvite(alice, testInfo);

    signedOutContext = await createProjectContext(browser, testInfo);
    const signedOut = await signedOutContext.newPage();
    await expectProjectContext(signedOut, testInfo);
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
    aliceContext = await createProjectContext(browser, testInfo);
    const alice = await aliceContext.newPage();
    await expectProjectContext(alice, testInfo);
    const { groupId, groupName, inviteUrl } = await createGroupAndInvite(alice, testInfo);

    beaContext = await createProjectContext(browser, testInfo);
    const bea = await beaContext.newPage();
    await expectProjectContext(bea, testInfo);
    await signInAsDemoPlayer(bea, "bea@demo.matchrating.app");
    await bea.goto(inviteUrl.toString());
    await expect(bea.getByRole("heading", { name: groupName })).toBeVisible();
    await bea.getByRole("button", { name: "Accept" }).click();
    await expect(bea).toHaveURL("/home");

    await bea.goto(inviteUrl.toString());
    await expect(bea.getByRole("heading", { name: "You're already in" })).toBeVisible();
    await expect(bea.getByRole("link", { name: "Ok" })).toHaveAttribute("href", `/groups/${groupId}`);
    await expect(bea.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await expect(bea.getByRole("button", { name: "No thanks" })).toHaveCount(0);
  } finally {
    await Promise.all([beaContext?.close(), aliceContext?.close()]);
  }
});
