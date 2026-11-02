import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./login";

// Parcours v2 complet sur le vrai set de fiches de l'utilisateur (Semaine 1
// ADMIN) : matière → import (aperçu, 23 fiches) → curriculum → file du jour →
// lecture → puzzle → blurting → comparaison (cases) → note → retour à la file.

const fixture = readFileSync(join(__dirname, "evals/fixtures/Semaine 1 ADMIN.md"), "utf8");

test("importer un set de fiches puis ouvrir une session", async ({ page, request }) => {
  test.setTimeout(120_000);
  await login(page, request, `e2e-fiches-${Date.now()}@example.com`);

  await page.getByRole("link", { name: "Importer un premier set de fiches" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/importer$/);

  // Le déclencheur du Dialog n'agit qu'une fois la page hydratée (première
  // compilation de /importer en dev) : on reclique jusqu'à ce qu'il s'ouvre.
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await page.getByRole("button", { name: "Ajouter une matière" }).click();
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await dialog.getByLabel("Nom").fill("Droit administratif");
  await dialog.getByLabel("Semestre").fill("S3");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByLabel("Titre du set")).toBeVisible();

  await page.getByLabel("Titre du set").fill("Semaine 1 ADMIN");
  await page.getByLabel("Contenu Markdown").fill(fixture);
  await page.getByRole("button", { name: "Voir l'aperçu" }).dispatchEvent("click");
  await expect(page.getByText("Aperçu — 23 fiches")).toBeVisible();
  await expect(page.getByText("13. L’arrêt Cadot, aboutissement de la séparation", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Importer", exact: true }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/curriculum$/);
  await expect(page.getByText("Semaine 1 ADMIN", { exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("1. Les notions anciennes : bien commun et res publica", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Commencer" }).first().dispatchEvent("click");

  await expect(page.getByText("Lecture", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Origine" })).toBeVisible();
  await page.getByRole("button", { name: "Je suis prêt, je blurte" }).dispatchEvent("click");
  await expect(page.getByText(/Passage au blurting dans \d+s/)).toBeVisible();
  await page.getByRole("button", { name: "Passer maintenant" }).dispatchEvent("click");

  await expect(page.getByPlaceholder(/sans la regarder/)).toBeVisible();
  await expect(page.getByText("tentative n°1")).toBeVisible();

  await page.getByPlaceholder(/sans la regarder/).fill("Le droit administratif date du XIXe siècle ; bien commun et res publica.");
  await page.getByRole("button", { name: "Comparer avec la fiche" }).click();

  await expect(page.getByText("Coche ce que tu as restitué")).toBeVisible();
  await expect(page.getByText("Il manque un point essentiel")).toBeVisible();
  await page.getByRole("checkbox", { name: "Thèse" }).check();
  await expect(page.getByText("L'essentiel y est")).toBeVisible();

  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("2. De la remontrance à la séparation des pouvoirs : la résistance des parlements", { exact: true })).toBeVisible();
});
