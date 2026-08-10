# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mvp-smoke.spec.ts >> members page links to a separate invite page
- Location: tests\e2e\mvp-smoke.spec.ts:43:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Members' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Members' })

```

```yaml
- main:
  - heading "Badminton Rankings" [level=1]
  - paragraph: Track matches, confirm scores, and keep every group rating isolated.
  - button "Continue with Google"
  - text: or Email
  - textbox "Email":
    - /placeholder: you@example.com
  - button "Send one-time code"
  - paragraph: Use Google or request a one-time email code to sign in.
- alert
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("core mobile screens render and match entry validates locally", async ({ page }) => {
  4  |   await page.goto("/groups/demo");
  5  |   await expect(page.getByRole("heading", { name: "Alice Tan" })).toBeVisible();
  6  |   await expect(page.getByRole("heading", { name: "Active Match" })).toBeVisible();
  7  |   await expect(page.getByRole("heading", { name: "Pending Review" })).toBeVisible();
  8  |   await expect(page.getByText("Alice Tan & Cory Shah")).toBeVisible();
  9  |   await expect(page.getByText("Alice/Cory def. Bea/Dev")).toBeVisible();
  10 | 
  11 |   const bottomNav = page.getByRole("navigation");
  12 |   await expect(bottomNav.getByRole("link", { name: /home/i })).toBeVisible();
  13 |   await expect(bottomNav.getByRole("link", { name: /record/i })).toBeVisible();
  14 |   await expect(bottomNav.getByRole("link", { name: /members/i })).toBeVisible();
  15 |   await expect(bottomNav.getByRole("link", { name: /profile/i })).toHaveCount(0);
  16 |   await expect(bottomNav.getByRole("link", { name: /rank/i })).toHaveCount(0);
  17 |   await expect(bottomNav.getByRole("link", { name: /history/i })).toHaveCount(0);
  18 | 
  19 |   await page.getByLabel("Open profile").click();
  20 |   await expect(page).toHaveURL(/\/profile$/);
  21 |   await expect(page.getByRole("heading", { name: "Alice Tan" })).toBeVisible();
  22 |   await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  23 | 
  24 |   await page.goto("/groups/demo");
  25 |   await page.getByRole("link", { name: /record/i }).click();
  26 |   await expect(page.getByRole("heading", { name: "Match Recording" })).toBeVisible();
  27 |   await page.getByRole("button", { name: /Set 1 Team B 18 Loss/i }).click();
  28 |   await expect(page.getByRole("button", { name: /Set 1 Team B 21 Win/i })).toBeVisible();
  29 |   await expect(page.getByRole("button", { name: /Set 1 Team A 18 Loss/i })).toBeVisible();
  30 |   await page.getByRole("button", { name: /add set/i }).click();
  31 |   await expect(page.getByText("Set 3")).toBeVisible();
  32 |   await page.getByRole("button", { name: /^submit$/i }).click();
  33 |   await expect(page.getByText(/Submitted\. Team/)).toBeVisible();
  34 | 
  35 |   await page.goto("/groups/demo/members");
  36 |   await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  37 |   await expect(page.getByLabel("Invite URL")).toHaveCount(0);
  38 |   await page.getByRole("link", { name: /invite members/i }).click();
  39 |   await expect(page.getByRole("heading", { name: "Join Group" })).toBeVisible();
  40 |   await expect(page.getByLabel("Invite URL")).toBeVisible();
  41 | });
  42 | 
  43 | test("members page links to a separate invite page", async ({ page }) => {
  44 |   await page.goto("/groups/demo/members");
  45 | 
> 46 |   await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
     |                                                                ^ Error: expect(locator).toBeVisible() failed
  47 |   await expect(page.getByLabel("Invite URL")).toHaveCount(0);
  48 | 
  49 |   await page.getByRole("link", { name: /invite members/i }).click();
  50 | 
  51 |   await expect(page.getByRole("heading", { name: "Join Group" })).toBeVisible();
  52 |   await expect(page.getByLabel("Invite URL")).toBeVisible();
  53 | });
  54 | 
```