import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // ponytail: sans timeout, un blip réseau Supabase bloque la requête
      // jusqu'à la limite de la fonction Vercel (5 min) au lieu d'échouer vite.
      global: {
        fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10_000) }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // ponytail: setAll appelé depuis un Server Component (lecture seule) ;
            // le middleware rafraîchit déjà la session, cet appel peut être ignoré.
          }
        },
      },
    },
  );
}
