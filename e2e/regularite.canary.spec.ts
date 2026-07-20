import { expect, test } from "@playwright/test";

function addDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// IMPLEMENT_SCHEDULE.md §9 point 8 : « J-3 → bannière → cocher → disparition »
// — critères d'acceptation §8.1 (cocher retire la deadline, undo) et §8.2
// (bannière persistante, survit au rechargement).
test("échéance examen coef>=2 à J-3 : bannière persistante, cocher la fait disparaître", async ({
  page,
  request,
}) => {
  const email = `e2e-regularite-${Date.now()}@example.com`;
  const libelle = `Test J-3 ${Date.now()}`;

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

  await page.getByLabel("Nom").fill("Droit civil");
  await page.getByLabel("Semestre").fill("S1");
  await page.getByRole("button", { name: "Ajouter une matière" }).dispatchEvent("click");
  await page.getByRole("link", { name: "Suivant" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=2$/);
  await page.getByRole("link", { name: /passer/i }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=3$/);
  await page.getByRole("link", { name: "Passer" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/onboarding\?step=4$/);
  await page.getByRole("button", { name: "Terminer" }).dispatchEvent("click");
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/regularite");
  await page.getByRole("button", { name: "Ajouter" }).dispatchEvent("click");
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Libellé").fill(libelle);
  await createDialog.getByRole("combobox", { name: "Date" }).fill(addDays(3));
  await createDialog.getByLabel("Coefficient").fill("2");
  await createDialog.getByRole("button", { name: "Créer" }).dispatchEvent("click");
  const deadlineRow = page.locator("li").filter({ hasText: libelle }).filter({ has: page.getByRole("checkbox") });
  await expect(deadlineRow).toBeVisible();

  // Bannière persistante, survit au rechargement (§8 critère 2).
  const banner = page.locator(".astryx-banner", { hasText: "Échéance dans 3 jours" });
  await page.reload();
  await expect(banner).toBeVisible();
  await page.reload();
  await expect(banner).toBeVisible();

  // Cocher : retire la deadline, dismisse la bannière (§8 critère 1).
  await deadlineRow.getByRole("checkbox").click();
  await expect(deadlineRow).toHaveCount(0);

  await page.reload();
  await expect(banner).toHaveCount(0);
});
