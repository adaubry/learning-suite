import { expect, test } from "@playwright/test";

test("une route protégée redirige vers /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
