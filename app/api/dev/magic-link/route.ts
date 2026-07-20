import { NextResponse, type NextRequest } from "next/server";
import { findMagicLinkUrl } from "@/lib/better-auth/dev-magic-link";

// ponytail: remplace le Mailpit local de l'ancien stack Supabase — un e2e
// tracké (e2e/auth-flow.spec.ts) en dépend en CI, donc cette route reste
// commitée (contrairement à app/(auth)/dev-session/, gitignorée).
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email requis" }, { status: 400 });
  }

  for (let i = 0; i < 20; i++) {
    const url = await findMagicLinkUrl(email);
    if (url) return NextResponse.json({ url });
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({ error: "introuvable" }, { status: 404 });
}
