import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// P1 Import (É1.0–É1.2, USER_FLOW) — parcours réel du wizard sur un vrai
// chapitre (AGENTS.md §4 : pas de faux cours de droit). Pas @canary : dépend
// du login Mailpit, plus lent que les canaris déterministes du parseur.

const MAILPIT_URL = "http://127.0.0.1:54324";
const fixture = readFileSync(
  join(__dirname, "evals/fixtures/Introduction obli.md"),
  "utf8",
);

test("importer un vrai chapitre : upload, rapport, validation", async ({ page, request }) => {
  const email = `e2e-import-${Date.now()}@example.com`;

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

  // Onboarding minimal : une matière, le reste skippé.
  await page.getByLabel("Nom").fill("Droit civil");
  await page.getByLabel("Semestre").fill("S1");
  await page.getByRole("button", { name: "Ajouter une matière" }).dispatchEvent("click");
  await expect(page.getByText("Droit civil — S1")).toBeVisible();

  await page.getByRole("button", { name: "Suivant" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=2$/);
  await page.getByRole("button", { name: /passer/i }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=3$/);
  await page.getByRole("button", { name: "Passer" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=4$/);

  await page.getByRole("button", { name: "Terminer" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/importer");
  await expect(page.getByText("1. Destination")).toBeVisible();
  await page.getByLabel("Titre du chapitre").fill("Introduction au droit des obligations");
  await page.getByRole("button", { name: "Continuer" }).dispatchEvent("click");

  await expect(page.getByText("2. Import du Markdown")).toBeVisible();
  await page.getByPlaceholder(/colle ici/i).fill(fixture);
  await page.getByRole("button", { name: "Analyser" }).dispatchEvent("click");

  await expect(page.getByText("3. Rapport de validation")).toBeVisible();
  await expect(page.getByText("Aucune anomalie détectée.")).toBeVisible();
  // Surlignages gras/commentaires (U3) effectivement rendus depuis le vrai chapitre.
  await expect(page.locator("strong").first()).toBeVisible();
  await expect(page.locator("em").first()).toBeVisible();

  await page.getByRole("button", { name: "Valider l'import" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/curriculum$/);
  await expect(page.getByText("Introduction au droit des obligations")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();
});
