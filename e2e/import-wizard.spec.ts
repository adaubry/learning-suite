import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// P1 Import (É1.0–É1.2, USER_FLOW) — parcours réel du wizard sur un vrai
// chapitre (AGENTS.md §4 : pas de faux cours de droit). Pas @canary : dépend
// du login (magic link dev), plus lent que les canaris déterministes du parseur.

const fixture = readFileSync(
  join(__dirname, "evals/fixtures/Introduction obli.md"),
  "utf8",
);

test("importer un vrai chapitre : upload, rapport, sectionnement, tri", async ({ page, request }) => {
  // L1 (sectionnement) n'est pas mocké au niveau réseau ici : `page.route`
  // n'intercepte que les requêtes du navigateur, pas le `fetch` serveur de L0
  // (server action). Ce test frappe donc le vrai modèle configuré en local —
  // observé jusqu'à ~4.4 min avec un modèle de raisonnement (DECISIONS.md,
  // bloc 3.3 : séparateur explicite du fait que PLAN §0.2 "LLM mocké au niveau
  // réseau" n'a pas de prise côté serveur pour l'instant, à construire si ce
  // test doit rester rapide/gratuit en CI).
  test.setTimeout(360_000);
  const email = `e2e-import-${Date.now()}@example.com`;

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

  // Onboarding minimal : une matière, le reste skippé.
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

  await expect(page.getByText("4. Sectionnement")).toBeVisible();
  await expect(page.getByRole("button", { name: "Passer au tri" })).toBeVisible({ timeout: 330_000 });

  await page.getByRole("button", { name: "Passer au tri" }).dispatchEvent("click");
  await expect(page.getByText("5. Tri des sections")).toBeVisible();
  await expect(page.getByText(/\d+ sections · \d+ exclues/)).toBeVisible();

  // U13 : fusionner la 2ᵉ section avec la 1ʳᵉ, vérifier que la liste se recompose.
  // (scope à "form li" : la sidebar U1 a elle aussi des <li>)
  const rows = page.locator("form li");
  const before = await rows.count();
  if (before > 1) {
    await rows.nth(1).getByRole("button", { name: "Fusionner avec la précédente" }).dispatchEvent("click");
    await expect(rows).toHaveCount(before - 1);
  }

  await page.getByRole("button", { name: "Terminer le tri" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/curriculum$/);
  await expect(page.getByText("Introduction au droit des obligations")).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();
});
