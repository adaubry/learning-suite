import { expect, test } from "@playwright/test";

test("l'app démarre et /login s'affiche", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});
