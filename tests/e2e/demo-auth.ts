import { expect, type Page } from "@playwright/test";

export const DEMO_GROUP_ID = "11111111-1111-4111-8111-111111111111";

export async function signInAsDemoPlayer(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send login link" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${DEMO_GROUP_ID}$`));
}
