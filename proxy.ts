import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  const isPublicPath =
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path)) ||
    // Dev-only : routes gitignorées/absentes en prod (app/(auth)/dev-session/,
    // app/api/dev/) — ce garde reste inerte hors NODE_ENV=development.
    (process.env.NODE_ENV === "development" &&
      (request.nextUrl.pathname.startsWith("/dev-session") ||
        request.nextUrl.pathname.startsWith("/api/dev")));

  if (!sessionCookie && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
