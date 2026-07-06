import { expect, test } from "@playwright/test";

// ponytail: Supabase local (Mailpit) capture les magic links sans envoi réel,
// ce qui permet d'automatiser le parcours complet sans compte email réel.
const MAILPIT_URL = "http://127.0.0.1:54324";

test("créer un compte, se connecter, se déconnecter", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /recevoir un lien/i }).click();
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
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
