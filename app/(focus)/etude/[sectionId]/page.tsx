import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { section, reviewCard } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import * as account from "@/services/account";
import * as reviewService from "@/services/review";
import type { FeynmanBilan } from "@/services/session";
import { LectureView } from "@/components/lecture-view";
import { BlurtingEditor } from "@/components/blurting-editor";
import { CorrectionView } from "@/components/correction-view";
import { FeynmanChat } from "@/components/feynman-chat";
import { FeynmanReportView } from "@/components/feynman-report-view";
import { Button } from "@astryxdesign/core/Button";
import {
  terminerLectureAction,
  submitBlurtingAction,
  retryCorrectionAction,
  relireAction,
  abandonAction,
  passerFeynmanAction,
  transcribeAction,
  closeFeynmanAction,
  validerBilanAction,
  refaireFeynmanAction,
  revenirBlurtingAction,
} from "./actions";

// P3 · É3.0–É3.5 (USER_FLOW, ARCHITECTURE §5 Machine B, REVAMP v2 2026-07-15) —
// atteint depuis la file du jour (PLAN Bloc 6.3, S5.todayQueue) via `[Commencer]`.

export default async function EtudePage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const userId = await requireUserId();

  const sec = await db.query.section.findFirst({
    where: eq(section.id, sectionId),
    columns: { titre: true, contenu: true },
  });
  if (!sec) notFound();

  let cycle;
  try {
    cycle = await session.start(userId, sectionId);
  } catch (e) {
    if (e instanceof session.SessionAlreadyOpenError) {
      // Refuser une deuxième session est correct (une seule à la fois) — mais
      // laisser l'utilisateur sans accès à celle déjà ouverte l'est moins :
      // lien direct plutôt qu'un message qui l'oblige à la retrouver seul.
      const open = await session.findOpenCycle(userId);
      const resumeHref = open ? `/etude/${open.sectionId}` : "/";
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
        <p className="text-sm text-secondary">Cette section n&apos;est pas prête à être étudiée (rubrique non validée).</p>
        <Link href="/" className="self-start text-sm underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  if (cycle.etat === "lecture") {
    const { tentative } = await session.lectureContext(userId, cycle.id);
    return (
      <LectureView
        sectionTitre={sec.titre}
        contenu={sec.contenu}
        relecture={tentative === 2}
        action={terminerLectureAction.bind(null, cycle.id, sectionId)}
        abandonAction={abandonAction.bind(null, cycle.id)}
      />
    );
  }

  if (cycle.etat === "blurting") {
    const tentative = await session.nextTentative(cycle.id);
    // Badge cosmétique uniquement depuis la fusion Machine B/C (2026-07-15) :
    // `cycle.type` ne pilote plus aucun comportement, juste l'affichage.
    const card =
      cycle.type === "revision"
        ? await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, sectionId), columns: { reps: true } })
        : null;
    return (
      <BlurtingEditor
        sectionTitre={sec.titre}
        tentative={tentative}
        type={cycle.type}
        rappelNumero={card ? card.reps + 1 : undefined}
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
          <p className="text-sm text-error">
            La correction a échoué. Ta restitution est déjà sauvegardée.
          </p>
          <form action={retryCorrectionAction.bind(null, cycle.id, sectionId)}>
            <Button type="submit" size="sm" label="Relancer la correction" />
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
        relireAction={relireAction.bind(null, cycle.id, sectionId)}
        abandonAction={abandonAction.bind(null, cycle.id)}
        passerFeynmanAction={passerFeynmanAction.bind(null, cycle.id, sectionId)}
      />
    );
  }

  if (cycle.etat === "feynman") {
    const [historique, plannerConfig] = await Promise.all([
      session.feynmanHistorique(userId, cycle.id),
      account.getPlannerConfig(userId),
    ]);
    return (
      <FeynmanChat
        cycleId={cycle.id}
        sectionTitre={sec.titre}
        transcribeAction={transcribeAction}
        closeFeynmanAction={closeFeynmanAction.bind(null, cycle.id, sectionId)}
        initialMessages={historique}
        initialTtsActive={plannerConfig.ttsActive}
      />
    );
  }

  if (cycle.etat === "bilan") {
    const bilan = cycle.bilanFeynman as FeynmanBilan;
    // Fusion Machine B/C (2026-07-15) : l'auto-note FSRS est désormais la
    // condition de clôture de TOUT cycle — S6.preview fonctionne même sans
    // ReviewCard existante (1ʳᵉ validation, simule depuis un état neuf).
    const ratingPreview = await reviewService.preview(userId, sectionId);
    return (
      <FeynmanReportView
        sectionTitre={sec.titre}
        bilan={bilan}
        ratingPreview={ratingPreview}
        validerAction={validerBilanAction.bind(null, cycle.id, bilan.verdict !== "acquis")}
        refaireAction={refaireFeynmanAction.bind(null, cycle.id, sectionId)}
        revenirAction={revenirBlurtingAction.bind(null, cycle.id)}
      />
    );
  }

  // clos : ne devrait pas être atteignable ici (session.start reprend un cycle
  // ouvert ou en crée un nouveau, jamais un cycle clos).
  notFound();
}
