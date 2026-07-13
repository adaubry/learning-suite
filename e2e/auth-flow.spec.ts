import { expect, test } from "@playwright/test";

// ponytail: Supabase local (Mailpit) capture les magic links sans envoi réel,
// ce qui permet d'automatiser le parcours complet sans compte email réel.
const MAILPIT_URL = "http://127.0.0.1:54324";

// ponytail: dispatchEvent("click") plutôt que .click() — le dev overlay de
// Next 16 (portail plein écran, invisible hors erreur) intercepte parfois les
// clics réels de Playwright ; dispatchEvent déclenche directement le handler.

test("créer un compte, se connecter, se déconnecter", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /recevoir un lien/i }).dispatchEvent("click");
  await expect(page.getByText(/lien envoyé/i)).toBeVisible();

  let messageId = "";
  await expect(async () => {
    const res = await request.get(`${MAILPIT_URL}/api/v1/messages`);
    const body = await res.json();
    const msg = body.messages.find(
      (m: { To: { Address: string }[] }) => m.To[0]?.Address === email,
    );
    expect(msg).toBeTruthy();
    messageId = msg.ID;
  }).toPass();

  const msgRes = await request.get(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const { HTML: html } = await msgRes.json();
  const [, verifyUrl] = html.match(/href="([^"]+)"/) as RegExpMatchArray;

  await page.goto(verifyUrl.replace(/&amp;/g, "&"));
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
