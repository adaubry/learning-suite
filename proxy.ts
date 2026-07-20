import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
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
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath =
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path)) ||
    // Dev-only : route gitignorée (app/(auth)/dev-session/), absente en prod —
    // ce garde reste inerte hors NODE_ENV=development.
    (process.env.NODE_ENV === "development" && request.nextUrl.pathname.startsWith("/dev-session"));

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
