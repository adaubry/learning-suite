import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Connexion par magic link en dev/e2e : app/api/dev/magic-link (404 en prod)
// capture le lien en mémoire au lieu d'un vrai envoi.
//
// ponytail: dispatchEvent("click") plutôt que .click() — le dev overlay de
// Next 16 (portail plein écran, invisible hors erreur) intercepte parfois les
// clics réels de Playwright ; dispatchEvent déclenche directement le handler.
export async function login(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /recevoir un lien/i }).dispatchEvent("click");
  await expect(page.getByText(/lien envoyé/i)).toBeVisible();

  let verifyUrl = "";
  await expect(async () => {
    const res = await request.get(`/api/dev/magic-link?email=${encodeURIComponent(email)}`);
    const body = await res.json();
    expect(body.url).toBeTruthy();
    verifyUrl = body.url;
  }).toPass();
  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/\/$/);
}
