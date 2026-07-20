import { sql } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/auth-schema";

// ponytail: pas de capture en mémoire — un état module-level n'est pas
// garanti partagé entre le bundle Server Action (signInWithMagicLink) et le
// bundle Route Handler (/api/dev/magic-link) sous le compilateur dev de
// Next.js (vérifié empiriquement : la capture en mémoire échouait de façon
// systématique entre les deux). Better-Auth persiste déjà le token dans
// `verification` avant même d'appeler `sendMagicLink` — on relit cette même
// source, partagée via la connexion DB unique (src/db/index.ts), au lieu de
// dupliquer l'état.
export async function findMagicLinkUrl(email: string): Promise<string | null> {
  const row = await db.query.verification.findFirst({
    where: sql`(${verification.value}::jsonb->>'email') = ${email}`,
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });
  if (!row) return null;

  const url = new URL("/api/auth/magic-link/verify", process.env.BETTER_AUTH_URL);
  url.searchParams.set("token", row.identifier);
  url.searchParams.set("callbackURL", "/");
  return url.toString();
}
