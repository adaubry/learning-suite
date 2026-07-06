import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { chapter, subject } from "@/db/schema";
import { hasCompletedOnboarding } from "@/services/account";
import { Button } from "@/components/ui/button";

// P2 Accueil = Planificateur (ARCHITECTURE §3) — hors scope, Phase 6. En
// attendant, état vide global (USER_FLOW P0) tant qu'aucun Chapter n'existe,
// sinon message d'attente (P1/import existe depuis le bloc 2.2).

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await hasCompletedOnboarding(user.id))) {
    redirect("/onboarding");
  }

  const [anyChapter] = await db
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(eq(subject.userId, user.id))
    .limit(1);

  if (anyChapter) {
    return <p>Planificateur — à construire (P2).</p>;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Bienvenue</h1>
      <ol className="flex flex-col gap-2 text-left text-muted-foreground">
        <li>1. Importer un chapitre depuis Google Docs</li>
        <li>2. Trier ses sections par importance</li>
        <li>3. Étudier — blurting puis Feynman</li>
      </ol>
      <Button nativeButton={false} render={<Link href="/importer" />}>
        Importer un chapitre
      </Button>
    </div>
  );
}
