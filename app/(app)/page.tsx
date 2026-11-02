import { inArray, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { db } from "@/db";
import { fiche, ficheSet, subject } from "@/db/schema";
import { listSubjects } from "@/services/account";
import * as planner from "@/services/planner";
import { Button } from "@astryxdesign/core/Button";
import { DailyQueue, type QueueFicheInfo } from "@/components/daily-queue";
import { HorizonChart } from "@/components/horizon-chart";
import { deferAction, reorderAction, advanceFromBacklogAction } from "./planner-actions";

// Accueil = la file du jour (ARCHITECTURE.md v2 §3, USER_FLOW.md v2).

export default async function HomePage() {
  const userId = await requireUserId();

  const [anySet] = await db
    .select({ id: ficheSet.id })
    .from(ficheSet)
    .innerJoin(subject, eq(ficheSet.subjectId, subject.id))
    .where(eq(subject.userId, userId))
    .limit(1);

  if (!anySet) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Bienvenue</h1>
        <ol className="flex flex-col gap-2 text-left text-secondary">
          <li>1. Exporter un set de fiches depuis Google Docs (Fichier → Télécharger → Markdown)</li>
          <li>2. L&apos;importer ici</li>
          <li>3. Chaque jour : blurting, correction, note — le planificateur s&apos;occupe du rythme</li>
        </ol>
        <Button label="Importer un premier set de fiches" href="/importer" />
      </div>
    );
  }

  const [queue, horizon, subjects, nextDeadline, backlogCandidate] = await Promise.all([
    planner.todayQueue(userId),
    planner.horizon(userId),
    listSubjects(userId),
    planner.nextDeadline(userId),
    planner.nextBacklogCandidate(userId),
  ]);

  const ficheIds = [...new Set(queue.map((item) => (item.kind === "re_file" ? item.itemId : item.ficheId)))];
  const rows = ficheIds.length
    ? await db
        .select({
          id: fiche.id,
          numero: fiche.numero,
          titre: fiche.titre,
          setTitre: ficheSet.titre,
          subjectNom: subject.nom,
        })
        .from(fiche)
        .innerJoin(ficheSet, eq(fiche.setId, ficheSet.id))
        .innerJoin(subject, eq(ficheSet.subjectId, subject.id))
        .where(inArray(fiche.id, ficheIds))
    : [];
  const infoById = new Map<string, QueueFicheInfo>(rows.map(({ id, ...info }) => [id, info]));
  const subjectNomById = new Map(subjects.map((s) => [s.id, s.nom]));
  const keys = queue.map(planner.queueItemKey);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold">Aujourd&apos;hui</h1>
      <DailyQueue
        queue={queue}
        infoById={infoById}
        keys={keys}
        moveAction={reorderAction}
        deferAction={deferAction}
        nextDeadline={nextDeadline}
        backlogCandidate={backlogCandidate}
        advanceAction={advanceFromBacklogAction}
      />
      <HorizonChart horizon={horizon} subjectNomById={subjectNomById} />
    </div>
  );
}
