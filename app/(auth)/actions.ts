"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function signInWithMagicLink(_prevState: unknown, formData: FormData) {
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return { error: "Email requis." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    return { error: error.message };
  }

  return { sent: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
