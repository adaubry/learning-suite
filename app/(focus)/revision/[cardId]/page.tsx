import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { section, reviewCard } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import * as review from "@/services/review";
import { BlurtingEditor } from "@/components/blurting-editor";
import { CorrectionView } from "@/components/correction-view";
import { Button } from "@astryxdesign/core/Button";
import { submitRevisionAction, retryCorrectionAction, rateRevisionAction, abandonAction } from "./actions";

// P4 · É4.1/É4.2 (USER_FLOW, ARCHITECTURE §6 Machine C) — atteint depuis la file
// du jour (PLAN Bloc 6.3, S5.todayQueue) via `[Commencer]` sur un item révision.
// `cardId` = section.id : ReviewCard est unique par section (contrainte DB),
// S4.start résout déjà tout par sectionId (tranché avec l'humain, récitation
// Bloc 6.4) — pas de jointure supplémentaire nécessaire.

export default async function RevisionPage({ params }: { params: Promise<{ cardId: string }> }) {
  const sectionId = (await params).cardId;
  const userId = await requireUserId();

  const sec = await db.query.section.findFirst({ where: eq(section.id, sectionId), columns: { titre: true } });
  if (!sec) notFound();

  const card = await db.query.reviewCard.findFirst({
    where: eq(reviewCard.sectionId, sectionId),
    columns: { reps: true },
  });

  let cycle;
  try {
    cycle = await session.start(userId, sectionId);
  } catch (e) {
    if (e instanceof session.SessionAlreadyOpenError) {
      const open = await session.findOpenCycle(userId);
      const resumeHref = open ? (open.type === "etude" ? `/etude/${open.sectionId}` : `/revision/${open.sectionId}`) : "/";
      return (
        <div className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold">{sec.titre}</h1>
          <p className="text-sm text-secondary">
            Une autre session est déjà ouverte{open ? ` (${open.sectionTitre})` : ""} — termine-la ou abandonne-la d&apos;abord.
          </p>
          <Link href={resumeHref} className="self-start text-sm underline">
            Reprendre cette session
          </Link>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{sec.titre}</h1>
        <p className="text-sm text-secondary">Cette section n&apos;est pas prête à être révisée.</p>
        <Link href="/" className="self-start text-sm underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  if (cycle.etat === "blurting") {
    const tentative = await session.nextTentative(cycle.id);
    return (
      <BlurtingEditor
        sectionTitre={sec.titre}
        tentative={tentative}
        type="revision"
        rappelNumero={(card?.reps ?? 0) + 1}
        action={submitRevisionAction.bind(null, cycle.id, sectionId)}
        abandonAction={abandonAction.bind(null, cycle.id)}
      />
    );
  }

  if (cycle.etat === "correction") {
    const current = await session.getCurrentCorrection(userId, cycle.id);

    if (current.status === "pending") {
      return (
        <div className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold">{sec.titre}</h1>
          <p className="text-sm text-error">
            La correction a échoué. Ta restitution est déjà sauvegardée.
          </p>
          <form action={retryCorrectionAction.bind(null, cycle.id, sectionId)}>
            <Button type="submit" size="sm" label="Relancer la correction" />
          </form>
        </div>
      );
    }

    const preview = await review.preview(userId, sectionId);

    return (
      <CorrectionView
        sectionTitre={sec.titre}
        tentative={current.tentative}
        verdict={current.verdict}
        diff={current.diff}
        erreursCandidates={current.erreursCandidates}
        divulgation={current.divulgation}
        mode="revision"
        ratingPreview={preview}
        rateAction={rateRevisionAction.bind(null, cycle.id)}
      />
    );
  }

  // feynman/bilan/clos : jamais en révision (ARCHITECTURE §6, pas de Feynman v1)
  notFound();
}
