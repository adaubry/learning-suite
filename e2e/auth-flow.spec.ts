import { expect, test } from "@playwright/test";

// ponytail: dispatchEvent("click") plutôt que .click() — le dev overlay de
// Next 16 (portail plein écran, invisible hors erreur) intercepte parfois les
// clics réels de Playwright ; dispatchEvent déclenche directement le handler.

test("créer un compte, se connecter, se déconnecter", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /recevoir un lien/i }).dispatchEvent("click");
  await expect(page.getByText(/lien envoyé/i)).toBeVisible();

  // app/api/dev/magic-link (dev/e2e uniquement, 404 en prod) capture le lien
  // en mémoire au lieu d'un vrai envoi — remplace le Mailpit de l'ancien stack Supabase.
  let verifyUrl = "";
  await expect(async () => {
    const res = await request.get(`/api/dev/magic-link?email=${encodeURIComponent(email)}`);
    const body = await res.json();
    expect(body.url).toBeTruthy();
    verifyUrl = body.url;
  }).toPass();

  await page.goto(verifyUrl);
  await expect(page).toHaveURL(/\/onboarding(\?step=1)?$/);

  // P0 É0.2 — première connexion : au moins une matière requise, le reste est skippable.
  await page.getByLabel("Nom").fill("Droit civil");
  await page.getByLabel("Semestre").fill("S1");
  await page.getByRole("button", { name: "Ajouter une matière" }).dispatchEvent("click");
  await expect(page.getByText("Droit civil — S1")).toBeVisible();

  // Suivant/Passer naviguent (Astryx Button href+as=Link, rôle "link" — DECISIONS.md
  // 2026-07-13/14 migration Astryx) ; Terminer/Ajouter une matière restent des <button> (soumission).
  await page.getByRole("link", { name: "Suivant" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=2$/);
  await page.getByRole("link", { name: /passer/i }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=3$/);
  await page.getByRole("link", { name: "Passer" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=4$/);

  await page.getByRole("button", { name: "Terminer" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Bienvenue")).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/login$/);
});
