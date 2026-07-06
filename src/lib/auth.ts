import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Utilisé par tous les Server Actions authentifiées (FUNCTIONS §4).
export async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}
