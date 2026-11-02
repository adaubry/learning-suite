import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/server";

// Utilisé par tous les écrans et Server Actions authentifiés. `cache` : une seule
// lecture de session par requête, même si layout et page l'appellent tous deux.
export const requireUserId = cache(async () => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) redirect("/login");
  return result.user.id;
});
