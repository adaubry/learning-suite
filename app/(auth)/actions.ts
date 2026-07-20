"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/server";

export async function signInWithMagicLink(
  _prevState: unknown,
  formData: FormData,
) {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { error: "Email requis." };
  }

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/" },
      headers: await headers(),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec de l'envoi." };
  }

  return { sent: true };
}

export async function signInWithGoogle() {
  const { url } = await auth.api.signInSocial({
    body: { provider: "google", callbackURL: "/" },
  });

  if (!url) {
    redirect("/login?error=oauth");
  }

  redirect(url);
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
