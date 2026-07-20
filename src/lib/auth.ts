import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/server";

// Utilisé par tous les Server Actions authentifiées (FUNCTIONS §4).
export async function requireUserId() {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) redirect("/login");
  return result.user.id;
}
