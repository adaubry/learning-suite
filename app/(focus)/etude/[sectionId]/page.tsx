import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { section } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import { BlurtingEditor } from "@/components/blurting-editor";
import { CorrectionView } from "@/components/correction-view";
import { Button } from "@/components/ui/button";
import {
  submitBlurtingAction,
  retryCorrectionAction,
  retenterAction,
  revelerAction,
  abandonAction,
  terminerAction,
} from "./actions";

// P3 · É3.1/É3.2 (USER_FLOW, ARCHITECTURE §5 Machine B) — entrée temporaire par
// le curriculum (PLAN Bloc 5.1) : pas de Planificateur avant Phase 6.

export default async function EtudePage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const userId = await requireUserId();

  const sec = await db.query.section.findFirst({
    where: eq(section.id, sectionId),
    columns: { titre: true },
  });
  if (!sec) notFound();

  let cycle;
  try {
    cycle = await session.start(userId, sectionId);
  } catch (e) {
    const message =
      e instanceof session.SessionAlreadyOpenError
        ? "Une autre session d'étude est déjà ouverte — termine-la ou abandonne-la d'abord."
        : "Cette section n'est pas prête à être étudiée (rubrique non validée).";
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{sec.titre}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link href="/" className="self-start text-sm underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  if (cycle.etat === "blurting") {
    const tentative = await session.nextTentative(cycle.id);
    return (
      <div className="flex flex-1 flex-col gap-3">
        <BlurtingEditor
          sectionTitre={sec.titre}
          tentative={tentative}
          action={submitBlurtingAction.bind(null, cycle.id, sectionId)}
        />
        <form action={abandonAction.bind(null, cycle.id)}>
          <Button type="submit" variant="ghost" size="sm">
            Abandonner la tentative
          </Button>
        </form>
      </div>
    );
  }

  if (cycle.etat === "correction") {
    const current = await session.getCurrentCorrection(userId, cycle.id);

    if (current.status === "pending") {
      return (
        <div className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold">{sec.titre}</h1>
          <p className="text-sm text-destructive">
            La correction a échoué. Ta restitution est déjà sauvegardée.
          </p>
          <form action={retryCorrectionAction.bind(null, cycle.id, sectionId)}>
            <Button type="submit" size="sm">
              Relancer la correction
            </Button>
          </form>
        </div>
      );
    }

    return (
      <CorrectionView
        sectionTitre={sec.titre}
        tentative={current.tentative}
        verdict={current.verdict}
        diff={current.diff}
        erreursCandidates={current.erreursCandidates}
        divulgation={current.divulgation}
        retenterAction={retenterAction.bind(null, cycle.id)}
        revelerAction={revelerAction.bind(null, cycle.id)}
        terminerAction={terminerAction.bind(null, cycle.id)}
      />
    );
  }

  // feynman/bilan/clos : hors scope Bloc 5.2 (Phase 6/7)
  notFound();
}
