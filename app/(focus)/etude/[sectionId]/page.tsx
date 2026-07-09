import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { section } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import type { FeynmanBilan } from "@/services/session";
import { BlurtingEditor } from "@/components/blurting-editor";
import { CorrectionView } from "@/components/correction-view";
import { FeynmanChat } from "@/components/feynman-chat";
import { FeynmanReportView } from "@/components/feynman-report-view";
import { Button } from "@/components/ui/button";
import {
  submitBlurtingAction,
  retryCorrectionAction,
  retenterAction,
  revelerAction,
  abandonAction,
  terminerAction,
  passerFeynmanAction,
  transcribeAction,
  closeFeynmanAction,
  validerBilanAction,
  refaireFeynmanAction,
  revenirBlurtingAction,
} from "./actions";

// P3 · É3.1–É3.4 (USER_FLOW, ARCHITECTURE §5 Machine B) — atteint depuis la
// file du jour (PLAN Bloc 6.3, S5.todayQueue) via `[Commencer]`.

export default async function EtudePage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const userId = await requireUserId();

  const sec = await db.query.section.findFirst({
    where: eq(section.id, sectionId),
    columns: { titre: true, importance: true },
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
      <BlurtingEditor
        sectionTitre={sec.titre}
        tentative={tentative}
        action={submitBlurtingAction.bind(null, cycle.id, sectionId)}
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
        importance={sec.importance}
        retenterAction={retenterAction.bind(null, cycle.id)}
        revelerAction={revelerAction.bind(null, cycle.id)}
        terminerAction={terminerAction.bind(null, cycle.id)}
        passerFeynmanAction={passerFeynmanAction.bind(null, cycle.id, sectionId)}
      />
    );
  }

  if (cycle.etat === "feynman") {
    return (
      <FeynmanChat
        cycleId={cycle.id}
        sectionTitre={sec.titre}
        transcribeAction={transcribeAction}
        closeFeynmanAction={closeFeynmanAction.bind(null, cycle.id, sectionId)}
      />
    );
  }

  if (cycle.etat === "bilan") {
    return (
      <FeynmanReportView
        sectionTitre={sec.titre}
        bilan={cycle.bilanFeynman as FeynmanBilan}
        validerAction={validerBilanAction.bind(null, cycle.id)}
        refaireAction={refaireFeynmanAction.bind(null, cycle.id, sectionId)}
        revenirAction={revenirBlurtingAction.bind(null, cycle.id)}
      />
    );
  }

  // clos : ne devrait pas être atteignable ici (session.start reprend un cycle
  // ouvert ou en crée un nouveau, jamais un cycle clos).
  notFound();
}
