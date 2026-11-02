import { expect, test } from "@playwright/test";
import { login } from "./login";

test("créer un compte, se connecter, se déconnecter", async ({ page, request }) => {
  await login(page, request, `e2e-${Date.now()}@example.com`);
  await expect(page.getByText("Bienvenue")).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/login$/);
});
