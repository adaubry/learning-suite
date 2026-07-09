import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { inArray, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { chapter, subject, section } from "@/db/schema";
import { hasCompletedOnboarding, listSubjects } from "@/services/account";
import * as planner from "@/services/planner";
import * as guide from "@/services/guide";
import { Button } from "@/components/ui/button";
import { DailyQueue, type QueueSectionInfo } from "@/components/daily-queue";
import { HorizonChart } from "@/components/horizon-chart";
import { AttentionBadges } from "@/components/attention-badges";
import { deferAction, reorderAction } from "./planner-actions";

// É2.0 Accueil = Planificateur (ARCHITECTURE §3, USER_FLOW É2.0 ; PLAN Bloc 6.3)
// — remplace l'entrée temporaire par le curriculum (Phase 5).

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

  if (!anyChapter) {
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

  const [queue, horizon, badges, subjects] = await Promise.all([
    planner.todayQueue(user.id),
    planner.horizon(user.id),
    planner.attentionBadges(user.id),
    listSubjects(user.id),
  ]);

  // S3.lazyScheduler comme « hook de S5 » (FUNCTIONS §3, PLAN Bloc 6.4) : la
  // recomposition de la file du jour déclenche la pré-génération en tâche de
  // fond — après()/non bloquant, ne retarde jamais le rendu de l'accueil.
  // Appelé ici (pas dans le service S5 lui-même) : `after()` exige un contexte
  // de requête Next, absent des tests Vitest qui appellent `todayQueue`
  // directement (planner.test.ts).
  after(() => {
    guide.lazyScheduler(user.id).catch(() => {});
  });

  const sectionIds = [...new Set(queue.map((item) => (item.kind === "re_file" ? item.itemId : item.sectionId)))];
  const sectionRows = sectionIds.length
    ? await db
        .select({ id: section.id, titre: section.titre, subjectNom: subject.nom })
        .from(section)
        .innerJoin(chapter, eq(section.chapterId, chapter.id))
        .innerJoin(subject, eq(chapter.subjectId, subject.id))
        .where(inArray(section.id, sectionIds))
    : [];
  const infoById = new Map<string, QueueSectionInfo>(sectionRows.map((r) => [r.id, { titre: r.titre, subjectNom: r.subjectNom }]));
  const subjectNomById = new Map(subjects.map((s) => [s.id, s.nom]));
  const keys = queue.map(planner.queueItemKey);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <AttentionBadges badges={badges} />
      <h1 className="text-xl font-semibold">Aujourd&apos;hui</h1>
      <DailyQueue queue={queue} infoById={infoById} keys={keys} moveAction={reorderAction} deferAction={deferAction} />
      <HorizonChart horizon={horizon} subjectNomById={subjectNomById} />
    </div>
  );
}
